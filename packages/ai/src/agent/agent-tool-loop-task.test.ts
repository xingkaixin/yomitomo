import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentMessagePayload, LlmProvider } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import type {
  AssistantFinalAction,
  AssistantRuntimeResult,
  AgentToolLoopTaskType,
} from '../assistant/assistant-runtime';

const runtimeMocks = vi.hoisted(() => ({
  runAssistantAiSdkToolRuntime: vi.fn(),
}));

vi.mock('../assistant/assistant-runtime', () => ({
  runAssistantAiSdkToolRuntime: runtimeMocks.runAssistantAiSdkToolRuntime,
}));

import { runAgentToolLoopTask } from './agent-tool-loop-task';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runAgentToolLoopTask', () => {
  it.each([
    ['thread_reply', 'reply_to_thread', '回复批注 thread'],
    ['create_thought', 'create_thread_thought', '添加顶层助手想法'],
    ['distillation_review', 'review_distillation', '审阅当前批注的沉淀稿'],
  ] as const)(
    'pairs %s with its prompt builder and final action',
    async (taskType, actionType, promptMarker) => {
      const onEvent = vi.fn();
      runtimeMocks.runAssistantAiSdkToolRuntime.mockResolvedValue(
        finalRuntime(taskType, finalAction(actionType)),
      );

      const result = await runAgentToolLoopTask({
        taskType,
        provider: provider(),
        agent: agent(),
        payload: { ...payload(), responseMode: 'distillation_review' },
        tools: [],
        toolExecutor: vi.fn(),
        onEvent,
      });

      expect(result).toMatchObject({
        status: 'final',
        action: { type: actionType },
      });
      expect(runtimeMocks.runAssistantAiSdkToolRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType,
          articleId: 'article_1',
          agentId: 'agent_1',
          allowedAnnotationIds: ['annotation_1'],
          onEvent,
          payload: expect.objectContaining({
            system: expect.stringContaining(promptMarker),
          }),
        }),
      );
    },
  );

  it('turns an action mismatch into an explicit fallback', async () => {
    const runtime = finalRuntime('create_thought', finalAction('reply_to_thread'));
    runtimeMocks.runAssistantAiSdkToolRuntime.mockResolvedValue(runtime);

    const result = await runAgentToolLoopTask({
      taskType: 'create_thought',
      provider: provider(),
      agent: agent(),
      payload: payload(),
      tools: [],
      toolExecutor: vi.fn(),
    });

    expect(result).toEqual({
      status: 'fallback',
      failureReason: 'unexpected_action:reply_to_thread',
      runtime,
    });
  });

  it('preserves runtime fallback details', async () => {
    const runtime: AssistantRuntimeResult = {
      status: 'fallback',
      failureReason: 'provider_failed',
      evidence: [],
      repairUsed: false,
      trace: trace('thread_reply'),
    };
    runtimeMocks.runAssistantAiSdkToolRuntime.mockResolvedValue(runtime);

    const result = await runAgentToolLoopTask({
      taskType: 'thread_reply',
      provider: provider(),
      agent: agent(),
      payload: payload(),
      tools: [],
      toolExecutor: vi.fn(),
    });

    expect(result).toEqual({
      status: 'fallback',
      failureReason: 'provider_failed',
      runtime,
    });
  });

  it('rejects a missing article id before starting the runtime', async () => {
    const result = await runAgentToolLoopTask({
      taskType: 'thread_reply',
      provider: provider(),
      agent: agent(),
      payload: {
        ...payload(),
        article: { ...payload().article, id: undefined },
      },
      tools: [],
      toolExecutor: vi.fn(),
    });

    expect(result).toEqual({
      status: 'fallback',
      failureReason: 'missing_article_id',
    });
    expect(runtimeMocks.runAssistantAiSdkToolRuntime).not.toHaveBeenCalled();
  });
});

function finalRuntime(
  taskType: AgentToolLoopTaskType,
  action: AssistantFinalAction,
): Extract<AssistantRuntimeResult, { status: 'final' }> {
  return {
    status: 'final',
    action,
    evidence: [],
    repairUsed: false,
    trace: {
      ...trace(taskType),
      finalActionType: action.type,
    },
  };
}

function finalAction(type: AssistantFinalAction['type']): AssistantFinalAction {
  const common = {
    annotationId: 'annotation_1',
    evidenceIds: [],
    confidence: 0.8,
    reason: 'test',
  };
  if (type === 'reply_to_thread') return { ...common, type, content: 'reply' };
  if (type === 'create_thread_thought') return { ...common, type, thought: 'thought' };
  if (type === 'review_distillation') return { ...common, type, content: 'review' };
  if (type === 'add_annotation') {
    return { ...common, type, anchor: payload().annotation.anchor, thought: 'annotation' };
  }
  return {
    type,
    evidenceIds: common.evidenceIds,
    confidence: common.confidence,
    reason: common.reason,
  };
}

function trace(taskType: AgentToolLoopTaskType): AssistantRuntimeResult['trace'] {
  return {
    taskType,
    agentId: 'agent_1',
    articleId: 'article_1',
    startedAt: '2026-07-27T00:00:00.000Z',
    completedAt: '2026-07-27T00:00:01.000Z',
    steps: [],
  };
}

function provider(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.com',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  };
}

function agent(): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    providerId: 'provider_1',
    username: 'lin',
    nickname: '林知微',
    avatar: '',
    annotationColor: '#6fa48f',
    annotationDensity: 'medium',
    temperature: 0.4,
    soul: '克制地阅读。',
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  };
}

function payload(): AgentMessagePayload {
  const text = '开头。目标观点说明选择压力如何形成。结尾。';
  const start = text.indexOf('目标观点');
  return {
    agentId: 'agent_1',
    agentUsername: 'lin',
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text,
    },
    annotation: {
      id: 'annotation_1',
      author: { kind: 'user', username: 'reader' },
      color: '#f5c542',
      anchor: createTextAnchor(text, start, start + '目标观点'.length),
      comments: [],
      createdAt: '2026-07-27T00:00:00.000Z',
      updatedAt: '2026-07-27T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_1',
      author: { kind: 'user', username: 'reader' },
      content: '这里是什么意思？',
      createdAt: '2026-07-27T00:01:00.000Z',
    },
  };
}
