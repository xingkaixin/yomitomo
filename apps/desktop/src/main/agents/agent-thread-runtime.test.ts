import { describe, expect, it, vi } from 'vitest';
import type { AssistantAiSdkRuntimeOptions, AssistantRuntimeResult } from '@yomitomo/ai';
import type { Agent, AgentMessagePayload, LlmProvider } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import {
  runAgentCreateThoughtWithToolLoop,
  runAgentDistillationReviewWithToolLoop,
  runAgentThreadReplyWithToolLoop,
} from './agent-thread-runtime';

describe('agent thread reply tool loop', () => {
  it('returns a thread reply comment from the runtime final action', async () => {
    const runtime = vi.fn(async (): Promise<AssistantRuntimeResult> => threadReplyRuntime());

    const result = await runAgentThreadReplyWithToolLoop({
      ai: {
        buildAgentThreadReplyRuntimePayload: vi.fn(() => ({
          system: 'system',
          user: 'user',
          maxTokens: 1200,
          temperature: 0.4,
        })),
        runAssistantAiSdkToolRuntime: runtime,
      },
      provider: provider(),
      agent: agent(),
      payload: payload(),
    });

    expect(result.status).toBe('comment');
    expect(result.status === 'comment' && result.comment).toMatchObject({
      author: 'ai',
      content: '我先按当前 thread 的问题回应。',
      agentId: 'agent_1',
      agentUsername: 'lin',
    });
    expect(runtime).toHaveBeenCalledTimes(1);
  });

  it('passes runtime stream events through for thread replies', async () => {
    const onRuntimeEvent = vi.fn();
    const runtime = vi.fn(
      async (options: AssistantAiSdkRuntimeOptions): Promise<AssistantRuntimeResult> => {
        options.onEvent?.({ type: 'text_delta', delta: '流式片段' });
        return threadReplyRuntime();
      },
    );

    await runAgentThreadReplyWithToolLoop({
      ai: {
        buildAgentThreadReplyRuntimePayload: vi.fn(() => ({
          system: 'system',
          user: 'user',
          maxTokens: 1200,
          temperature: 0.4,
        })),
        runAssistantAiSdkToolRuntime: runtime,
      },
      provider: provider(),
      agent: agent(),
      payload: payload(),
      onRuntimeEvent,
    });

    expect(onRuntimeEvent).toHaveBeenCalledWith({ type: 'text_delta', delta: '流式片段' });
  });

  it('falls back when the article id is missing', async () => {
    const result = await runAgentThreadReplyWithToolLoop({
      ai: {
        buildAgentThreadReplyRuntimePayload: vi.fn(),
        runAssistantAiSdkToolRuntime: vi.fn(),
      },
      provider: provider(),
      agent: agent(),
      payload: {
        ...payload(),
        article: { ...payload().article, id: undefined },
      },
    });

    expect(result).toEqual({
      status: 'fallback',
      failureReason: 'missing_article_id',
    });
  });

  it('returns a top-level thought from the create_thought runtime final action', async () => {
    const runtime = vi.fn(async (): Promise<AssistantRuntimeResult> => createThoughtRuntime());

    const result = await runAgentCreateThoughtWithToolLoop({
      ai: {
        buildAgentCreateThoughtRuntimePayload: vi.fn(() => ({
          system: 'system',
          user: 'user',
          maxTokens: 1200,
          temperature: 0.4,
        })),
        runAssistantAiSdkToolRuntime: runtime,
      },
      provider: provider(),
      agent: agent(),
      payload: { ...payload(), responseMode: 'create_thought' },
    });

    expect(result.status).toBe('comment');
    expect(result.status === 'comment' && result.comment).toMatchObject({
      author: 'ai',
      content: '这条想法会作为顶层助手想法保存。',
    });
  });

  it('returns a review message from the distillation runtime final action', async () => {
    const runtime = vi.fn(async (): Promise<AssistantRuntimeResult> => reviewRuntime());

    const result = await runAgentDistillationReviewWithToolLoop({
      ai: {
        buildAgentDistillationReviewRuntimePayload: vi.fn(() => ({
          system: 'system',
          user: 'user',
          maxTokens: 1200,
          temperature: 0.4,
          distillationReviewMode: 'review' as const,
        })),
        runAssistantAiSdkToolRuntime: runtime,
      },
      provider: provider(),
      agent: { ...agent(), kind: 'review' },
      payload: { ...payload(), responseMode: 'distillation_review' },
    });

    expect(result.status).toBe('message');
    expect(result.status === 'message' && result.message).toMatchObject({
      author: 'ai',
      content: '这段沉淀还需要补足原文证据。',
      agentId: 'agent_1',
      proposals: [
        expect.objectContaining({
          id: 'proposal_1',
          kind: 'insert',
          content: '补一条证据边界。',
        }),
      ],
    });
  });
});

function threadReplyRuntime(): AssistantRuntimeResult {
  return {
    status: 'final',
    action: {
      type: 'reply_to_thread',
      annotationId: 'annotation_1',
      content: '我先按当前 thread 的问题回应。',
      evidenceIds: [],
      confidence: 0.82,
      reason: '当前 thread 已提供足够上下文。',
    },
    evidence: [],
    repairUsed: false,
    trace: trace('thread_reply', 'reply_to_thread'),
  };
}

function createThoughtRuntime(): AssistantRuntimeResult {
  return {
    status: 'final',
    action: {
      type: 'create_thread_thought',
      annotationId: 'annotation_1',
      thought: '这条想法会作为顶层助手想法保存。',
      evidenceIds: [],
      confidence: 0.82,
      reason: '当前批注需要新增想法。',
    },
    evidence: [],
    repairUsed: false,
    trace: trace('create_thought', 'create_thread_thought'),
  };
}

function reviewRuntime(): AssistantRuntimeResult {
  return {
    status: 'final',
    action: {
      type: 'review_distillation',
      annotationId: 'annotation_1',
      content: '这段沉淀还需要补足原文证据。',
      proposals: [
        {
          id: 'proposal_1',
          kind: 'insert',
          status: 'pending',
          title: '补证据边界',
          content: '补一条证据边界。',
          updatedAt: '2026-05-26T00:00:01.000Z',
        },
      ],
      evidenceIds: [],
      confidence: 0.82,
      reason: '当前沉淀稿需要审阅。',
    },
    evidence: [],
    repairUsed: false,
    trace: trace('distillation_review', 'review_distillation'),
  };
}

function trace(
  taskType: AssistantRuntimeResult['trace']['taskType'],
  finalActionType: NonNullable<AssistantRuntimeResult['trace']['finalActionType']>,
): AssistantRuntimeResult['trace'] {
  return {
    taskType,
    agentId: 'agent_1',
    articleId: 'article_1',
    startedAt: '2026-05-26T00:00:00.000Z',
    completedAt: '2026-05-26T00:00:01.000Z',
    steps: [],
    finalActionType,
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
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
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
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function payload(): AgentMessagePayload {
  const text = '开头。目标观点说明选择压力如何形成。结尾。';
  const start = text.indexOf('目标观点');
  const anchor = createTextAnchor(text, start, start + '目标观点'.length);
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
      author: 'user',
      color: '#f5c542',
      anchor,
      comments: [
        {
          id: 'comment_1',
          author: 'user',
          content: '这里是什么意思？',
          createdAt: '2026-05-26T00:01:00.000Z',
        },
      ],
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_1',
      author: 'user',
      content: '这里是什么意思？',
      createdAt: '2026-05-26T00:01:00.000Z',
    },
  };
}
