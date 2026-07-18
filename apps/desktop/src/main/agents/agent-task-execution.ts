import type { AssistantRuntimeStreamEvent } from '@yomitomo/ai';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  AssistantRuntimeProgressEvent,
  AssistantRuntimeProgressSummary,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { makeId, normalizeAssistantExecutionMode, normalizeUiLanguage } from '@yomitomo/shared';
import type { DesktopAiModule, DesktopMainIpcContext } from '../ipc/ipc';
import { createAgentMessageReadingContextSnapshot } from '../assistant/assistant-reading-tools';
import { distillationReviewMessagePayload } from './agent-distillation-proposals';
import {
  annotateResultUsage,
  logAgentMessageRuntime,
  recordAssistantExecutionRun,
} from './agent-execution-recorder';
import {
  agentAnnotatePayloadWithReadingMemoryEntries,
  agentMessagePayloadWithReadingMemoryView,
  saveAgentAnnotateReadingMemoryEntries,
} from './agent-reading-memory';
import {
  agentMessageRuntimeTaskType,
  agentNotFoundError,
  annotationAgentNotFoundError,
  findAnnotationAgent,
  findCommentAgent,
  findReviewAgent,
  providerTaskForAgent,
  publicCommentAgents,
  reviewAgentNotFoundError,
  selectAgentRuntime,
  taskProvider,
  taskProviderRoute,
} from './agent-runtime-routing';
import {
  runAgentCreateThoughtWithToolLoop,
  runAgentDistillationReviewWithToolLoop,
  runAgentThreadReplyWithToolLoop,
  type DistillationReviewRuntimeResult,
  type ThreadReplyRuntimeResult,
} from './agent-thread-runtime';

const e2eFakeAgentProviderBaseUrl = 'https://e2e.invalid/yomitomo-ai';

type AgentTaskAiModule = Pick<
  DesktopAiModule,
  | 'buildAgentCreateThoughtRuntimePayload'
  | 'buildAgentDistillationReviewRuntimePayload'
  | 'buildAgentThreadReplyRuntimePayload'
  | 'runAgentAnnotateStream'
  | 'runAgentDistillationReviewStructuredStream'
  | 'runAgentStream'
  | 'runAssistantAiSdkToolRuntime'
>;

export type AgentTaskExecutionContext = Pick<
  DesktopMainIpcContext,
  'elapsedMs' | 'logError' | 'logInfo'
> & {
  getAiModule: () => Promise<AgentTaskAiModule>;
  getPersistenceModules: () => Promise<{
    providerRepository: Pick<
      typeof import('../providers/provider-repository'),
      'hydrateProviderApiKey'
    >;
    storeAgents: Pick<typeof import('../store/store-agents'), 'readAgentRuntimeContext'>;
    storeAssistantExecutions: Pick<
      typeof import('../store/store-assistant-executions'),
      'recordAssistantExecutionRun'
    >;
  }>;
};

export type AgentCommentExecutionEvent =
  | { type: 'start'; comment: Comment }
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent };

export type AgentDistillationReviewExecutionEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'delta'; delta: string }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent };

export type AgentAnnotationExecutionEvent =
  | { type: 'start' }
  | { type: 'item'; annotation: ArticleRecord['annotations'][number] };

