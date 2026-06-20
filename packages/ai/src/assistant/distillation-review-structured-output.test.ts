import { describe, expect, it } from 'vitest';
import {
  collectDistillationReviewItemsFromJsonTextStream,
  distillationReviewContentFromItems,
  distillationReviewProposalsFromItems,
  distillationReviewStructuredOutputPrompt,
} from './distillation-review-structured-output';

describe('distillation review structured output', () => {
  it('collects JSON object stream items into review items and proposals', async () => {
    const emitted: unknown[] = [];
    const items = await collectDistillationReviewItemsFromJsonTextStream({
      textStream: chunks(
        '{"type":"overview","stance":"mixed","content":"这段判断有价值，但证据边界还不够清楚。"}\n',
        '{"type":"proposal","kind":"insert","title":"补证据边界","content":"补一条证据边界。"}\n',
      ),
      onItem: (item) => emitted.push(item),
      now: () => '2026-06-20T00:00:00.000Z',
    });

    expect(items).toHaveLength(2);
    expect(emitted).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'overview',
      stance: 'mixed',
      content: '这段判断有价值，但证据边界还不够清楚。',
    });
    expect(distillationReviewContentFromItems(items)).toContain('这段判断有价值');
    expect(distillationReviewProposalsFromItems(items)).toEqual([
      expect.objectContaining({
        kind: 'insert',
        status: 'pending',
        title: '补证据边界',
        content: '补一条证据边界。',
        updatedAt: '2026-06-20T00:00:00.000Z',
      }),
    ]);
  });

  it('keeps discussion organization output rules from evaluating draft quality', () => {
    const prompt = distillationReviewStructuredOutputPrompt({
      jsonlFallback: false,
      mode: 'organize_discussion',
    });

    expect(prompt).toContain('可沉淀方向');
    expect(prompt).toContain('不要评价现有草稿质量');
    expect(prompt).toContain('proposal 只能使用 kind="insert"');
    expect(prompt).not.toContain('第一条应该是 overview，用自然语言给出总评。');
  });
});

async function* chunks(...values: string[]) {
  for (const value of values) yield value;
}
