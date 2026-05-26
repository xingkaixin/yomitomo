import { describe, expect, it, vi } from 'vitest';
import {
  runAssistantToolRuntime,
  type AssistantProviderEvent,
  type AssistantRuntimeTurn,
} from '@yomitomo/ai';
import type { Agent, AgentAnnotatePayload, Annotation, LlmProvider } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import { runAgentCoReadingHybridWithToolLoop } from './agent-co-reading-runtime';

describe('agent co-reading hybrid tool loop', () => {
  it('keeps an annotation when the runtime returns add_annotation', async () => {
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
            thought: '收紧后的共读批注。',
            evidenceIds: [turn.evidence[0].id],
            confidence: 0.84,
            reason: '候选有新增价值。',
          },
        };
      });

    const result = await runAgentCoReadingHybridWithToolLoop({
      ai: aiModule(adapter, [annotation()]),
      provider: provider(),
      agent: agent(),
      payload: payload(),
    });

    expect(result.status).toBe('result');
    expect(result.status === 'result' && result.result.annotations).toHaveLength(1);
    expect(result.status === 'result' && result.result.annotations[0]?.comments[0]?.content).toBe(
      '收紧后的共读批注。',
    );
    expect(adapter.mock.calls[0]?.[0].availableTools.map((tool) => tool.name)).not.toContain(
      'get_current_thread',
    );
  });

  it('filters an annotation when the runtime returns no_action', async () => {
    const adapter = vi
      .fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>()
      .mockImplementation(async () => ({
        type: 'final_action',
        action: {
          type: 'no_action',
          reason: '重复。',
          evidenceIds: [],
          confidence: 0.72,
        },
      }));

    const result = await runAgentCoReadingHybridWithToolLoop({
      ai: aiModule(adapter, [annotation()]),
      provider: provider(),
      agent: agent(),
      payload: payload(),
    });

    expect(result.status).toBe('result');
    expect(result.status === 'result' && result.result.annotations).toEqual([]);
    expect(result.status === 'result' && result.traces[0]).toMatchObject({
      actionType: 'no_action',
    });
  });

  it('keeps generated annotations when runtime falls back', async () => {
    const adapter = vi
      .fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>()
      .mockImplementation(async () => ({
        type: 'provider_failure',
        reason: 'provider_failed',
      }));

    const generated = annotation();
    const result = await runAgentCoReadingHybridWithToolLoop({
      ai: aiModule(adapter, [generated]),
      provider: provider(),
      agent: agent(),
      payload: payload(),
    });

    expect(result.status).toBe('result');
    expect(result.status === 'result' && result.result.annotations).toEqual([generated]);
    expect(result.status === 'result' && result.traces[0]).toMatchObject({
      status: 'fallback',
      failureReason: 'provider_failed',
    });
  });
});

function aiModule(
  adapter: (turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>,
  annotations: Annotation[],
) {
  return {
    buildAgentCoReadingRuntimePayload: vi.fn(() => ({
      system: 'system',
      user: 'user',
      maxTokens: 1200,
      temperature: 0.4,
    })),
    createAssistantProviderModelAdapter: vi.fn(() => adapter),
    runAgentAnnotateWithMemory: vi.fn(async () => ({ annotations })),
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
    readingPlan: [
      {
        sectionId: 'section_1',
        sectionTitle: '第一节',
        sectionStart: 0,
        sectionEnd: articleText().length,
      },
    ],
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text: articleText(),
    },
  };
}

function annotation(): Annotation {
  return {
    id: 'annotation_1',
    author: 'ai',
    color: '#6fa48f',
    agentId: 'agent_1',
    agentUsername: 'lin',
    agentNickname: '林知微',
    anchor: targetAnchor(),
    comments: [
      {
        id: 'comment_1',
        author: 'ai',
        content: '原始共读批注。',
        createdAt: '2026-05-26T00:00:00.000Z',
      },
    ],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
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
