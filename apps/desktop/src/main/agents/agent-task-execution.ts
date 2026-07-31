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
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { makeId, normalizeAssistantExecutionMode, normalizeUiLanguage } from '@yomitomo/shared';
import type { DesktopAiModule, DesktopMainIpcContext } from '../ipc/ipc';
import { createAgentMessageReadingContextSnapshot } from '../assistant/assistant-reading-tools';
import { distillationReviewMessagePayload } from './agent-distillation-proposals';
import {
  pendingAgentComment,
  pendingDistillationReviewMessage,
  reduceAssistantRuntimeEvent,
  type AgentRuntimeExecutionEvent,
} from './agent-execution-projection';
import { annotateResultUsage, type AssistantExecutionRecorder } from './agent-execution-recorder';
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
  runAgentMessageWithToolLoop,
  type DistillationReviewRuntimeResult,
  type ThreadReplyRuntimeResult,
} from './agent-message-runtime';

const e2eFakeAgentProviderBaseUrl = 'https://e2e.invalid/yomitomo-ai';

type AgentTaskAiModule = Pick<
  DesktopAiModule,
  | 'runAgentAnnotateStream'
  | 'runAgentDistillationReviewStructuredStream'
  | 'runAgentStream'
  | 'runAgentToolLoopTask'
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
  }>;
  recorder: AssistantExecutionRecorder;
};

export type AgentCommentExecutionEvent =
  | { type: 'start'; comment: Comment }
  | AgentRuntimeExecutionEvent;

export type AgentDistillationReviewExecutionEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | AgentRuntimeExecutionEvent;

export type AgentAnnotationExecutionEvent =
  | { type: 'start' }
  | { type: 'item'; annotation: ArticleRecord['annotations'][number] };

export async function executeAgentCommentTask(
  context: AgentTaskExecutionContext,
  payload: AgentMessagePayload,
  emit: (event: AgentCommentExecutionEvent) => void,
  signal?: AbortSignal,
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

  const comment = pendingAgentComment({
    agent,
    payload,
    id: makeId('comment'),
    createdAt: new Date().toISOString(),
  });
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
    signal,
    payload: payloadWithRoster,
    requestedMode,
    taskType,
    onRuntimeEvent: (event) => applyRuntimeEvent(comment, event, emit),
  });
  context.recorder.recordRuntimeExecution({
    result: runtime,
    provider,
    agent,
    requestedMode,
    taskType,
    durationMs: context.elapsedMs(startedAt),
  });

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
    { ...fastInput.options, signal },
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
  signal?: AbortSignal,
): Promise<AnnotationDistillationReviewMessage> {
  const ai = await context.getAiModule();
  const store = await readAgentRuntimeStore(context);
  const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
  if (!agent) throw reviewAgentNotFoundError(payload.agentUsername);
  const provider = await taskProvider(context, store.providers, store.settings, 'reviewAssistant');
  const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
  const startedAt = performance.now();
  const message = pendingDistillationReviewMessage({
    agent,
    payload,
    id: makeId('distillation_review_message'),
    createdAt: new Date().toISOString(),
  });
  const payloadWithRoster = distillationReviewMessagePayload(payload, store.agents, store.settings);
  emit({ type: 'start', message });
  const runtime = await runDistillationReviewRuntime({
    ai,
    provider,
    agent,
    signal,
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
  context.recorder.recordRuntimeExecution({
    result: runtime,
    provider,
    agent,
    requestedMode,
    taskType: 'distillation_review',
    durationMs: context.elapsedMs(startedAt),
  });

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
  signal?: AbortSignal,
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
    signal,
  );
  // A cancelled task must not leave reading memory behind for work the user abandoned.
  if (signal?.aborted) throw new Error('AGENT_TASK_CANCELLED');
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
  signal?: AbortSignal;
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
  if (selectedRuntime) return runAgentMessageWithToolLoop({ ...input, taskType: selectedRuntime });
  return { status: 'fallback', failureReason: 'runtime_not_applicable' };
}

async function runDistillationReviewRuntime(input: {
  ai: AgentTaskAiModule;
  provider: LlmProvider;
  agent: Agent;
  signal?: AbortSignal;
  payload: AgentMessagePayload;
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>;
  onRuntimeEvent: (event: AssistantRuntimeStreamEvent) => void;
}): Promise<DistillationReviewRuntimeResult> {
  const selectedRuntime = selectAgentRuntime({
    requestedMode: input.requestedMode,
    taskType: 'distillation_review',
    supportedTaskTypes: ['distillation_review'],
  });
  if (selectedRuntime) return runAgentMessageWithToolLoop({ ...input, taskType: selectedRuntime });
  return { status: 'fallback', failureReason: 'runtime_not_applicable' };
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
  target: { content: string; assistantProgress?: Comment['assistantProgress'] },
  event: AssistantRuntimeStreamEvent,
  emit: (event: { type: 'delta'; delta: string } | AgentRuntimeExecutionEvent) => void,
) {
  const projection = reduceAssistantRuntimeEvent(target, event);
  Object.assign(target, projection.state);
  if (projection.emitted) emit(projection.emitted);
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
  usage?: Parameters<AssistantExecutionRecorder['recordFastExecution']>[0]['usage'],
) {
  context.recorder.recordFastExecution({
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
