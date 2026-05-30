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
import type { NormalizedAiUsage } from '@yomitomo/ai';
import { agentPersonalityName, makeId, normalizeAssistantExecutionMode } from '@yomitomo/shared';
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
import {
  runAgentSelectionWithToolLoop,
  type SelectionRuntimeResult,
} from './agent-selection-runtime';
import {
  runAgentCoReadingHybridWithToolLoop,
  type CoReadingRuntimeResult,
} from './agent-co-reading-runtime';
import { appendAgentRuntimeTrace } from './agent-runtime-trace-log';

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
    const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
    const startedAt = performance.now();
    const payloadWithRoster = {
      ...payload,
      agentRoster: publicCommentAgents(store.agents),
    };
    const runtime = shouldUseThreadReplyToolLoop(payloadWithRoster, requestedMode)
      ? await runAgentThreadReplyWithToolLoop({
          ai,
          provider,
          agent,
          payload: payloadWithRoster,
        })
      : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
    logThreadReplyRuntime(
      context,
      runtime,
      provider,
      agent,
      requestedMode,
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
        taskType: 'thread_reply',
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
        const requestedMode = normalizeAssistantExecutionMode(
          store.settings.assistantExecutionMode,
        );
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
        event.sender.send(channel, { type: 'start', comment });
        const payloadWithRoster = {
          ...input.payload,
          agentRoster: publicCommentAgents(store.agents),
          readingIntent: input.payload.readingIntent || comment.readingIntent,
        };
        const runtime = shouldUseThreadReplyToolLoop(payloadWithRoster, requestedMode)
          ? await runAgentThreadReplyWithToolLoop({
              ai,
              provider,
              agent,
              payload: payloadWithRoster,
            })
          : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
        logThreadReplyRuntime(
          context,
          runtime,
          provider,
          agent,
          requestedMode,
          context.elapsedMs(startedAt),
        );
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
          recordAssistantExecutionRun(context, {
            agent,
            provider,
            taskType: 'thread_reply',
            requestedMode,
            effectiveMode: 'fast_response',
            status: 'success',
            fallbackReason:
              requestedMode === 'deep_verification' ? runtime.failureReason : undefined,
            durationMs: context.elapsedMs(startedAt),
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
    const ai = await context.getAiModule();
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
    const startedAt = performance.now();
    const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
      payload,
      logInfo: context.logInfo,
      logError: context.logError,
    });
    const requestedMode = normalizeAssistantExecutionMode(store.settings.assistantExecutionMode);
    const defaultRuntimeTaskType = annotateRuntimeTaskType(payloadWithMemory) || 'annotation';
    const runtimeTaskType =
      requestedMode === 'deep_verification'
        ? defaultRuntimeTaskType === 'annotation'
          ? undefined
          : defaultRuntimeTaskType
        : undefined;
    const runtime =
      runtimeTaskType === 'selection_first'
        ? await runAgentSelectionWithToolLoop({
            ai,
            provider,
            agent,
            payload: payloadWithMemory,
          })
        : runtimeTaskType === 'co_reading_section'
          ? await runAgentCoReadingHybridWithToolLoop({
              ai,
              provider,
              agent,
              payload: payloadWithMemory,
            })
          : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
    logAnnotateRuntime(context, runtime, payloadWithMemory, agent, runtimeTaskType);
    const result =
      runtime.status === 'result'
        ? runtime.result
        : await ai.runAgentAnnotateWithMemory(provider, agent, payloadWithMemory);
    saveAgentAnnotateReadingMemoryEntries({
      agent,
      payload: payloadWithMemory,
      result,
      logError: context.logError,
    });
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType: defaultRuntimeTaskType,
      requestedMode,
      effectiveMode:
        requestedMode === 'deep_verification' && runtime.status === 'result'
          ? 'deep_verification'
          : 'fast_response',
      status: 'success',
      fallbackReason:
        requestedMode === 'deep_verification' && runtime.status === 'fallback'
          ? runtime.failureReason
          : undefined,
      usage: annotateRuntimeUsage(runtime),
      durationMs: context.elapsedMs(startedAt),
      stepCount: annotateRuntimeStepCount(runtime),
      traceJson: annotateRuntimeTraceJson(runtime),
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
        const ai = await context.getAiModule();
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
        const startedAt = performance.now();
        const annotations: ArticleRecord['annotations'] = [];
        event.sender.send(channel, { type: 'start' });
        const payloadWithMemory = agentAnnotatePayloadWithReadingMemoryEntries({
          payload: input.payload,
          logInfo: context.logInfo,
          logError: context.logError,
        });
        const requestedMode = normalizeAssistantExecutionMode(
          store.settings.assistantExecutionMode,
        );
        const defaultRuntimeTaskType = annotateRuntimeTaskType(payloadWithMemory) || 'annotation';
        const runtimeTaskType =
          requestedMode === 'deep_verification'
            ? defaultRuntimeTaskType === 'annotation'
              ? undefined
              : defaultRuntimeTaskType
            : undefined;
        const runtime =
          runtimeTaskType === 'selection_first'
            ? await runAgentSelectionWithToolLoop({
                ai,
                provider,
                agent,
                payload: payloadWithMemory,
              })
            : runtimeTaskType === 'co_reading_section'
              ? await runAgentCoReadingHybridWithToolLoop({
                  ai,
                  provider,
                  agent,
                  payload: payloadWithMemory,
                })
              : { status: 'fallback' as const, failureReason: 'runtime_not_applicable' };
        logAnnotateRuntime(context, runtime, payloadWithMemory, agent, runtimeTaskType);
        const result =
          runtime.status === 'result'
            ? runtime.result
            : await ai.runAgentAnnotateStream(provider, agent, payloadWithMemory, (annotation) => {
                annotations.push(annotation);
                event.sender.send(channel, { type: 'item', annotation });
              });
        if (runtime.status === 'result') {
          for (const annotation of result.annotations) {
            annotations.push(annotation);
            event.sender.send(channel, { type: 'item', annotation });
          }
        }
        saveAgentAnnotateReadingMemoryEntries({
          agent,
          payload: payloadWithMemory,
          result,
          logError: context.logError,
        });
        recordAssistantExecutionRun(context, {
          agent,
          provider,
          taskType: defaultRuntimeTaskType,
          requestedMode,
          effectiveMode:
            requestedMode === 'deep_verification' && runtime.status === 'result'
              ? 'deep_verification'
              : 'fast_response',
          status: 'success',
          fallbackReason:
            requestedMode === 'deep_verification' && runtime.status === 'fallback'
              ? runtime.failureReason
              : undefined,
          usage: annotateRuntimeUsage(runtime) || annotateResultUsage(result),
          durationMs: context.elapsedMs(startedAt),
          stepCount: annotateRuntimeStepCount(runtime),
          traceJson: annotateRuntimeTraceJson(runtime),
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

function shouldUseThreadReplyToolLoop(
  payload: AgentMessagePayload,
  mode: ReturnType<typeof normalizeAssistantExecutionMode>,
) {
  return (
    payload.responseMode !== 'create_thought' &&
    mode === 'deep_verification' &&
    Boolean(payload.article.id) &&
    !payload.reviewTargetCommentId
  );
}

function agentMessageReplyTo(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought') return undefined;
  return payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id;
}

function shouldUseSelectionFirstToolLoop(payload: AgentAnnotatePayload) {
  return (
    Boolean(payload.article.id) && Boolean(payload.targetAnchor) && !payload.readingPlan?.length
  );
}

function shouldUseCoReadingHybridToolLoop(payload: AgentAnnotatePayload) {
  return Boolean(payload.article.id) && Boolean(payload.readingPlan?.length);
}

function annotateRuntimeTaskType(payload: AgentAnnotatePayload) {
  if (shouldUseSelectionFirstToolLoop(payload)) return 'selection_first';
  if (shouldUseCoReadingHybridToolLoop(payload)) return 'co_reading_section';
  return undefined;
}

function logThreadReplyRuntime(
  context: DesktopMainIpcContext,
  result: ThreadReplyRuntimeResult,
  provider: LlmProvider,
  agent: Agent,
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>,
  durationMs?: number,
) {
  if (result.status === 'comment') {
    context.logInfo('assistant_runtime.thread_reply', {
      status: 'comment',
      stepCount: result.runtime.trace.steps.length,
      finalActionType: result.runtime.trace.finalActionType,
      repairUsed: result.runtime.repairUsed,
    });
    void appendAgentRuntimeTrace({
      taskType: 'thread_reply',
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      status: 'comment',
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      trace: result.runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType: 'thread_reply',
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
  context.logInfo('assistant_runtime.thread_reply', {
    status: 'fallback',
    failureReason: result.failureReason,
    stepCount: result.runtime?.trace.steps.length,
    finalActionType: result.runtime?.trace.finalActionType,
  });
  if (result.runtime) {
    void appendAgentRuntimeTrace({
      taskType: 'thread_reply',
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
      taskType: 'thread_reply',
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
  input: Parameters<(typeof import('./store'))['recordAssistantExecutionRun']>[0],
) {
  void context
    .getStoreModule()
    .then((storeModule) => storeModule.recordAssistantExecutionRun(input))
    .catch((error) => context.logError('assistant.execution_run_write_failed', error));
}

function annotateRuntimeStepCount(result: SelectionRuntimeResult | CoReadingRuntimeResult) {
  if (result.status !== 'result')
    return 'runtime' in result ? result.runtime?.trace.steps.length || 0 : 0;
  if ('runtime' in result) return result.runtime.trace.steps.length;
  return result.traces.length;
}

function annotateRuntimeTraceJson(result: SelectionRuntimeResult | CoReadingRuntimeResult) {
  if (result.status !== 'result') return 'runtime' in result ? result.runtime?.trace : undefined;
  if ('runtime' in result) return result.runtime.trace;
  return result.traces;
}

function annotateRuntimeUsage(
  result: SelectionRuntimeResult | CoReadingRuntimeResult,
): NormalizedAiUsage | undefined {
  return 'runtime' in result ? result.runtime?.trace.usage : undefined;
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

function logAnnotateRuntime(
  context: DesktopMainIpcContext,
  result: SelectionRuntimeResult | CoReadingRuntimeResult,
  payload: AgentAnnotatePayload,
  agent: Agent,
  runtimeTaskType: ReturnType<typeof annotateRuntimeTaskType>,
) {
  if ('traces' in result) {
    context.logInfo('assistant_runtime.co_reading_section', {
      status: 'result',
      annotationCount: result.result.annotations.length,
      decisionCount: result.traces.length,
      filteredCount: result.traces.filter((trace) => trace.actionType === 'no_action').length,
      fallbackCount: result.traces.filter((trace) => trace.status === 'fallback').length,
    });
    void appendAgentRuntimeTrace({
      taskType: 'co_reading_section',
      agentId: agent.id,
      articleId: payload.article.id || '',
      status: 'result',
      stepCount: result.traces.length,
      annotationCount: result.result.annotations.length,
      decisionCount: result.traces.length,
      filteredCount: result.traces.filter((trace) => trace.actionType === 'no_action').length,
      fallbackCount: result.traces.filter((trace) => trace.status === 'fallback').length,
      decisions: result.traces,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    return;
  }

  if (result.status === 'result') {
    context.logInfo('assistant_runtime.selection_first', {
      status: 'result',
      annotationCount: result.result.annotations.length,
      stepCount: result.runtime.trace.steps.length,
      finalActionType: result.runtime.trace.finalActionType,
      repairUsed: result.runtime.repairUsed,
    });
    void appendAgentRuntimeTrace({
      taskType: 'selection_first',
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      status: 'result',
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      annotationCount: result.result.annotations.length,
      trace: result.runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    return;
  }
  const logEvent =
    runtimeTaskType === 'co_reading_section'
      ? 'assistant_runtime.co_reading_section'
      : 'assistant_runtime.selection_first';
  context.logInfo(logEvent, {
    status: 'fallback',
    failureReason: result.failureReason,
    stepCount: 'runtime' in result ? result.runtime?.trace.steps.length : undefined,
    finalActionType: 'runtime' in result ? result.runtime?.trace.finalActionType : undefined,
  });
  const runtime = 'runtime' in result ? result.runtime : undefined;
  if (runtime) {
    void appendAgentRuntimeTrace({
      taskType: 'selection_first',
      agentId: runtime.trace.agentId,
      articleId: runtime.trace.articleId,
      status: 'fallback',
      failureReason: result.failureReason,
      finalActionType: runtime.trace.finalActionType,
      stepCount: runtime.trace.steps.length,
      repairUsed: runtime.repairUsed,
      trace: runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
  }
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