export async function executeAgentCommentTask(
  context: AgentTaskExecutionContext,
  payload: AgentMessagePayload,
  emit: (event: AgentCommentExecutionEvent) => void,
): Promise<Comment> {
  const store = await readAgentRuntimeStore(context);
  const taskType = agentMessageRuntimeTaskType(payload);
  const agent = findCommentAgent(
    store.agents,
    payload.agentId,
    payload.agentUsername,
    payload.allowDisabledAgentForRule && taskType === 'thread_reply',
  );
  if (!agent) throw agentNotFoundError(payload.agentUsername);

  const comment = pendingAgentComment(agent, payload);
  const providerRoute = taskProviderRoute(
    store.providers,
    store.settings,
    providerTaskForAgent(agent),
  );
  if (isE2eFakeAgentProvider(providerRoute)) {
    emit({ type: 'start', comment });
    appendCommentText(comment, e2eFakeAgentCommentContent(payload), emit);
    return finalAgentComment(comment);
  }

  const ai = await context.getAiModule();
  const provider = await taskProvider(
    context,
    store.providers,
    store.settings,
    providerTaskForAgent(agent),
  );
  const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
  const startedAt = performance.now();
  const payloadWithRoster = {
    ...payload,
    uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
    agentRoster: publicCommentAgents(store.agents, normalizeUiLanguage(store.settings.uiLanguage)),
    readingIntent: payload.readingIntent || comment.readingIntent,
  };
  emit({ type: 'start', comment });
  const runtime = await runCommentRuntime({
    ai,
    provider,
    agent,
    payload: payloadWithRoster,
    requestedMode,
    taskType,
    onRuntimeEvent: (event) => applyRuntimeEvent(comment, event, emit),
  });
  logAgentMessageRuntime(
    context,
    runtime,
    provider,
    agent,
    requestedMode,
    taskType,
    context.elapsedMs(startedAt),
  );

  if (runtime.status === 'comment') {
    if (!comment.content) appendCommentText(comment, runtime.comment.content, emit);
    return finalAgentComment(comment);
  }

  const fastInput = agentMessageFastInput(context, payloadWithRoster, agent.id);
  await ai.runAgentStream(
    provider,
    agent,
    fastInput.payload,
    (delta) => appendCommentText(comment, delta, emit),
    fastInput.options,
  );
  recordFastExecution(
    context,
    agent,
    provider,
    taskType,
    requestedMode,
    runtime.failureReason,
    context.elapsedMs(startedAt),
  );
  return finalAgentComment(comment);
}

export async function executeAgentDistillationReviewTask(
  context: AgentTaskExecutionContext,
  payload: AgentDistillationReviewPayload,
  emit: (event: AgentDistillationReviewExecutionEvent) => void,
): Promise<AnnotationDistillationReviewMessage> {
  const ai = await context.getAiModule();
  const store = await readAgentRuntimeStore(context);
  const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
  if (!agent) throw reviewAgentNotFoundError(payload.agentUsername);
  const provider = await taskProvider(context, store.providers, store.settings, 'reviewAssistant');
  const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
  const startedAt = performance.now();
  const message = pendingDistillationReviewMessage(agent, payload);
  const payloadWithRoster = distillationReviewMessagePayload(payload, store.agents, store.settings);
  emit({ type: 'start', message });
  const runtime = await runDistillationReviewRuntime({
    ai,
    provider,
    agent,
    payload: payloadWithRoster,
    requestedMode,
    onRuntimeEvent: (event) => {
      if (event.type === 'distillation_review_item') {
        appendDistillationReviewItem(message, event.item);
        emit({ type: 'item', item: event.item });
        return;
      }
      applyRuntimeEvent(message, event, emit);
    },
  });
  logAgentMessageRuntime(
    context,
    runtime,
    provider,
    agent,
    requestedMode,
    'distillation_review',
    context.elapsedMs(startedAt),
  );

  if (runtime.status === 'message') {
    applyRuntimeDistillationReview(message, runtime.message, emit);
    return message;
  }

  const fastMessage = await structuredFastDistillationReview(
    context,
    ai,
    provider,
    agent,
    payloadWithRoster,
    (item) => {
      appendDistillationReviewItem(message, item);
      emit({ type: 'item', item });
    },
  );
  message.content = fastMessage.content;
  message.items = fastMessage.items || message.items || [];
  message.proposals = fastMessage.proposals || [];
  recordFastExecution(
    context,
    agent,
    provider,
    'distillation_review',
    requestedMode,
    runtime.failureReason,
    context.elapsedMs(startedAt),
  );
  return message;
}

export async function executeAgentAnnotationTask(
  context: AgentTaskExecutionContext,
  payload: AgentAnnotatePayload,
  emit: (event: AgentAnnotationExecutionEvent) => void,
): Promise<AgentAnnotateResult> {
  const ai = await context.getAiModule();
  const store = await readAgentRuntimeStore(context);
  const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
  if (!agent) throw annotationAgentNotFoundError(payload.agentUsername);
  const provider = await taskProvider(context, store.providers, store.settings, 'readingAssistant');
  const startedAt = performance.now();
  const annotations: ArticleRecord['annotations'] = [];
  emit({ type: 'start' });
  const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
    payload: {
      ...payload,
      uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
    },
    logInfo: context.logInfo,
    logError: context.logError,
  });
  const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
  const result = await ai.runAgentAnnotateStream(
    provider,
    agent,
    payloadWithMemory,
    (annotation) => {
      annotations.push(annotation);
      emit({ type: 'item', annotation });
    },
  );
  saveAgentAnnotateReadingMemoryEntries({
    agent,
    payload: payloadWithMemory,
    result,
    logError: context.logError,
  });
  recordFastExecution(
    context,
    agent,
    provider,
    'annotation',
    requestedMode,
    'annotation_runtime_not_applicable',
    context.elapsedMs(startedAt),
    annotateResultUsage(result),
  );
  return { annotations, readingMemory: result.readingMemory };
}

