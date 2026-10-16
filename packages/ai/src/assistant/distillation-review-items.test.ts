import { describe, expect, it } from 'vitest';
import {
  distillationReviewContentFromItems,
  distillationReviewProposalsFromItems,
  parseDistillationReviewItem,
} from './distillation-review-items';

describe('distillation review items', () => {
  it('turns valid tool arguments into review items and proposals', () => {
    const now = () => '2026-06-20T00:00:00.000Z';
    const items = [
      parseDistillationReviewItem(
        { type: 'overview', stance: 'mixed', content: '这段判断有价值，但证据边界还不够清楚。' },
        now,
      ),
      parseDistillationReviewItem(
        { type: 'proposal', kind: 'insert', title: '补证据边界', content: '补一条证据边界。' },
        now,
      ),
    ].map((result) => ('item' in result ? result.item : undefined)!);

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

  it('rejects proposals whose fields do not match their kind', () => {
    expect(
      parseDistillationReviewItem({
        type: 'proposal',
        kind: 'replace',
        title: '改',
        targetText: 'a',
      }),
    ).toEqual({ error: expect.stringContaining('proposal fields do not match kind') });
  });
});
