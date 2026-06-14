import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationReviewMessage,
  AssistantRuntimeProgressEvent,
  AppSettings,
  AssistantExecutionMode,
  ArticleRecord,
  Comment,
  LlmProvider,
  UiLanguage,
} from '@yomitomo/shared';
import type { NormalizedAiUsage } from '@yomitomo/ai';
import {
  makeId,
  normalizeAssistantExecutionMode,
  normalizeUiLanguage,
  resolveAgentPublicIdentity,
} from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import {
  createAgentTextStream,
  runAgentStreamIpc,
  type AgentStreamErrorEvent,
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
  type DistillationReviewRuntimeResult,
  type ThreadReplyRuntimeResult,
} from '../agents/agent-thread-runtime';
import { appendAgentRuntimeTrace } from '../agents/agent-runtime-trace-log';

export function registerAgentIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('agent:mention-route', async (_event, payload) => {
    const { planAgentMentionRoute } = await context.getAiModule();
    const { readAgentRuntimeContext } = await context.getStoreModule();
    const store = await readAgentRuntimeContext();
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
    const { readAgentRuntimeContext } = await context.getStoreModule();
    const store = await readAgentRuntimeContext();
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
        : await ai.runAgent(
            provider,
            agent,
            agentMessagePayloadWithReadingMemoryView({
              payload: payloadWithRoster,
              logInfo: context.logInfo,
              logError: context.logError,
            }),
          );
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
    const { readAgentRuntimeContext } = await context.getStoreModule();
    const store = await readAgentRuntimeContext();
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
    const { readAgentRuntimeContext } = await context.getStoreModule();
    const store = await readAgentRuntimeContext();
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
        : commentToDistillationReviewMessage(
            await ai.runAgent(
              provider,
              agent,
              agentMessagePayloadWithReadingMemoryView({
                payload: payloadWithRoster,
                logInfo: context.logInfo,
                logError: context.logError,
              }),
            ),
            payload.reviewMessageId,
          );
    if (!message.proposals?.length) {
      message.proposals = await extractDistillationReviewProposals({
        ai,
        provider,
        payload: payloadWithRoster,
        messageContent: message.content,
        logError: context.logError,
      });
    }
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
      const ai = await context.getAiModule();
      const { readAgentRuntimeContext } = await context.getStoreModule();
      const store = await readAgentRuntimeContext();
      const taskType = agentMessageRuntimeTaskType(input.payload);
      const agent = findCommentAgent(
        store.agents,
        input.payload.agentId,
        input.payload.agentUsername,
        input.payload.allowDisabledAgentForRule && taskType === 'thread_reply',
      );
      if (!agent) throw agentNotFoundError(input.payload.agentUsername);
      const provider = await taskProvider(
        context,
        store.providers,
        store.settings,
        providerTaskForAgent(agent),
      );
      const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
      const startedAt = performance.now();
      const comment: Comment = {
        id: makeId('comment'),
        author: 'ai',
        content: '',
        createdAt: new Date().toISOString(),
        agentId: agent.id,
        agentUsername: agent.username,
        agentNickname: agent.nickname,
        agentAvatar: agent.avatar,
        agentAnnotationColor: agent.annotationColor,
        replyTo: agentMessageReplyTo(input.payload),
        readingIntent: input.payload.readingIntent,
        pending: true,
      };
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
        const payloadWithMemory = agentMessagePayloadWithReadingMemoryView({
          payload: payloadWithRoster,
          logInfo: context.logInfo,
          logError: context.logError,
        });
        await ai.runAgentStream(provider, agent, payloadWithMemory, (delta) => {
          comment.content += delta;
          sender.send({ type: 'delta', delta });
        });
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
  );
  runAgentStreamIpc<AgentDistillationReviewPayload, AgentStreamDistillationReviewEvent>(
    'agent:distillation-review:stream',
    'AGENT_DISTILLATION_REVIEW_FAILED',
    async (input, sender) => {
      const ai = await context.getAiModule();
      const { readAgentRuntimeContext } = await context.getStoreModule();
      const store = await readAgentRuntimeContext();
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
              onRuntimeEvent: (runtimeEvent) => textStream.runtimeEvent(runtimeEvent),
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
        message.proposals = runtime.message.proposals || [];
      } else {
        const payloadWithMemory = agentMessagePayloadWithReadingMemoryView({
          payload: payloadWithRoster,
          logInfo: context.logInfo,
          logError: context.logError,
        });
        await ai.runAgentStream(provider, agent, payloadWithMemory, (delta) => {
          message.content += delta;
          sender.send({ type: 'delta', delta });
        });
        message.proposals = await extractDistillationReviewProposals({
          ai,
          provider,
          payload: payloadWithRoster,
          messageContent: message.content,
          logError: context.logError,
        });
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
  );
  handleDesktopIpc('agent:annotate', async (_event, payload) => {
    const ai = await context.getAiModule();
    const { readAgentRuntimeContext } = await context.getStoreModule();
    const store = await readAgentRuntimeContext();
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
      const { readAgentRuntimeContext } = await context.getStoreModule();
      const store = await readAgentRuntimeContext();
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
  );
  handleDesktopIpc('agent:save', async (_event, input) => {
    const { saveAgent } = await context.getStoreModule();
    const store = await saveAgent(input);
    return store;
  });
  handleDesktopIpc('agent:delete', async (_event, id) => {
    const { deleteAgent } = await context.getStoreModule();
    const store = await deleteAgent(id);
    return store;
  });
}

type ProviderTask = 'readingAssistant' | 'reviewAssistant';

type AgentStreamCommentEvent =
  | { type: 'start'; comment: Comment }
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
  | { type: 'done'; comment: Comment }
  | AgentStreamErrorEvent;

type AgentStreamDistillationReviewEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'delta'; delta: string }
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

const providerTaskSettings: Record<ProviderTask, keyof AppSettings> = {
  readingAssistant: 'readingAssistantProviderId',
  reviewAssistant: 'reviewAssistantProviderId',
};

async function taskProvider(
  context: DesktopMainIpcContext,
  providers: LlmProvider[],
  settings: AppSettings,
  task: ProviderTask,
): Promise<LlmProvider> {
  const providerId = settings[providerTaskSettings[task]] || settings.defaultProviderId;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) throw providerRouteRequiredError(task);
  const { hydrateProviderApiKey } = await context.getStoreModule();
  return hydrateProviderApiKey(provider);
}

