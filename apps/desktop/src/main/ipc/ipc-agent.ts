import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewItem,
  AssistantRuntimeProgressEvent,
  ArticleRecord,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { makeId, normalizeAssistantExecutionMode, normalizeUiLanguage } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { assertDesktopIpcAppLockUnlocked, handleDesktopIpc } from './ipc';
import {
  createAgentTextStream,
  runAgentStreamIpc,
  type AgentStreamErrorEvent,
  type AgentStreamSender,
} from './ipc-agent-stream';
import {
  agentAnnotatePayloadWithReadingMemoryEntries,
  agentMessagePayloadWithReadingMemoryView,
  saveAgentAnnotateReadingMemoryEntries,
} from '../agents/agent-reading-memory';
import {
  runAgentCreateThoughtWithToolLoop,
  runAgentDistillationReviewWithToolLoop,
  runAgentThreadReplyWithToolLoop,
} from '../agents/agent-thread-runtime';
import { createAgentMessageReadingContextSnapshot } from '../assistant/assistant-reading-tools';
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
} from '../agents/agent-runtime-routing';
import {
  distillationReviewMessagePayload,
  messageWithReviewId,
} from '../agents/agent-distillation-proposals';
import {
  annotateResultUsage,
  logAgentMessageRuntime,
  recordAssistantExecutionRun,
} from '../agents/agent-execution-recorder';

const e2eFakeAgentProviderBaseUrl = 'https://e2e.invalid/yomitomo-ai';

