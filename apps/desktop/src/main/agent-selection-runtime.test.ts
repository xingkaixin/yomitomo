import { describe, expect, it, vi } from 'vitest';
import {
  runAssistantToolRuntime,
  type AssistantProviderEvent,
  type AssistantRuntimeTurn,
} from '@yomitomo/ai';
import type { Agent, AgentAnnotatePayload, LlmProvider } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import { runAgentSelectionWithToolLoop } from './agent-selection-runtime';

describe('agent selection tool loop', () => {
  it('returns an annotation from an add_annotation action', async () => {
    const adapter = vi
      .fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>()
      .mockImplementation(async (turn) => {
        if (turn.evidence.length === 0) {
          return { type: 'tool_call', toolCall: { name: 'get_anchor_context', input: {} } };
        }
        return {
          type: 'final_action',
          action: {
            type: 'add_annotation',
            anchor: targetAnchor(),
            thought: '这句话把选择压力放回了具体机制里。',
            evidenceIds: [turn.evidence[0].id],
            confidence: 0.86,
            reason: '目标选区有明确讨论价值。',
          },
        };
      });

    const result = await runAgentSelectionWithToolLoop({
      ai: aiModule(adapter),
      provider: provider(),
      agent: agent(),
      payload: payload(),
    });

    expect(result.status).toBe('result');
    expect(result.status === 'result' && result.result.annotations[0]).toMatchObject({
      author: 'ai',
      agentId: 'agent_1',
      annotationType: 'key_point',
      readingIntent: 'decompose',
    });
    expect(result.status === 'result' && result.result.annotations[0]?.comments[0]?.content).toBe(
      '这句话把选择压力放回了具体机制里。',
    );
    expect(adapter.mock.calls[0]?.[0].availableTools.map((tool) => tool.name)).not.toContain(
      'get_current_thread',
    );
  });

  it('returns no annotations for a no_action decision', async () => {
    const adapter = vi.fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>(
      async () => ({
        type: 'final_action',
        action: {
          type: 'no_action',
          reason: '没有新增讨论价值。',
          evidenceIds: [],
          confidence: 0.7,
        },
      }),
    );

    const result = await runAgentSelectionWithToolLoop({
      ai: aiModule(adapter),
      provider: provider(),
      agent: agent(),
      payload: payload(),
    });

    expect(result.status).toBe('result');
    expect(result.status === 'result' && result.result.annotations).toEqual([]);
  });

  it('falls back when the target anchor is missing', async () => {
    const result = await runAgentSelectionWithToolLoop({
      ai: aiModule(vi.fn()),
      provider: provider(),
      agent: agent(),
      payload: { ...payload(), targetAnchor: undefined },
    });

    expect(result).toEqual({
      status: 'fallback',
      failureReason: 'missing_target_anchor',
    });
  });
});

function aiModule(adapter: (turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>) {
  return {
    buildAgentSelectionRuntimePayload: vi.fn(() => ({
      system: 'system',
      user: 'user',
      maxTokens: 1200,
      temperature: 0.4,
    })),
    createAssistantProviderModelAdapter: vi.fn(() => adapter),
    runAssistantToolRuntime,
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

function payload(): AgentAnnotatePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'lin',
    annotationType: 'key_point',
    readingIntent: 'decompose',
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text: articleText(),
    },
    targetAnchor: targetAnchor(),
  };
}

function articleText() {
  return '开头。目标观点说明选择压力如何形成。结尾。';
}

function targetAnchor() {
  const text = articleText();
  const start = text.indexOf('目标观点');
  return createTextAnchor(text, start, start + '目标观点'.length);
}