function agentNotFoundError(username: string) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.agentNotFound,
    desktopIpcErrorCodes.agentNotFound,
    {
      detail: { username },
    },
  );
}

function reviewAgentNotFoundError(username: string) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.reviewAgentNotFound,
    desktopIpcErrorCodes.reviewAgentNotFound,
    { detail: { username } },
  );
}

function annotationAgentNotFoundError(username: string) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.annotationAgentNotFound,
    desktopIpcErrorCodes.annotationAgentNotFound,
    { detail: { username } },
  );
}

function providerRouteRequiredError(task: ProviderTask) {
  return new DesktopIpcError(
    desktopIpcErrorCodes.providerRouteRequired,
    desktopIpcErrorCodes.providerRouteRequired,
    { detail: { task } },
  );
}

function findAnnotationAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function findCommentAgent(
  agents: Agent[],
  agentId: string | undefined,
  username: string,
  includeDisabled = false,
) {
  return agents
    .filter((agent) => agent.enabled || (includeDisabled && agent.kind === 'annotation'))
    .find((agent) => agent.id === agentId || agent.username === username);
}

function findReviewAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'review' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function providerTaskForAgent(agent: Agent): ProviderTask {
  return agent.kind === 'review' ? 'reviewAssistant' : 'readingAssistant';
}

function agentMessageRuntimeTaskType(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought') return 'create_thought';
  if (payload.responseMode === 'distillation_review') return 'distillation_review';
  return 'thread_reply';
}

type AgentRuntimeTaskType = ReturnType<typeof agentMessageRuntimeTaskType>;

export function selectAgentRuntime(input: {
  requestedMode: AssistantExecutionMode;
  taskType: AgentRuntimeTaskType;
  supportedTaskTypes: AgentRuntimeTaskType[];
}) {
  if (input.requestedMode !== 'deep_verification') return null;
  return input.supportedTaskTypes.includes(input.taskType) ? input.taskType : null;
}