export function registerAgentIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('agent:mention-route', async (_event, payload) => {
    const { planAgentMentionRoute } = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    return planAgentMentionRoute(provider, payload);
  });
  handleDesktopIpc('agent:comment', async (_event, payload) => {
    const ai = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const taskType = agentMessageRuntimeTaskType(payload);
    const agent = findCommentAgent(
      store.agents,
      payload.agentId,
      payload.agentUsername,
      payload.allowDisabledAgentForRule && taskType === 'thread_reply',
    );
    if (!agent) throw agentNotFoundError(payload.agentUsername);
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
      agentRoster: publicCommentAgents(
        store.agents,
        normalizeUiLanguage(store.settings.uiLanguage),
      ),
    };
    const selectedRuntime = selectAgentRuntime({
      requestedMode,
      taskType,
      supportedTaskTypes: ['thread_reply', 'create_thought'],
    });
    const runtime =
      selectedRuntime === 'thread_reply'
        ? await runAgentThreadReplyWithToolLoop({
            ai,
            provider,
            agent,
            payload: payloadWithRoster,
          })
        : selectedRuntime === 'create_thought'
          ? await runAgentCreateThoughtWithToolLoop({
              ai,
              provider,
              agent,
              payload: payloadWithRoster,
            })
          : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
    logAgentMessageRuntime(
      context,
      runtime,
      provider,
      agent,
      requestedMode,
      taskType,
      context.elapsedMs(startedAt),
    );
    const comment =
      runtime.status === 'comment'
        ? runtime.comment
        : await runFastAgent(context, ai, provider, agent, payloadWithRoster);
    if (runtime.status !== 'comment') {
      recordAssistantExecutionRun(context, {
        agent,
        provider,
        taskType,
        requestedMode,
        effectiveMode: 'fast_response',
        status: 'success',
        fallbackReason: requestedMode === 'deep_verification' ? runtime.failureReason : undefined,
        durationMs: context.elapsedMs(startedAt),
      });
    }
    return {
      ...comment,
      id: makeId('comment'),
      replyTo: agentMessageReplyTo(payload),
      readingIntent: payload.readingIntent || comment.readingIntent,
    } satisfies Comment;
  });
  handleDesktopIpc('agent:review', async (_event, payload) => {
    const { runAgentReview } = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw reviewAgentNotFoundError(payload.agentUsername);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'reviewAssistant',
    );
    const comments = await runAgentReview(provider, agent, {
      ...payload,
      uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
      agentRoster: publicCommentAgents(
        store.agents,
        normalizeUiLanguage(store.settings.uiLanguage),
      ),
    });
    for (const comment of comments) {
      comment.id = makeId('comment');
    }
    return comments;
  });
  handleDesktopIpc('agent:distillation-review', async (_event, payload) => {
    const ai = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw reviewAgentNotFoundError(payload.agentUsername);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'reviewAssistant',
    );
    const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
    const startedAt = performance.now();
    const payloadWithRoster = distillationReviewMessagePayload(
      payload,
      store.agents,
      store.settings,
    );
    const selectedRuntime = selectAgentRuntime({
      requestedMode,
      taskType: 'distillation_review',
      supportedTaskTypes: ['distillation_review'],
    });
    const runtime =
      selectedRuntime === 'distillation_review'
        ? await runAgentDistillationReviewWithToolLoop({
            ai,
            provider,
            agent,
            payload: payloadWithRoster,
          })
        : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
    logAgentMessageRuntime(
      context,
      runtime,
      provider,
      agent,
      requestedMode,
      'distillation_review',
      context.elapsedMs(startedAt),
    );
    const message =
      runtime.status === 'message'
        ? runtime.message
        : await structuredFastDistillationReview(context, ai, provider, agent, payloadWithRoster);
    if (runtime.status !== 'message') {
      recordAssistantExecutionRun(context, {
        agent,
        provider,
        taskType: 'distillation_review',
        requestedMode,
        effectiveMode: 'fast_response',
        status: 'success',
        fallbackReason: requestedMode === 'deep_verification' ? runtime.failureReason : undefined,
        durationMs: context.elapsedMs(startedAt),
      });
    }
    return messageWithReviewId(message, payload.reviewMessageId);
  });
  runAgentStreamIpc<AgentMessagePayload, AgentStreamCommentEvent>(
    'agent:comment:stream',
    'AGENT_REPLY_FAILED',
    async (input, sender) => {
      const store = await readAgentRuntimeStore(context);
      const taskType = agentMessageRuntimeTaskType(input.payload);
      const agent = findCommentAgent(
        store.agents,
        input.payload.agentId,
        input.payload.agentUsername,
        input.payload.allowDisabledAgentForRule && taskType === 'thread_reply',
      );
      if (!agent) throw agentNotFoundError(input.payload.agentUsername);
      const providerRoute = taskProviderRoute(
        store.providers,
        store.settings,
        providerTaskForAgent(agent),
      );
      const comment = pendingAgentComment(agent, input.payload);
      if (sendE2eFakeAgentCommentStream(input.payload, sender, providerRoute, comment)) {
        return;
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
      sender.send({ type: 'start', comment });
      const payloadWithRoster = {
        ...input.payload,
        uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
        agentRoster: publicCommentAgents(
          store.agents,
          normalizeUiLanguage(store.settings.uiLanguage),
        ),
        readingIntent: input.payload.readingIntent || comment.readingIntent,
      };
      const textStream = createAgentTextStream(sender, comment);
      const selectedRuntime = selectAgentRuntime({
        requestedMode,
        taskType,
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      });
      const runtime =
        selectedRuntime === 'thread_reply'
          ? await runAgentThreadReplyWithToolLoop({
              ai,
              provider,
              agent,
              payload: payloadWithRoster,
              onRuntimeEvent: (runtimeEvent) => textStream.runtimeEvent(runtimeEvent),
            })
          : selectedRuntime === 'create_thought'
            ? await runAgentCreateThoughtWithToolLoop({
                ai,
                provider,
                agent,
                payload: payloadWithRoster,
                onRuntimeEvent: (runtimeEvent) => textStream.runtimeEvent(runtimeEvent),
              })
            : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
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
        if (!comment.content) {
          comment.content = runtime.comment.content;
          sender.send({ type: 'delta', delta: comment.content });
        }
      } else {
        const fastInput = agentMessageFastInput(context, payloadWithRoster, agent.id);
        await ai.runAgentStream(
          provider,
          agent,
          fastInput.payload,
          (delta) => {
            comment.content += delta;
            sender.send({ type: 'delta', delta });
          },
          fastInput.options,
        );
        recordAssistantExecutionRun(context, {
          agent,
          provider,
          taskType,
          requestedMode,
          effectiveMode: 'fast_response',
          status: 'success',
          fallbackReason: requestedMode === 'deep_verification' ? runtime.failureReason : undefined,
          durationMs: context.elapsedMs(startedAt),
        });
      }
      sender.send({
        type: 'done',
        comment: { ...comment, pending: false },
      });
    },
    () => assertDesktopIpcAppLockUnlocked(context),
  );
  runAgentStreamIpc<AgentDistillationReviewPayload, AgentStreamDistillationReviewEvent>(
    'agent:distillation-review:stream',
    'AGENT_DISTILLATION_REVIEW_FAILED',
    async (input, sender) => {
      const ai = await context.getAiModule();
      const store = await readAgentRuntimeStore(context);
      const agent = findReviewAgent(
        store.agents,
        input.payload.agentId,
        input.payload.agentUsername,
      );
      if (!agent) throw reviewAgentNotFoundError(input.payload.agentUsername);
      const provider = await taskProvider(
        context,
        store.providers,
        store.settings,
        'reviewAssistant',
      );
      const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
      const startedAt = performance.now();
      const message: AnnotationDistillationReviewMessage = {
        id: input.payload.reviewMessageId || makeId('distillation_review_message'),
        author: 'ai' as const,
        content: '',
        createdAt: new Date().toISOString(),
        agentId: agent.id,
        agentUsername: agent.username,
        agentNickname: agent.nickname,
        agentAvatar: agent.avatar,
      };
      sender.send({ type: 'start', message });
      const payloadWithRoster = distillationReviewMessagePayload(
        input.payload,
        store.agents,
        store.settings,
      );
      const textStream = createAgentTextStream(sender, message);
      const selectedRuntime = selectAgentRuntime({
        requestedMode,
        taskType: 'distillation_review',
        supportedTaskTypes: ['distillation_review'],
      });
      const runtime =
        selectedRuntime === 'distillation_review'
          ? await runAgentDistillationReviewWithToolLoop({
              ai,
              provider,
              agent,
              payload: payloadWithRoster,
              onRuntimeEvent: (runtimeEvent) => {
                if (runtimeEvent.type === 'distillation_review_item') {
                  appendDistillationReviewItem(message, runtimeEvent.item);
                  sender.send({ type: 'item', item: runtimeEvent.item });
                  return;
                }
                textStream.runtimeEvent(runtimeEvent);
              },
            })
          : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
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
        if (!message.content) {
          message.content = runtime.message.content;
          sender.send({ type: 'delta', delta: message.content });
        }
        message.items = runtime.message.items || message.items || [];
        message.proposals = runtime.message.proposals || [];
      } else {
        const fastMessage = await structuredFastDistillationReview(
          context,
          ai,
          provider,
          agent,
          payloadWithRoster,
          (item) => {
            appendDistillationReviewItem(message, item);
            sender.send({ type: 'item', item });
          },
        );
        message.content = fastMessage.content;
        message.items = fastMessage.items || message.items || [];
        message.proposals = fastMessage.proposals || [];
        recordAssistantExecutionRun(context, {
          agent,
          provider,
          taskType: 'distillation_review',
          requestedMode,
          effectiveMode: 'fast_response',
          status: 'success',
          fallbackReason: requestedMode === 'deep_verification' ? runtime.failureReason : undefined,
          durationMs: context.elapsedMs(startedAt),
        });
      }
      sender.send({
        type: 'done',
        message,
      });
    },
    () => assertDesktopIpcAppLockUnlocked(context),
  );
  handleDesktopIpc('agent:annotate', async (_event, payload) => {
    const ai = await context.getAiModule();
    const store = await readAgentRuntimeStore(context);
    const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw annotationAgentNotFoundError(payload.agentUsername);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    const startedAt = performance.now();
    const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: {
        ...payload,
        uiLanguage: normalizeUiLanguage(store.settings.uiLanguage),
      },
      logInfo: context.logInfo,
      logError: context.logError,
    });
    const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
    const result = await ai.runAgentAnnotateWithMemory(provider, agent, payloadWithMemory);
    saveAgentAnnotateReadingMemoryEntries({
      agent,
      payload: payloadWithMemory,
      result,
      logError: context.logError,
    });
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType: 'annotation',
      requestedMode,
      effectiveMode: requestedMode === 'deep_verification' ? 'fast_response' : requestedMode,
      status: 'success',
      fallbackReason:
        requestedMode === 'deep_verification' ? 'annotation_runtime_not_applicable' : undefined,
      durationMs: context.elapsedMs(startedAt),
    });
    return result;
  });
  runAgentStreamIpc<AgentAnnotatePayload, AgentStreamAnnotateEvent>(
    'agent:annotate:stream',
    'AGENT_ANNOTATION_FAILED',
    async (input, sender) => {
      const ai = await context.getAiModule();
      const store = await readAgentRuntimeStore(context);
      const agent = findAnnotationAgent(
        store.agents,
        input.payload.agentId,
        input.payload.agentUsername,
      );
      if (!agent) throw annotationAgentNotFoundError(input.payload.agentUsername);
      const provider = await taskProvider(
        context,
        store.providers,
        store.settings,
        'readingAssistant',
      );
      const startedAt = performance.now();
      const annotations: ArticleRecord['annotations'] = [];
      sender.send({ type: 'start' });
      const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
        payload: {
          ...input.payload,
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
          sender.send({ type: 'item', annotation });
        },
      );
      saveAgentAnnotateReadingMemoryEntries({
        agent,
        payload: payloadWithMemory,
        result,
        logError: context.logError,
      });
      recordAssistantExecutionRun(context, {
        agent,
        provider,
        taskType: 'annotation',
        requestedMode,
        effectiveMode: requestedMode === 'deep_verification' ? 'fast_response' : requestedMode,
        status: 'success',
        fallbackReason:
          requestedMode === 'deep_verification' ? 'annotation_runtime_not_applicable' : undefined,
        usage: annotateResultUsage(result),
        durationMs: context.elapsedMs(startedAt),
      });
      sender.send({
        type: 'done',
        annotations,
        readingMemory: result.readingMemory,
      });
    },
    () => assertDesktopIpcAppLockUnlocked(context),
  );
  handleDesktopIpc('agent:save', async (_event, input) => {
    const { agentRuntimePersistence } = await context.getPersistenceModule();
    const store = await agentRuntimePersistence.saveAgent(input);
    return store;
  });
  handleDesktopIpc('agent:delete', async (_event, id) => {
    const { agentRuntimePersistence } = await context.getPersistenceModule();
    const store = await agentRuntimePersistence.deleteAgent(id);
    return store;
  });
}

