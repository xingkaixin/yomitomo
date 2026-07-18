import { describe, expect, it } from 'vitest';
import { validateAssistantFinalAction } from './assistant-runtime';

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

  it('accepts create_thread_thought for an allowed annotation', () => {
    const result = validateAssistantFinalAction(
      {
        type: 'create_thread_thought',
        annotationId: 'annotation_1',
        thought: '这条想法可以沉淀为一个判断框架。',
        evidenceIds: [],
        confidence: 0.78,
        reason: '当前 thread 有足够讨论价值。',
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(),
        allowedAnnotationIds: ['annotation_1'],
      },
    );

    expect(result).toEqual({
      ok: true,
      action: {
        type: 'create_thread_thought',
        annotationId: 'annotation_1',
        thought: '这条想法可以沉淀为一个判断框架。',
        evidenceIds: [],
        confidence: 0.78,
        reason: '当前 thread 有足够讨论价值。',
      },
    });
  });

  it('accepts review_distillation for an allowed annotation', () => {
    const result = validateAssistantFinalAction(
      {
        type: 'review_distillation',
        annotationId: 'annotation_1',
        content: '这个沉淀缺少原文证据，可以先补出判断边界。',
        evidenceIds: [],
        confidence: 0.81,
        reason: '沉淀稿需要审阅意见。',
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(),
        allowedAnnotationIds: ['annotation_1'],
      },
    );

    expect(result).toEqual({
      ok: true,
      action: {
        type: 'review_distillation',
        annotationId: 'annotation_1',
        content: '这个沉淀缺少原文证据，可以先补出判断边界。',
        items: [],
        proposals: [],
        evidenceIds: [],
        confidence: 0.81,
        reason: '沉淀稿需要审阅意见。',
      },
    });
  });

  it('normalizes review_distillation proposals', () => {
    const result = validateAssistantFinalAction(
      {
        type: 'review_distillation',
        annotationId: 'annotation_1',
        content: '建议把这段沉淀改得更可执行。',
        proposals: [
          {
            kind: 'insert',
            content: '新增一个可执行判断。',
            status: 'ignored',
            sourceDraftHash: 'draft_hash_1',
            sourceReviewSessionId: 'review_session_1',
            sourceReviewMessageId: 'review_message_1',
            sourceAgentId: 'agent_1',
          },
          {
            kind: 'replace',
            targetText: '旧判断',
          },
        ],
        evidenceIds: [],
        confidence: 0.81,
        reason: '沉淀稿需要审阅意见。',
      },
      {
        articleId: 'article_1',
        evidenceIds: new Set(),
        allowedAnnotationIds: ['annotation_1'],
      },
    );

    expect(result).toEqual({
      ok: true,
      action: expect.objectContaining({
        proposals: [
          expect.objectContaining({
            id: 'insert_1',
            kind: 'insert',
            status: 'pending',
            title: '新增：新增一个可执行判断。',
            content: '新增一个可执行判断。',
            sourceDraftHash: 'draft_hash_1',
            sourceReviewSessionId: 'review_session_1',
            sourceReviewMessageId: 'review_message_1',
            sourceAgentId: 'agent_1',
          }),
        ],
      }),
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