async function extractDistillationReviewProposals(input: {
  ai: Pick<typeof import('@yomitomo/ai'), 'callProviderText'>;
  provider: LlmProvider;
  payload: AgentMessagePayload;
  messageContent: string;
  logError: DesktopMainIpcContext['logError'];
}): Promise<AnnotationDistillationProposal[]> {
  if (!input.messageContent.trim()) return [];
  try {
    const raw = await input.ai.callProviderText(input.provider, {
      system: '你把沉淀审阅正文转换成可采纳的稿件修改建议。只返回 JSON，不要解释，不要 Markdown。',
      user: distillationProposalExtractionPrompt(input.payload, input.messageContent),
      maxTokens: 900,
      temperature: 0.2,
    });
    return normalizeDistillationProposalOutput(raw, input.payload.distillationReviewMode);
  } catch (error) {
    input.logError('agent.distillation_proposal_extract_failed', error, {
      articleId: input.payload.article.id,
      annotationId: input.payload.annotation.id,
      mode: input.payload.distillationReviewMode || 'review',
    });
    return [];
  }
}

function distillationProposalExtractionPrompt(
  payload: AgentMessagePayload,
  messageContent: string,
) {
  const mode = payload.distillationReviewMode || 'review';
  const discussion = payload.annotation.comments
    .filter((comment) => comment.content.trim())
    .map((comment) => `- ${comment.author}: ${comment.content}`)
    .join('\n');
  const modeRule =
    mode === 'organize_discussion'
      ? '本轮是整理讨论，只能输出 insert proposals。'
      : '本轮是审阅草稿，可以输出 insert、replace、delete proposals；没有明确目标时不要输出 replace/delete。';
  return `请从下面的审阅正文里提取可采纳的沉淀稿建议。

${modeRule}

返回 JSON 对象：
{
  "proposals": [
    {
      "kind": "insert" | "replace" | "delete",
      "title": "短标题",
      "rationale": "一句话理由，可省略",
      "content": "insert 的新增正文",
      "insertAfterText": "建议插入在哪段之后，可省略",
      "targetText": "replace/delete 的当前草稿目标文本",
      "replacementText": "replace 的替换正文"
    }
  ]
}

规则：
- insert 必须有 content，content 必须是可直接放入沉淀稿的正文，不是评价。
- replace 必须有 targetText 和 replacementText，targetText 必须来自当前草稿。
- delete 必须有 targetText，targetText 必须来自当前草稿。
- 如果只能给泛泛评价，返回 {"proposals":[]}。
- 删除和替换不能无依据改变用户观点。

用户高亮：
${payload.annotation.anchor.exact}

当前沉淀草稿或审阅指令：
${payload.instruction || '空'}

已有想法和讨论：
${discussion || '暂无'}

助手审阅正文：
${messageContent}`;
}

function normalizeDistillationProposalOutput(
  raw: string,
  mode: AgentMessagePayload['distillationReviewMode'],
): AnnotationDistillationProposal[] {
  const parsed = parseJsonObject(raw);
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  const now = new Date().toISOString();
  return proposals.flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const kind = proposalKind(record.kind);
    if (!kind || (mode === 'organize_discussion' && kind !== 'insert')) return [];
    const content = stringField(record.content);
    const targetText = stringField(record.targetText);
    const replacementText = stringField(record.replacementText);
    if (!validProposalFields(kind, content, targetText, replacementText)) return [];
    return [
      {
        id: makeId('distillation_proposal'),
        kind,
        status: 'pending' as const,
        title: stringField(record.title) || proposalTitle(kind, content, targetText, index),
        rationale: stringField(record.rationale) || undefined,
        insertAfterText: stringField(record.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
        updatedAt: now,
      },
    ];
  });
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }
}

function proposalKind(value: unknown): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function validProposalFields(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  replacementText: string,
) {
  if (kind === 'insert') return Boolean(content);
  if (kind === 'replace') return Boolean(targetText && replacementText);
  return Boolean(targetText);
}

function proposalTitle(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  index: number,
) {
  const text = kind === 'insert' ? content : targetText;
  const preview = text.length > 18 ? `${text.slice(0, 18)}...` : text;
  if (preview) return `${proposalKindLabel(kind)}：${preview}`;
  return `${proposalKindLabel(kind)}建议 ${index + 1}`;
}