type AgentStreamCommentEvent =
  | { type: 'start'; comment: Comment }
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
  | { type: 'done'; comment: Comment }
  | AgentStreamErrorEvent;

type AgentStreamDistillationReviewEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'delta'; delta: string }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
  | { type: 'done'; message: AnnotationDistillationReviewMessage }
  | AgentStreamErrorEvent;

type AgentStreamAnnotateEvent =
  | { type: 'start' }
  | { type: 'item'; annotation: ArticleRecord['annotations'][number] }
  | {
      type: 'done';
      annotations: ArticleRecord['annotations'];
      readingMemory?: AgentAnnotateResult['readingMemory'];
    }
  | AgentStreamErrorEvent;

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

function sendE2eFakeAgentCommentStream(
  payload: AgentMessagePayload,
  sender: AgentStreamSender<AgentStreamCommentEvent>,
  provider: LlmProvider | undefined,
  comment: Comment,
) {
  if (process.env.YOMITOMO_E2E !== '1' || provider?.baseUrl !== e2eFakeAgentProviderBaseUrl) {
    return false;
  }

  const content = e2eFakeAgentCommentContent(payload);
  comment.content = content;
  sender.send({ type: 'start', comment });
  sender.send({ type: 'delta', delta: content });
  sender.send({
    type: 'done',
    comment: {
      ...comment,
      pending: false,
    },
  });
  return true;
}

