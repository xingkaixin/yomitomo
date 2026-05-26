import { describe, expect, it, vi } from 'vitest';
import {
  runAssistantToolRuntime,
  type AssistantProviderEvent,
  type AssistantRuntimeTurn,
} from '@yomitomo/ai';
import type { Agent, AgentMessagePayload, LlmProvider } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import { runAgentThreadReplyWithToolLoop } from './agent-thread-runtime';

describe('agent thread reply tool loop', () => {
  it('returns a thread reply comment from the runtime final action', async () => {
    const adapter = vi
      .fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>()
      .mockImplementation(async (turn) => {
        if (turn.evidence.length === 0) {
          return { type: 'tool_call', toolCall: { name: 'get_current_thread', input: {} } };
        }
        return {
          type: 'final_action',
          action: {
            type: 'reply_to_thread',
            annotationId: 'annotation_1',
            content: '我先按当前 thread 的问题回应。',
            evidenceIds: [turn.evidence[0].id],
            confidence: 0.82,
            reason: '当前 thread 已提供足够上下文。',
          },
        };
      });

    const result = await runAgentThreadReplyWithToolLoop({
      ai: {
        buildAgentThreadReplyRuntimePayload: vi.fn(() => ({
          system: 'system',
          user: 'user',
          maxTokens: 1200,
          temperature: 0.4,
        })),
        createAssistantProviderModelAdapter: vi.fn(() => adapter),
        runAssistantToolRuntime,
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
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('falls back when the article id is missing', async () => {
    const result = await runAgentThreadReplyWithToolLoop({
      ai: {
        buildAgentThreadReplyRuntimePayload: vi.fn(),
        createAssistantProviderModelAdapter: vi.fn(),
        runAssistantToolRuntime,
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
});

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