function proposalKindLabel(kind: AnnotationDistillationProposalKind) {
  if (kind === 'insert') return '新增';
  if (kind === 'replace') return '修改';
  return '删除';
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function distillationReviewMessagePayload(
  payload: AgentDistillationReviewPayload,
  agents: Agent[],
  settings: AppSettings,
): AgentMessagePayload {
  return {
    ...payload,
    uiLanguage: normalizeUiLanguage(settings.uiLanguage),
    responseMode: 'distillation_review',
    agentRoster:
      payload.agentRoster || publicCommentAgents(agents, normalizeUiLanguage(settings.uiLanguage)),
  };
}

function messageWithReviewId(
  message: AnnotationDistillationReviewMessage,
  reviewMessageId: string | undefined,
) {
  return reviewMessageId ? { ...message, id: reviewMessageId } : message;
}

function commentToDistillationReviewMessage(
  comment: Comment,
  reviewMessageId: string | undefined,
): AnnotationDistillationReviewMessage {
  return {
    id: reviewMessageId || comment.id || makeId('distillation_review_message'),
    author: 'ai',
    content: comment.content,
    createdAt: comment.createdAt,
    agentId: comment.agentId,
    agentUsername: comment.agentUsername,
    agentNickname: comment.agentNickname,
    agentAvatar: comment.agentAvatar,
  };
}

function agentMessageReplyTo(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought' || payload.responseMode === 'distillation_review')
    return undefined;
  return payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id;
}

function logAgentMessageRuntime(
  context: DesktopMainIpcContext,
  result: ThreadReplyRuntimeResult | DistillationReviewRuntimeResult,
  provider: LlmProvider,
  agent: Agent,
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>,
  taskType: ReturnType<typeof agentMessageRuntimeTaskType>,
  durationMs?: number,
) {
  if (result.status === 'comment' || result.status === 'message') {
    context.logInfo(`assistant_runtime.${taskType}`, {
      status: result.status,
      stepCount: result.runtime.trace.steps.length,
      finalActionType: result.runtime.trace.finalActionType,
      repairUsed: result.runtime.repairUsed,
    });
    void appendAgentRuntimeTrace({
      taskType,
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      status: result.status === 'comment' ? 'comment' : 'result',
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      trace: result.runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType,
      requestedMode,
      effectiveMode: 'deep_verification',
      status: 'success',
      usage: result.runtime.trace.usage,
      durationMs,
      stepCount: result.runtime.trace.steps.length,
      traceJson: result.runtime.trace,
    });
    return;
  }
  context.logInfo(`assistant_runtime.${taskType}`, {
    status: 'fallback',
    failureReason: result.failureReason,
    stepCount: result.runtime?.trace.steps.length,
    finalActionType: result.runtime?.trace.finalActionType,
  });
  if (result.runtime) {
    void appendAgentRuntimeTrace({
      taskType,
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      status: 'fallback',
      failureReason: result.failureReason,
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      trace: result.runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType,
      requestedMode,
      effectiveMode: 'deep_verification',
      status: 'fallback',
      fallbackReason: result.failureReason,
      usage: result.runtime.trace.usage,
      durationMs,
      stepCount: result.runtime.trace.steps.length,
      traceJson: result.runtime.trace,
    });
  }
}

function recordAssistantExecutionRun(
  context: DesktopMainIpcContext,
  input: Parameters<(typeof import('../store/store'))['recordAssistantExecutionRun']>[0],
) {
  void context
    .getStoreModule()
    .then((storeModule) => storeModule.recordAssistantExecutionRun(input))
    .catch((error) => context.logError('assistant.execution_run_write_failed', error));
}

function annotateResultUsage(result: unknown): NormalizedAiUsage | undefined {
  if (!isRecord(result) || !isRecord(result.usage)) return undefined;
  return compactUsage({
    inputTokens: finiteNumber(result.usage.inputTokens),
    outputTokens: finiteNumber(result.usage.outputTokens),
    reasoningTokens: finiteNumber(result.usage.reasoningTokens),
    cachedInputTokens: finiteNumber(result.usage.cachedInputTokens),
    cacheWriteTokens: finiteNumber(result.usage.cacheWriteTokens),
    totalTokens: finiteNumber(result.usage.totalTokens),
  });
}

function compactUsage(usage: NormalizedAiUsage) {
  const compacted = Object.fromEntries(
    Object.entries(usage).filter(([, value]) => value !== undefined),
  ) as NormalizedAiUsage;
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicCommentAgents(agents: Agent[], uiLanguage: UiLanguage) {
  return agents
    .filter((agent) => agent.enabled)
    .map((agent) => resolveAgentPublicIdentity(agent, uiLanguage));
}