async function runCommentRuntime(input: {
  ai: AgentTaskAiModule;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>;
  taskType: ReturnType<typeof agentMessageRuntimeTaskType>;
  onRuntimeEvent: (event: AssistantRuntimeStreamEvent) => void;
}): Promise<ThreadReplyRuntimeResult> {
  const selectedRuntime = selectAgentRuntime({
    requestedMode: input.requestedMode,
    taskType: input.taskType,
    supportedTaskTypes: ['thread_reply', 'create_thought'],
  });
  if (selectedRuntime === 'thread_reply') {
    return runAgentThreadReplyWithToolLoop(input);
  }
  if (selectedRuntime === 'create_thought') {
    return runAgentCreateThoughtWithToolLoop(input);
  }
  return { status: 'fallback', failureReason: 'runtime_not_applicable' };
}

async function runDistillationReviewRuntime(input: {
  ai: AgentTaskAiModule;
  provider: LlmProvider;
  agent: Agent;
  payload: AgentMessagePayload;
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>;
  onRuntimeEvent: (event: AssistantRuntimeStreamEvent) => void;
}): Promise<DistillationReviewRuntimeResult> {
  const selectedRuntime = selectAgentRuntime({
    requestedMode: input.requestedMode,
    taskType: 'distillation_review',
    supportedTaskTypes: ['distillation_review'],
  });
  if (selectedRuntime === 'distillation_review') {
    return runAgentDistillationReviewWithToolLoop(input);
  }
  return { status: 'fallback', failureReason: 'runtime_not_applicable' };
}

function pendingAgentComment(agent: Agent, payload: AgentMessagePayload): Comment {
  return {
    id: makeId('comment'),
    author: 'ai',
    content: '',
    createdAt: new Date().toISOString(),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    replyTo: agentMessageReplyTo(payload),
    readingIntent: payload.readingIntent,
    pending: true,
  };
}

function pendingDistillationReviewMessage(
  agent: Agent,
  payload: AgentDistillationReviewPayload,
): AnnotationDistillationReviewMessage {
  return {
    id: payload.reviewMessageId || makeId('distillation_review_message'),
    author: 'ai',
    content: '',
    createdAt: new Date().toISOString(),
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
  };
}

function finalAgentComment(comment: Comment): Comment {
  return { ...comment, pending: false };
}

function appendCommentText(
  comment: Comment,
  delta: string,
  emit: (event: AgentCommentExecutionEvent) => void,
) {
  comment.content += delta;
  emit({ type: 'delta', delta });
}

function applyRuntimeDistillationReview(
  target: AnnotationDistillationReviewMessage,
  result: AnnotationDistillationReviewMessage,
  emit: (event: AgentDistillationReviewExecutionEvent) => void,
) {
  if (!target.content) {
    target.content = result.content;
    emit({ type: 'delta', delta: target.content });
  }
  target.items = result.items || target.items || [];
  target.proposals = result.proposals || [];
}

function appendDistillationReviewItem(
  message: AnnotationDistillationReviewMessage,
  item: AnnotationDistillationReviewItem,
) {
  message.items = [...(message.items || []), item];
  if (item.type === 'proposal') {
    message.proposals = [...(message.proposals || []), item.proposal];
  }
}

function applyRuntimeEvent(
  target: { content: string; assistantProgress?: AssistantRuntimeProgressSummary },
  event: AssistantRuntimeStreamEvent,
  emit: (
    event:
      | { type: 'delta'; delta: string }
      | { type: 'progress'; progress: AssistantRuntimeProgressEvent },
  ) => void,
) {
  if (event.type === 'text_delta') {
    target.content += event.delta;
    emit({ type: 'delta', delta: event.delta });
    return;
  }
  const progress = runtimeProgressEvent(event);
  if (!progress) return;
  applyRuntimeProgress(target, progress);
  emit({ type: 'progress', progress });
}

