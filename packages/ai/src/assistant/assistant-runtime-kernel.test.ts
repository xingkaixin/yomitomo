import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_ASSISTANT_RUNTIME_BUDGETS,
  type AssistantRuntimeTaskType,
} from './assistant-runtime';
import { createAssistantRuntimeKernel } from './assistant-runtime-kernel';

describe('assistant runtime kernel', () => {
  it('rejects tool evidence from another article', async () => {
    const kernel = kernelFor('thread_reply');

    const step = await kernel.handleToolCall(
      0,
      {
        type: 'tool_call',
        toolCall: { id: 'call_1', name: 'search_article_memory', input: { query: 'x' } },
      },
      performance.now(),
      async () => ({
        ok: true,
        evidence: [
          {
            summary: 'wrong article',
            provenance: { articleId: 'article_2', sourceType: 'comment' },
          },
        ],
      }),
      { repairable: true },
    );

    expect(step).toMatchObject({
      type: 'fallback',
      result: {
        failureReason: 'evidence_article_mismatch:article_2',
        repairUsed: false,
      },
    });
  });

  it('requests one repair for invalid final actions', () => {
    const kernel = kernelFor('thread_reply');

    const step = kernel.handleFinalAction(
      0,
      {
        type: 'final_action',
        action: {
          type: 'reply_to_thread',
          annotationId: 'annotation_1',
          content: '伪造证据。',
          evidenceIds: ['missing_evidence'],
          confidence: 0.8,
          reason: 'bad evidence',
        },
      },
      performance.now(),
      { repairable: true },
    );

    expect(step).toEqual({ type: 'repair', reason: 'unknown_evidence:missing_evidence' });
    expect(kernel.turn(1).repairReason).toBe('unknown_evidence:missing_evidence');
  });

  it('falls back when repair fails twice', () => {
    const kernel = kernelFor('thread_reply');
    const event = {
      type: 'final_action' as const,
      action: {
        type: 'reply_to_thread',
        annotationId: 'annotation_1',
        content: '伪造证据。',
        evidenceIds: ['missing_evidence'],
        confidence: 0.8,
        reason: 'bad evidence',
      },
    };

    kernel.handleFinalAction(0, event, performance.now(), { repairable: true });
    kernel.consumeRepairReason();
    const step = kernel.handleFinalAction(1, event, performance.now(), { repairable: true });

    expect(step).toMatchObject({
      type: 'fallback',
      result: {
        failureReason: 'repair_failed:unknown_evidence:missing_evidence',
        repairUsed: true,
      },
    });
  });

  it('falls back when a tool executor returns failure', async () => {
    const kernel = kernelFor('thread_reply');

    const step = await kernel.handleToolCall(
      0,
      {
        type: 'tool_call',
        toolCall: { id: 'call_1', name: 'search_article_passages', input: { query: 'x' } },
      },
      performance.now(),
      async () => ({ ok: false, failureReason: 'fts_unavailable' }),
      { repairable: true },
    );

    expect(step).toMatchObject({
      type: 'fallback',
      result: { failureReason: 'fts_unavailable' },
    });
    expect(kernel.trace.steps[0]).toMatchObject({
      toolName: 'search_article_passages',
      failureReason: 'fts_unavailable',
    });
  });

  it('emits a bounded fallback result for step limit exhaustion', () => {
    const kernel = kernelFor('thread_reply');

    const result = kernel.finishWithFallback('step_limit_exceeded');

    expect(result).toMatchObject({
      status: 'fallback',
      failureReason: 'step_limit_exceeded',
      trace: { failureReason: 'step_limit_exceeded' },
    });
  });
});

function kernelFor(taskType: AssistantRuntimeTaskType) {
  return createAssistantRuntimeKernel({
    taskType,
    articleId: 'article_1',
    agentId: 'agent_1',
    allowedAnnotationIds: ['annotation_1'],
    tools: [
      { name: 'search_article_memory' },
      { name: 'search_article_passages' },
      { name: 'get_current_thread' },
    ],
    budget: DEFAULT_ASSISTANT_RUNTIME_BUDGETS[taskType],
    now: vi.fn(() => '2026-06-04T00:00:00.000Z'),
  });
}
