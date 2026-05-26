import { ipcMain } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  AppSettings,
  ArticleRecord,
  Comment,
  LlmProvider,
} from '@yomitomo/shared';
import { agentPersonalityName, makeId } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import {
  agentAnnotatePayloadWithReadingMemoryEntries,
  agentMessagePayloadWithReadingMemoryView,
  saveAgentAnnotateReadingMemoryEntries,
} from './agent-reading-memory';
import {
  runAgentThreadReplyWithToolLoop,
  type ThreadReplyRuntimeResult,
} from './agent-thread-runtime';

export function registerAgentIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('annotation:metadata', async (_event, payload) => {
    const { inferAnnotationMetadata } = await context.getAiModule();
    const { readStore } = await context.getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    return inferAnnotationMetadata(provider, payload);
  });
  handleDesktopIpc('agent:mention-route', async (_event, payload) => {
    const { planAgentMentionRoute } = await context.getAiModule();
    const { readStore } = await context.getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    return planAgentMentionRoute(provider, payload);
  });
  handleDesktopIpc('focus-co-reading:route', async (_event, payload) => {
    const { planFocusCoReadingRoute } = await context.getAiModule();
    const { readStore } = await context.getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    const selected = new Set(payload.selectedAgentIds);
    const agents = store.agents.filter(
      (agent) => agent.kind === 'annotation' && agent.enabled && selected.has(agent.id),
    );
    return planFocusCoReadingRoute(provider, payload, agents);
  });
  handleDesktopIpc('agent:comment', async (_event, payload) => {
    const ai = await context.getAiModule();
    const { readStore } = await context.getStoreModule();
    const store = await readStore();
    const agent = findCommentAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到助手：@${payload.agentUsername}`);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      providerTaskForAgent(agent),
    );
    const payloadWithRoster = {
      ...payload,
      agentRoster: publicCommentAgents(store.agents),
    };
    const runtime = shouldUseThreadReplyToolLoop(payloadWithRoster)
      ? await runAgentThreadReplyWithToolLoop({
          ai,
          provider,
          agent,
          payload: payloadWithRoster,
        })
      : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
    logThreadReplyRuntime(context, runtime);
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
    return {
      ...comment,
      id: makeId('comment'),
      replyTo:
        payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id,
      readingIntent: payload.readingIntent || comment.readingIntent,
    } satisfies Comment;
  });
  handleDesktopIpc('agent:review', async (_event, payload) => {
    const { runAgentReview } = await context.getAiModule();
    const { readStore } = await context.getStoreModule();
    const store = await readStore();
    const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到审阅助手：@${payload.agentUsername}`);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'reviewAssistant',
    );
    const comments = await runAgentReview(provider, agent, {
      ...payload,
      agentRoster: publicCommentAgents(store.agents),
    });
    for (const comment of comments) {
      comment.id = makeId('comment');
    }
    return comments;
  });
  ipcMain.on(
    'agent:comment:stream',
    async (
      event,
      input: {
        requestId: string;
        payload: AgentMessagePayload;
      },
    ) => {
      const channel = `agent:comment:stream:${input.requestId}`;
      try {
        const ai = await context.getAiModule();
        const { readStore } = await context.getStoreModule();
        const store = await readStore();
        const agent = findCommentAgent(
          store.agents,
          input.payload.agentId,
          input.payload.agentUsername,
        );
        if (!agent) throw new Error(`找不到助手：@${input.payload.agentUsername}`);
        const provider = await taskProvider(
          context,
          store.providers,
          store.settings,
          providerTaskForAgent(agent),
        );
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
          replyTo:
            input.payload.reviewTargetCommentId ||
            input.payload.userComment.replyTo ||
            input.payload.userComment.id,
          readingIntent: input.payload.readingIntent,
          pending: true,
        };
        event.sender.send(channel, { type: 'start', comment });
        const payloadWithRoster = {
          ...input.payload,
          agentRoster: publicCommentAgents(store.agents),
          readingIntent: input.payload.readingIntent || comment.readingIntent,
        };
        const runtime = shouldUseThreadReplyToolLoop(payloadWithRoster)
          ? await runAgentThreadReplyWithToolLoop({
              ai,
              provider,
              agent,
              payload: payloadWithRoster,
            })
          : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
        logThreadReplyRuntime(context, runtime);
        if (runtime.status === 'comment') {
          comment.content = runtime.comment.content;
          event.sender.send(channel, { type: 'delta', delta: comment.content });
        } else {
          const payloadWithMemory = agentMessagePayloadWithReadingMemoryView({
            payload: payloadWithRoster,
            logInfo: context.logInfo,
            logError: context.logError,
          });
          await ai.runAgentStream(provider, agent, payloadWithMemory, (delta) => {
            comment.content += delta;
            event.sender.send(channel, { type: 'delta', delta });
          });
        }
        event.sender.send(channel, {
          type: 'done',
          comment: { ...comment, pending: false },
        });
      } catch (error) {
        event.sender.send(channel, {
          type: 'error',
          message: error instanceof Error ? error.message : '助手回复失败',
        });
      }
    },
  );
  handleDesktopIpc('agent:annotate', async (_event, payload) => {
    const { runAgentAnnotateWithMemory } = await context.getAiModule();
    const { readStore } = await context.getStoreModule();
    const store = await readStore();
    const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到批注助手：@${payload.agentUsername}`);
    const provider = await taskProvider(
      context,
      store.providers,
      store.settings,
      'readingAssistant',
    );
    const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
      payload,
      logInfo: context.logInfo,
      logError: context.logError,
    });
    const result = await runAgentAnnotateWithMemory(provider, agent, payloadWithMemory);
    saveAgentAnnotateReadingMemoryEntries({
      agent,
      payload: payloadWithMemory,
      result,
      logError: context.logError,
    });
    return result;
  });
  ipcMain.on(
    'agent:annotate:stream',
    async (
      event,
      input: {
        requestId: string;
        payload: AgentAnnotatePayload;
      },
    ) => {
      const channel = `agent:annotate:stream:${input.requestId}`;
      try {
        const { runAgentAnnotateStream } = await context.getAiModule();
        const { readStore } = await context.getStoreModule();
        const store = await readStore();
        const agent = findAnnotationAgent(
          store.agents,
          input.payload.agentId,
          input.payload.agentUsername,
        );
        if (!agent) throw new Error(`找不到批注助手：@${input.payload.agentUsername}`);
        const provider = await taskProvider(
          context,
          store.providers,
          store.settings,
          'readingAssistant',
        );
        const annotations: ArticleRecord['annotations'] = [];
        event.sender.send(channel, { type: 'start' });
        const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
          payload: input.payload,
          logInfo: context.logInfo,
          logError: context.logError,
        });
        const result = await runAgentAnnotateStream(
          provider,
          agent,
          payloadWithMemory,
          (annotation) => {
            annotations.push(annotation);
            event.sender.send(channel, { type: 'item', annotation });
          },
        );
        saveAgentAnnotateReadingMemoryEntries({
          agent,
          payload: payloadWithMemory,
          result,
          logError: context.logError,
        });
        event.sender.send(channel, {
          type: 'done',
          annotations,
          readingMemory: result.readingMemory,
        });
      } catch (error) {
        event.sender.send(channel, {
          type: 'error',
          message: error instanceof Error ? error.message : '助手添加想法失败',
        });
      }
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

const providerTaskSettings: Record<ProviderTask, keyof AppSettings> = {
  readingAssistant: 'readingAssistantProviderId',
  reviewAssistant: 'reviewAssistantProviderId',
};

const providerTaskLabels: Record<ProviderTask, string> = {
  readingAssistant: '阅读理解助手',
  reviewAssistant: '深度审阅助手',
};

async function taskProvider(
  context: DesktopMainIpcContext,
  providers: LlmProvider[],
  settings: AppSettings,
  task: ProviderTask,
): Promise<LlmProvider> {
  const providerId = settings[providerTaskSettings[task]] || settings.defaultProviderId;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`请先在任务路由选择${providerTaskLabels[task]}供应商`);
  const { hydrateProviderApiKey } = await context.getStoreModule();
  return hydrateProviderApiKey(provider);
}

function findAnnotationAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function findCommentAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.enabled)
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

function shouldUseThreadReplyToolLoop(payload: AgentMessagePayload) {
  return Boolean(payload.article.id) && !payload.reviewTargetCommentId;
}

function logThreadReplyRuntime(context: DesktopMainIpcContext, result: ThreadReplyRuntimeResult) {
  if (result.status === 'comment') {
    context.logInfo('assistant_runtime.thread_reply', {
      status: 'comment',
      stepCount: result.runtime.trace.steps.length,
      finalActionType: result.runtime.trace.finalActionType,
      repairUsed: result.runtime.repairUsed,
    });
    return;
  }
  context.logInfo('assistant_runtime.thread_reply', {
    status: 'fallback',
    failureReason: result.failureReason,
    stepCount: result.runtime?.trace.steps.length,
    finalActionType: result.runtime?.trace.finalActionType,
  });
}

function publicCommentAgents(agents: Agent[]) {
  return agents
    .filter((agent) => agent.enabled)
    .map((agent) => ({
      id: agent.id,
      kind: agent.kind,
      enabled: agent.enabled,
      presetId: agent.presetId,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      personalityName: agentPersonalityName(agent),
      temperature: agent.temperature,
    }));
}