function runtimeProgressEvent(
  event: AssistantRuntimeStreamEvent,
): AssistantRuntimeProgressEvent | null {
  if (event.type === 'tool_call') {
    return {
      type: 'step',
      step: {
        id: event.toolName,
        label: event.toolName,
        status: 'active',
      },
    };
  }
  if (event.type === 'tool_result') {
    return {
      type: 'step',
      step: {
        id: event.toolName,
        label: event.toolName,
        status: event.ok ? 'done' : 'failed',
      },
    };
  }
  if (event.type === 'fallback') {
    return { type: 'fallback', message: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE' };
  }
  return null;
}

function applyRuntimeProgress(
  target: { assistantProgress?: AssistantRuntimeProgressSummary },
  event: AssistantRuntimeProgressEvent,
) {
  const current = target.assistantProgress || { steps: [] };
  if (event.type === 'fallback') {
    target.assistantProgress = { ...current, fallbackMessage: event.message };
    return;
  }
  const steps = current.steps.filter((step) => step.id !== event.step.id);
  target.assistantProgress = { ...current, steps: [...steps, event.step] };
}

async function structuredFastDistillationReview(
  context: AgentTaskExecutionContext,
  ai: Pick<AgentTaskAiModule, 'runAgentDistillationReviewStructuredStream'>,
  provider: LlmProvider,
  agent: Agent,
  payload: AgentMessagePayload,
  onItem: (item: AnnotationDistillationReviewItem) => void,
) {
  const fastInput = agentMessageFastInput(context, payload, agent.id);
  return ai.runAgentDistillationReviewStructuredStream(
    provider,
    agent,
    fastInput.payload,
    onItem,
    fastInput.options,
  );
}

async function readAgentRuntimeStore(context: AgentTaskExecutionContext) {
  const { storeAgents } = await context.getPersistenceModules();
  return storeAgents.readAgentRuntimeContext();
}

function agentMessageReplyTo(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought' || payload.responseMode === 'distillation_review') {
    return undefined;
  }
  return payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id;
}

function agentMessageFastInput(
  context: AgentTaskExecutionContext,
  payload: AgentMessagePayload,
  agentId: string,
) {
  const payloadWithMemory = agentMessagePayloadWithReadingMemoryView({
    payload,
    logInfo: context.logInfo,
    logError: context.logError,
  });
  return {
    payload: payloadWithMemory,
    options: {
      readingContext: safeAgentMessageReadingContextSnapshot(context, payload, agentId),
    },
  };
}

function safeAgentMessageReadingContextSnapshot(
  context: AgentTaskExecutionContext,
  payload: AgentMessagePayload,
  agentId: string,
) {
  try {
    return createAgentMessageReadingContextSnapshot({ payload, agentId });
  } catch (error) {
    context.logError('reading_context.snapshot_failed', error, {
      articleId: payload.article.id,
      agentId,
    });
    return undefined;
  }
}

function recordFastExecution(
  context: AgentTaskExecutionContext,
  agent: Agent,
  provider: LlmProvider,
  taskType: 'annotation' | ReturnType<typeof agentMessageRuntimeTaskType>,
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>,
  fallbackReason: string,
  durationMs: number,
  usage?: Parameters<typeof recordAssistantExecutionRun>[1]['usage'],
) {
  recordAssistantExecutionRun(context, {
    agent,
    provider,
    taskType,
    requestedMode,
    effectiveMode: 'fast_response',
    status: 'success',
    fallbackReason: requestedMode === 'deep_verification' ? fallbackReason : undefined,
    usage,
    durationMs,
  });
}

function isE2eFakeAgentProvider(provider: LlmProvider | undefined) {
  return process.env.YOMITOMO_E2E === '1' && provider?.baseUrl === e2eFakeAgentProviderBaseUrl;
}

function e2eFakeAgentCommentContent(payload: AgentMessagePayload) {
  const quote = payload.annotation.anchor.exact.trim() || payload.article.title;
  const question = payload.userComment.content.trim();
  return `RD-795 fake AI response.\nQuote: ${quote}\nQuestion: ${question}`;
}
