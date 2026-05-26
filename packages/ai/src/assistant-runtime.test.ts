import { describe, expect, it, vi } from 'vitest';
import {
  runAssistantToolRuntime,
  validateAssistantFinalAction,
  type AssistantProviderEvent,
  type AssistantRuntimeTurn,
  type AssistantToolDefinition,
} from './assistant-runtime';

describe('assistant tool runtime', () => {
  it('runs a bounded tool loop and validates a final thread reply', async () => {
    const modelEvents: AssistantProviderEvent[] = [
      {
        type: 'tool_call',
        toolCall: {
          id: 'call_thread',
          name: 'get_current_thread',
          input: { annotationId: 'annotation_1' },
        },
      },
      {
        type: 'final_action',
        action: {
          type: 'reply_to_thread',
          annotationId: 'annotation_1',
          content: '这条回复基于当前 thread。',
          evidenceIds: ['evidence_0_0'],
          confidence: 0.82,
          reason: 'thread evidence supports the reply',
        },
      },
    ];
    const modelAdapter = vi.fn(async () => modelEvents.shift()!);
    const toolExecutor = vi.fn(async () => ({
      ok: true as const,
      evidence: [
        {
          summary: '当前 thread 中读者询问目标句子。',
          provenance: {
            articleId: 'article_1',
            sourceType: 'comment',
            sourceAnnotationId: 'annotation_1',
            sourceCommentId: 'comment_1',
            authorType: 'user' as const,
          },
        },
      ],
    }));

    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      allowedAnnotationIds: ['annotation_1'],
      tools: [tool('get_current_thread')],
      modelAdapter,
      toolExecutor,
      now: () => '2026-05-26T00:00:00.000Z',
    });

    expect(result.status).toBe('final');
    expect(result.evidence.map((item) => item.id)).toEqual(['evidence_0_0']);
    expect(result.trace.steps.map((step) => step.eventType)).toEqual(['tool_call', 'final_action']);
    expect(result.trace.steps[0]).toMatchObject({
      toolName: 'get_current_thread',
      resultCount: 1,
      evidenceIds: ['evidence_0_0'],
      evidenceSummaries: [
        {
          id: 'evidence_0_0',
          summary: '当前 thread 中读者询问目标句子。',
          provenance: {
            articleId: 'article_1',
            sourceType: 'comment',
            sourceAnnotationId: 'annotation_1',
            sourceCommentId: 'comment_1',
            authorType: 'user',
          },
        },
      ],
    });
    expect(toolExecutor).toHaveBeenCalledWith({
      id: 'call_thread',
      name: 'get_current_thread',
      input: { annotationId: 'annotation_1' },
    });
  });

  it('allows repeated tool calls during debug-friendly runtime exploration', async () => {
    const modelAdapter = vi
      .fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>()
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolCall: {
          name: 'get_current_thread',
          input: {},
        },
      })
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolCall: {
          name: 'get_current_thread',
          input: {},
        },
      })
      .mockResolvedValueOnce({
        type: 'final_action',
        action: {
          type: 'reply_to_thread',
          annotationId: 'annotation_1',
          content: '基于当前 thread 回复。',
          evidenceIds: ['evidence_0_0'],
          confidence: 0.8,
          reason: '已有 thread evidence。',
        },
      });
    const toolExecutor = vi.fn(async () => ({
      ok: true as const,
      evidence: [
        {
          summary: '当前 thread evidence',
          provenance: { articleId: 'article_1', sourceType: 'comment' },
        },
      ],
    }));

    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      allowedAnnotationIds: ['annotation_1'],
      tools: [tool('get_current_thread')],
      modelAdapter,
      toolExecutor,
    });

    expect(result.status).toBe('final');
    expect(result.repairUsed).toBe(false);
    expect(toolExecutor).toHaveBeenCalledTimes(2);
    expect(result.trace.steps[1]).toMatchObject({
      eventType: 'tool_call',
      toolName: 'get_current_thread',
      resultCount: 1,
      evidenceIds: ['evidence_1_0'],
    });
  });

  it('asks the model to repair invalid tool input once', async () => {
    const modelAdapter = vi
      .fn<(turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>>()
      .mockResolvedValueOnce({
        type: 'tool_call',
        toolCall: {
          name: 'search_article_memory',
          input: { query: '' },
        },
      })
      .mockResolvedValueOnce({
        type: 'final_action',
        action: {
          type: 'no_action',
          reason: '缺少可检索问题。',
          evidenceIds: [],
          confidence: 0.4,
        },
      });

    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      tools: [
        tool('search_article_memory', (input) =>
          hasStringField(input, 'query') ? null : 'missing_query',
        ),
      ],
      modelAdapter,
      toolExecutor: vi.fn(),
    });

    expect(result.status).toBe('final');
    expect(result.repairUsed).toBe(true);
    const repairedTurn = modelAdapter.mock.calls[1]?.[0];
    expect(repairedTurn?.repairReason).toBe('missing_query');
    expect(result.trace.steps[0]?.failureReason).toBe('missing_query');
  });

  it('falls back after the task step limit is exhausted', async () => {
    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      budget: { maxSteps: 1 },
      tools: [tool('get_anchor_context')],
      modelAdapter: vi.fn(
        async (): Promise<AssistantProviderEvent> => ({
          type: 'tool_call',
          toolCall: {
            name: 'get_anchor_context',
            input: { annotationId: 'annotation_1' },
          },
        }),
      ),
      toolExecutor: vi.fn(async () => ({
        ok: true as const,
        evidence: [
          {
            summary: 'anchor context',
            provenance: { articleId: 'article_1', sourceType: 'original_text' },
          },
        ],
      })),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'step_limit_exceeded',
    });
  });

  it('rejects final actions with unknown evidence ids after one repair', async () => {
    const modelAdapter = vi.fn(async () => ({
      type: 'final_action' as const,
      action: {
        type: 'reply_to_thread',
        annotationId: 'annotation_1',
        content: '伪造证据。',
        evidenceIds: ['missing_evidence'],
        confidence: 0.8,
        reason: 'bad evidence',
      },
    }));

    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      allowedAnnotationIds: ['annotation_1'],
      tools: [],
      modelAdapter,
      toolExecutor: vi.fn(),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'repair_failed:unknown_evidence:missing_evidence',
      repairUsed: true,
    });
    expect(modelAdapter).toHaveBeenCalledTimes(2);
  });

  it('falls back when a tool executor fails', async () => {
    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      tools: [tool('search_article_passages')],
      modelAdapter: vi.fn(
        async (): Promise<AssistantProviderEvent> => ({
          type: 'tool_call',
          toolCall: {
            name: 'search_article_passages',
            input: { query: '目标观点' },
          },
        }),
      ),
      toolExecutor: vi.fn(async () => ({
        ok: false as const,
        failureReason: 'fts_unavailable',
      })),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'fts_unavailable',
    });
    expect(result.trace.steps[0]).toMatchObject({
      toolName: 'search_article_passages',
      failureReason: 'fts_unavailable',
    });
  });

  it('rejects tool evidence from another article', async () => {
    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      tools: [tool('search_article_memory')],
      modelAdapter: vi.fn(
        async (): Promise<AssistantProviderEvent> => ({
          type: 'tool_call',
          toolCall: {
            name: 'search_article_memory',
            input: { query: '目标观点' },
          },
        }),
      ),
      toolExecutor: vi.fn(async () => ({
        ok: true as const,
        evidence: [
          {
            summary: 'wrong article',
            provenance: { articleId: 'article_2', sourceType: 'comment' },
          },
        ],
      })),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'evidence_article_mismatch:article_2',
    });
  });

  it('falls back immediately on provider failures', async () => {
    const modelAdapter = vi.fn(
      async (): Promise<AssistantProviderEvent> => ({
        type: 'provider_failure',
        reason: 'provider_rate_limited',
        retryable: true,
      }),
    );

    const result = await runAssistantToolRuntime({
      taskType: 'thread_reply',
      articleId: 'article_1',
      agentId: 'agent_1',
      tools: [],
      modelAdapter,
      toolExecutor: vi.fn(),
    });

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'provider_rate_limited',
      repairUsed: false,
    });
    expect(modelAdapter).toHaveBeenCalledTimes(1);
  });
});