function e2eFakeAgentCommentContent(payload: AgentMessagePayload) {
  const quote = payload.annotation.anchor.exact.trim() || payload.article.title;
  const question = payload.userComment.content.trim();
  return `RD-795 fake AI response.\nQuote: ${quote}\nQuestion: ${question}`;
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

async function structuredFastDistillationReview(
  context: DesktopMainIpcContext,
  ai: Pick<typeof import('@yomitomo/ai'), 'runAgentDistillationReviewStructuredStream'>,
  provider: LlmProvider,
  agent: Agent,
  payload: AgentMessagePayload,
  onItem: (item: AnnotationDistillationReviewItem) => void = () => undefined,
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

async function readAgentRuntimeStore(context: DesktopMainIpcContext) {
  const { agentRuntimePersistence } = await context.getPersistenceModule();
  return agentRuntimePersistence.readAgentRuntimeContext();
}

function agentMessageReplyTo(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought' || payload.responseMode === 'distillation_review')
    return undefined;
  return payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id;
}

function agentMessageFastInput(
  context: DesktopMainIpcContext,
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

async function runFastAgent(
  context: DesktopMainIpcContext,
  ai: Pick<Awaited<ReturnType<DesktopMainIpcContext['getAiModule']>>, 'runAgent'>,
  provider: LlmProvider,
  agent: Agent,
  payload: AgentMessagePayload,
) {
  const fastInput = agentMessageFastInput(context, payload, agent.id);
  return ai.runAgent(provider, agent, fastInput.payload, fastInput.options);
}

function safeAgentMessageReadingContextSnapshot(
  context: DesktopMainIpcContext,
  payload: AgentMessagePayload,
  agentId: string,
) {
  try {
    return createAgentMessageReadingContextSnapshot({
      payload,
      agentId,
    });
  } catch (error) {
    context.logError('reading_context.snapshot_failed', error, {
      articleId: payload.article.id,
      agentId,
    });
    return undefined;
  }
}
