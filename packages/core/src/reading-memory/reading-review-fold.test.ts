import type { ReadingReviewBase, ReadingReviewEvent } from '@yomitomo/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { foldReadingReviews } from './reading-review-fold';

const base: ReadingReviewBase = {
  articleId: 'article',
  annotationId: 'annotation',
  assetType: 'comment',
  assetId: 'comment',
  assetVersion: 'version-1',
  content: 'Original assistant judgment',
  authorKind: 'ai',
  formedAt: '2026-01-01T00:00:00.000Z',
};

const digests = new Map<string, string>();
beforeAll(async () => {
  for (const text of [base.content, 'My new judgment', 'An independently written answer', ' \n']) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    digests.set(
      text,
      Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join(''),
    );
  }
});

describe('foldReadingReviews', () => {
  it('keeps the original judgment until a valid review and follows parent links rather than input order', () => {
    const agree = review('agree', 'still_agree');
    const need = review('need', 'need_evidence', { previousReviewId: agree.id, answer: '' });
    const changed = review('changed', 'changed', {
      previousReviewId: need.id,
      answer: 'My new judgment',
    });
    const reaffirm = review('reaffirm', 'still_agree', {
      previousReviewId: changed.id,
      judgmentSnapshot: changed.answer,
      judgmentDigest: digest(changed.answer),
    });

    expect(foldReadingReviews(base, [], digest)).toEqual({
      content: base.content,
      authorKind: 'ai',
      latestReview: null,
    });
    expect(foldReadingReviews(base, [agree], digest)).toMatchObject({
      content: base.content,
      authorKind: 'ai',
      latestReview: { id: agree.id, decision: 'still_agree' },
    });
    expect(foldReadingReviews(base, [need, agree], digest)).toMatchObject({
      content: base.content,
      authorKind: 'ai',
      latestReview: { id: need.id, decision: 'need_evidence' },
    });
    expect(foldReadingReviews(base, [changed, agree, need], digest)).toMatchObject({
      content: changed.answer,
      authorKind: 'user',
      latestReview: { id: changed.id, decision: 'changed' },
    });
    expect(foldReadingReviews(base, [reaffirm, changed, agree, need], digest)).toMatchObject({
      content: changed.answer,
      authorKind: 'user',
      latestReview: { id: reaffirm.id, decision: 'still_agree' },
    });
    expect(base.content).toBe('Original assistant judgment');
    expect(base.formedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps unrelated assets and earlier versions in history without applying their reviews', () => {
    const current = review('current', 'still_agree');
    const events = [
      review('old-version', 'changed', { assetVersion: 'old-version' }),
      review('other-article', 'changed', { articleId: 'other' }),
      review('other-annotation', 'changed', { annotationId: 'other' }),
      review('other-type', 'changed', { assetType: 'distillation' }),
      review('other-asset', 'changed', { assetId: 'other' }),
      current,
    ];
    expect(foldReadingReviews(base, events, digest).latestReview?.id).toBe(current.id);
    expect(events).toHaveLength(6);
  });

  it('keeps a valid review when formation metadata changes without an asset version change', () => {
    const changed = review('changed', 'changed', { answer: 'My new judgment' });
    const before = foldReadingReviews(base, [changed], digest);
    const metadataChanged = { ...base, formedAt: '2026-03-01T00:00:00.000Z' };
    const after = foldReadingReviews(metadataChanged, [changed], digest);
    expect(after).toEqual(before);
    expect(after.content).toBe(changed.answer);
  });

  it.each([
    { judgmentSnapshot: `${base.content} ` },
    { judgmentDigest: 'f'.repeat(64) },
    { judgmentDigest: '12345678' },
    { createdAt: 'not-a-date' },
    { createdAt: '2025-12-31T00:00:00.000Z' },
    { answer: ' \n' },
  ])('stops at an invalid event without applying its descendants: %j', (invalid) => {
    const first = review('first', 'still_agree');
    const broken = review('broken', 'changed', { previousReviewId: first.id, ...invalid });
    const tail = review('tail', 'changed', {
      previousReviewId: broken.id,
      judgmentSnapshot: broken.answer,
      judgmentDigest: digest(broken.answer),
      answer: 'Must not become current',
    });
    expect(foldReadingReviews(base, [tail, first, broken], digest)).toMatchObject({
      content: base.content,
      latestReview: { id: first.id },
    });
  });

  it('rejects time regression between reviews even if snapshots and digests match', () => {
    const first = review('first', 'still_agree', { createdAt: '2026-02-03T00:00:00.000Z' });
    const earlier = review('earlier', 'changed', { previousReviewId: first.id });
    expect(foldReadingReviews(base, [earlier, first], digest).latestReview?.id).toBe(first.id);
  });

  it('stops before an ambiguous branch or repeated id regardless of event order', () => {
    const first = review('first', 'still_agree');
    const left = review('left', 'changed', { previousReviewId: first.id, answer: 'Left' });
    const right = review('right', 'changed', { previousReviewId: first.id, answer: 'Right' });
    for (const events of [
      [first, left, right],
      [right, left, first],
      [first, left, { ...left, previousReviewId: 'missing' }],
    ]) {
      expect(foldReadingReviews(base, events, digest)).toMatchObject({
        content: base.content,
        latestReview: { id: first.id },
      });
    }
    expect(
      foldReadingReviews(base, [first, { ...first, previousReviewId: left.id }, left], digest)
        .latestReview,
    ).toBeNull();
    expect(
      foldReadingReviews(
        base,
        [
          { ...left, previousReviewId: right.id },
          { ...right, previousReviewId: left.id },
        ],
        digest,
      ).latestReview,
    ).toBeNull();
  });
});

function review(
  id: string,
  decision: ReadingReviewEvent['decision'],
  patch: Partial<ReadingReviewEvent> = {},
): ReadingReviewEvent {
  return {
    articleId: base.articleId,
    annotationId: base.annotationId,
    assetType: base.assetType,
    assetId: base.assetId,
    assetVersion: base.assetVersion,
    id,
    decision,
    judgmentSnapshot: base.content,
    judgmentDigest: digest(base.content),
    previousReviewId: null,
    answer: 'An independently written answer',
    createdAt: '2026-02-01T00:00:00.000Z',
    ...patch,
  };
}

function digest(text: string) {
  const value = digests.get(text);
  if (!value) throw new Error(`Missing fixture digest: ${text}`);
  return value;
}