describe('assistant final action validation', () => {
  it('rejects no_action payloads that try to write', () => {
    const result = validateAssistantFinalAction(
      {
        type: 'no_action',
        reason: '不需要回复。',
        evidenceIds: [],
        confidence: 0.7,
        content: '不应写入',
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(),
      },
    );

    expect(result).toEqual({ ok: false, reason: 'no_action_cannot_write' });
  });

  it('normalizes common evidence id field variants', () => {
    const result = validateAssistantFinalAction(
      {
        type: 'no_action',
        reason: '已有证据足够。',
        evidence_ids: 'evidence_0_0',
        confidence: 0.7,
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(['evidence_0_0']),
      },
    );

    expect(result).toEqual({
      ok: true,
      action: {
        type: 'no_action',
        reason: '已有证据足够。',
        evidenceIds: ['evidence_0_0'],
        confidence: 0.7,
      },
    });
  });

  it('uses the host target anchor for add_annotation actions without model-owned anchors', () => {
    const targetAnchor = {
      exact: '目标选区',
      prefix: '',
      suffix: '',
      start: 8,
      end: 12,
    };
    const result = validateAssistantFinalAction(
      {
        type: 'add_annotation',
        thought: '这段值得补一条批注。',
        evidenceIds: [],
        confidence: 0.8,
        reason: '目标选区有讨论价值。',
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(),
        addAnnotationAnchor: targetAnchor,
      },
    );

    expect(result).toEqual({
      ok: true,
      action: {
        type: 'add_annotation',
        anchor: targetAnchor,
        thought: '这段值得补一条批注。',
        evidenceIds: [],
        confidence: 0.8,
        reason: '目标选区有讨论价值。',
      },
    });
  });

  it('rejects reply actions for annotations outside the host allowlist', () => {
    const result = validateAssistantFinalAction(
      {
        type: 'reply_to_thread',
        annotationId: 'annotation_other',
        content: '跨 thread 回复。',
        evidenceIds: [],
        confidence: 0.8,
        reason: 'bad target',
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(),
        allowedAnnotationIds: ['annotation_1'],
      },
    );

    expect(result).toEqual({ ok: false, reason: 'annotation_not_allowed' });
  });
});

function tool(
  name: AssistantToolDefinition['name'],
  validateInput?: AssistantToolDefinition['validateInput'],
): AssistantToolDefinition {
  return {
    name,
    validateInput,
  };
}

function hasStringField(input: unknown, field: string) {
  return (
    typeof input === 'object' &&
    input !== null &&
    !Array.isArray(input) &&
    typeof (input as Record<string, unknown>)[field] === 'string' &&
    Boolean(((input as Record<string, unknown>)[field] as string).trim())
  );
}
