import { createHash, randomUUID } from 'node:crypto';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { ReadingReviewAssetRef, ReadingReviewDecision } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readArticleAnnotations } from '../articles/article-annotation-hydration';
import {
  saveAnnotationDistillationRows,
  upsertAnnotationRows,
} from '../articles/article-annotation-upsert';
import {
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
} from '../articles/article-repository-lifecycle';
import { migrations } from '../db/migrations';
import * as schema from '../db/schema';
import { readReadingMemoryProjectionJobs } from './reading-memory-projection-job-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import {
  readReadingReviewAsset,
  readReadingReviewAssetPage,
  readReadingReviewAssets,
  type ReadingReviewAsset,
} from './reading-review-source';
import { appendReadingReview, readReadingReviewHistory } from './reading-review-store';

const timestamp = '2026-08-30T00:00:00.000Z';
const databases: SQLiteDatabase.Database[] = [];
const commentRef: ReadingReviewAssetRef = {
  articleId: 'article',
  annotationId: 'annotation',
  assetType: 'comment',
  assetId: 'comment',
};
const distillationRef: ReadingReviewAssetRef = {
  ...commentRef,
  assetType: 'distillation',
  assetId: 'annotation',
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const database of databases.splice(0)) database.close();
  vi.useRealTimers();
});

describe('reading review source versions', () => {
  it.each([commentRef, distillationRef])(
    'isolates $assetType versions from sibling changes and rejects an ABA edit',
    (ref) => {
      const fixture = createFixture();
      const initial = fixture.read(ref);
      const oldInput = reviewInput(initial, 'old-review');
      fixture.insertComment('sibling');
      fixture.setContent({ ...commentRef, assetId: 'sibling' }, '新回复');

      expect(fixture.read(ref).base.assetVersion).toBe(initial.base.assetVersion);
      fixture.setContent(ref, '直接编辑后的判断');
      fixture.setContent(ref, initial.base.content);

      const current = fixture.read(ref);
      expect(current.base.content).toBe(initial.base.content);
      expect(current.base.assetVersion).not.toBe(initial.base.assetVersion);
      expect(() => appendReadingReview(fixture.executor, oldInput)).toThrow(
        'READING_REVIEW_CONFLICT',
      );
      expect(readReadingReviewHistory(fixture.executor, ref).events).toEqual([]);
    },
  );

  it('starts a new chain after direct editing without losing the old review history', () => {
    const fixture = createFixture();
    const original = fixture.read();
    const first = appendReadingReview(fixture.executor, reviewInput(original, 'review-1'));
    fixture.setContent(commentRef, '直接修改的原始判断');

    const edited = fixture.read();
    expect(edited.current).toMatchObject({ content: '直接修改的原始判断', latestReview: null });
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([first.event]);
    const second = appendReadingReview(fixture.executor, reviewInput(edited, 'review-2'));

    expect(second.event.previousReviewId).toBeNull();
    expect(second.event.assetVersion).not.toBe(first.event.assetVersion);
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toHaveLength(2);
  });

  it('preserves a comment review through reply and creation-time metadata round trips', () => {
    const fixture = createFixture();
    fixture.insertComment('parent');
    const database = drizzle(fixture.database, { schema });
    const [annotation] = readArticleAnnotations(database, commentRef.articleId);
    if (!annotation) throw new Error('Expected the stored annotation');
    upsertAnnotationRows(
      database,
      { articleId: commentRef.articleId, annotation },
      fixture.executor,
    );
    const original = fixture.read();
    const reviewed = appendReadingReview(fixture.executor, reviewInput(original, 'comment-review'));
    const snapshots = [];
    for (const metadata of [
      { replyTo: 'parent', createdAt: timestamp },
      { replyTo: undefined, createdAt: timestamp },
      { replyTo: undefined, createdAt: '2027-01-01T00:00:00.000Z' },
      { replyTo: undefined, createdAt: timestamp },
    ]) {
      upsertAnnotationRows(
        database,
        {
          articleId: commentRef.articleId,
          annotation: {
            ...annotation,
            comments: annotation.comments.map((comment) =>
              comment.id === commentRef.assetId ? Object.assign({}, comment, metadata) : comment,
            ),
          },
        },
        fixture.executor,
      );
      snapshots.push(fixture.read());
    }

    for (const snapshot of snapshots) {
      expect(snapshot.base.assetVersion).toBe(original.base.assetVersion);
      expect(snapshot.current).toEqual(reviewed.asset.current);
    }
    expect(snapshots[2]?.base.formedAt).toBe('2027-01-01T00:00:00.000Z');
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([reviewed.event]);
  });

  it('preserves a reviewed distillation when only its editing session timestamp changes', () => {
    const fixture = createFixture();
    fixture.database
      .prepare('UPDATE annotations SET distillation_published_at = NULL WHERE id = ?')
      .run(distillationRef.annotationId);
    const original = fixture.read(distillationRef);
    const reviewed = appendReadingReview(
      fixture.executor,
      reviewInput(original, 'distillation-review'),
    );
    const editedAt = new Date(Date.parse(reviewed.event.createdAt) + 1000).toISOString();

    const saved = saveAnnotationDistillationRows(
      drizzle(fixture.database, { schema }),
      {
        articleId: distillationRef.articleId,
        annotationId: distillationRef.annotationId,
        expectedDistillationUpdatedAt: timestamp,
        distillation: {
          status: 'published',
          content: original.base.content,
          updatedAt: editedAt,
          reviewSessions: [],
        },
      },
      fixture.executor,
    );
    const current = fixture.read(distillationRef);

    expect(saved).not.toBeNull();
    expect(current.current).toEqual(reviewed.asset.current);
    expect(current.base).toEqual(original.base);
    expect(readReadingReviewHistory(fixture.executor, distillationRef).events).toEqual([
      reviewed.event,
    ]);
  });

  it('requires a current raw user contribution for an AI judgment even after that judgment was reviewed', () => {
    const fixture = createFixture();
    deleteCommentRowsWithMemoryLifecycle(fixture.executor, {
      articleId: commentRef.articleId,
      annotationId: commentRef.annotationId,
      commentId: commentRef.assetId,
    });
    fixture.database
      .prepare(`INSERT INTO comments (id, annotation_id, author, content, created_at)
VALUES ('ai-comment', 'annotation', 'ai', '助手形成的判断', ?)`)
      .run(timestamp);
    const aiRef: ReadingReviewAssetRef = { ...commentRef, assetId: 'ai-comment' };
    expect(readReadingReviewAsset(fixture.executor, aiRef)).toBeNull();
    fixture.insertComment('blank-user');
    fixture.setContent({ ...commentRef, assetId: 'blank-user' }, '\u00a0\u2003');
    fixture.insertComment('pending-user');
    fixture.database.prepare('UPDATE comments SET pending = 1 WHERE id = ?').run('pending-user');
    expect(readReadingReviewAsset(fixture.executor, aiRef)).toBeNull();
    fixture.insertComment('valid-user');
    const eligible = fixture.read(aiRef);
    const input = reviewInput(eligible, 'ai-review', 'changed', '用户复审后的判断');
    const saved = appendReadingReview(fixture.executor, input);

    deleteCommentRowsWithMemoryLifecycle(fixture.executor, {
      articleId: aiRef.articleId,
      annotationId: aiRef.annotationId,
      commentId: 'valid-user',
    });

    expect(readReadingReviewAsset(fixture.executor, aiRef)).toBeNull();
    expect(() => appendReadingReview(fixture.executor, input)).toThrow('READING_REVIEW_CONFLICT');
    expect(readReadingReviewHistory(fixture.executor, aiRef).events).toEqual([saved.event]);
    fixture.insertComment('valid-user');

    const restored = fixture.read(aiRef);
    expect(restored.base.assetVersion).toBe(eligible.base.assetVersion);
    expect(restored.current).toEqual(saved.asset.current);
  });
});

describe('reading review submission consistency', () => {
  it('keeps a submitted review effective when the imported source was formed after the local clock', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(timestamp));
    const fixture = createFixture();
    fixture.database
      .prepare('UPDATE comments SET created_at = ? WHERE id = ?')
      .run('2027-01-01T00:00:00.000Z', commentRef.assetId);
    const original = fixture.read();

    const saved = appendReadingReview(
      fixture.executor,
      reviewInput(original, 'future-source-review'),
    );

    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([saved.event]);
    expect(saved.asset.current.latestReview?.id).toBe(saved.event.id);
    expect(saved.event.createdAt >= original.base.formedAt).toBe(true);
  });

  it('rejects a review after a parent at the Date limit without adding an event', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(8_640_000_000_000_000));
    const fixture = createFixture();
    const first = appendReadingReview(fixture.executor, reviewInput(fixture.read(), 'last-date'));
    vi.setSystemTime(new Date(timestamp));

    expect(() =>
      appendReadingReview(fixture.executor, reviewInput(first.asset, 'overflow-date')),
    ).toThrow('READING_REVIEW_CONFLICT');
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([first.event]);
    expect(fixture.read().current).toEqual(first.asset.current);
  });

  it('compares both the previous event and the current judgment digest before appending', () => {
    const fixture = createFixture();
    const initial = fixture.read();
    const stale = reviewInput(initial, 'stale-review');
    const first = appendReadingReview(
      fixture.executor,
      reviewInput(initial, 'review-1', 'still_agree', '我仍然认同'),
    );

    expect(first.asset.current.content).toBe(initial.current.content);
    expect(() => appendReadingReview(fixture.executor, stale)).toThrow('READING_REVIEW_CONFLICT');
    const wrongDigest = {
      ...reviewInput(first.asset, 'wrong-digest'),
      judgmentDigest: digest('旧判断'),
    };
    expect(() => appendReadingReview(fixture.executor, wrongDigest)).toThrow(
      'READING_REVIEW_CONFLICT',
    );
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([first.event]);
  });

  it('acknowledges a lost-response retry after the head advances without repeating its write', () => {
    const fixture = createFixture();
    const input = reviewInput(fixture.read(), 'review-1');
    const first = appendReadingReview(fixture.executor, input);
    const second = appendReadingReview(
      fixture.executor,
      reviewInput(first.asset, 'review-2', 'changed', '后一次判断'),
    );
    const queued = readReadingMemoryProjectionJobs(fixture.executor, 10);

    const retried = appendReadingReview(fixture.executor, input);

    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(true);
    expect(retried.inserted).toBe(false);

    expect(retried.event).toEqual(first.event);
    expect(retried.asset.current).toEqual(second.asset.current);
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([
      second.event,
      first.event,
    ]);
    expect(readReadingMemoryProjectionJobs(fixture.executor, 10)).toEqual(queued);
    expect(() =>
      appendReadingReview(fixture.executor, { ...input, answer: '不同的重试正文' }),
    ).toThrow('READING_REVIEW_CONFLICT');

    fixture.setContent(commentRef, '用户直接修改后的判断');
    const edited = fixture.read();
    const afterEdit = appendReadingReview(fixture.executor, input);
    expect(afterEdit.event).toEqual(first.event);
    expect(afterEdit.asset.base).toEqual(edited.base);
    expect(afterEdit.asset.current).toMatchObject({
      content: '用户直接修改后的判断',
      latestReview: null,
    });
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toHaveLength(2);
  });

  it.each([commentRef, distillationRef])(
    'rejects committed $assetType retries after eligibility is lost or the source is deleted',
    (ref) => {
      const fixture = createFixture();
      const input = reviewInput(fixture.read(ref), 'review-1');
      appendReadingReview(fixture.executor, input);
      if (ref.assetType === 'comment')
        fixture.database.prepare('UPDATE comments SET pending = 1 WHERE id = ?').run(ref.assetId);
      else
        fixture.database
          .prepare('UPDATE annotations SET distillation_status = ? WHERE id = ?')
          .run('unpublished', ref.assetId);

      expect(readReadingReviewAsset(fixture.executor, ref)).toBeNull();
      expect(() => appendReadingReview(fixture.executor, input)).toThrow('READING_REVIEW_CONFLICT');
      expect(readReadingReviewHistory(fixture.executor, ref).events).toHaveLength(1);
      if (ref.assetType === 'comment')
        deleteCommentRowsWithMemoryLifecycle(fixture.executor, {
          articleId: ref.articleId,
          annotationId: ref.annotationId,
          commentId: ref.assetId,
        });
      else
        deleteAnnotationRowsWithMemoryLifecycle(fixture.executor, {
          articleId: ref.articleId,
          annotationId: ref.annotationId,
        });

      expect(readReadingReviewAsset(fixture.executor, ref)).toBeNull();
      expect(readReadingReviewHistory(fixture.executor, ref).events).toEqual([]);
      expect(fixture.database.prepare('SELECT id FROM reading_memory_reviews').all()).toEqual([]);
      expect(() => appendReadingReview(fixture.executor, input)).toThrow('READING_REVIEW_CONFLICT');
    },
  );

  it('requires blind answers for agreement or change and bounds optional answers', () => {
    const fixture = createFixture();
    const original = fixture.read();
    for (const decision of ['still_agree', 'changed'] as const) {
      expect(() =>
        appendReadingReview(
          fixture.executor,
          reviewInput(original, 'empty-answer', decision, ' \n '),
        ),
      ).toThrow('READING_REVIEW_INVALID_ANSWER');
    }
    const accepted = appendReadingReview(
      fixture.executor,
      reviewInput(original, 'largest-answer', 'need_evidence', '字'.repeat(8192)),
    );
    expect(accepted.event.answer).toHaveLength(8192);
    expect(() =>
      appendReadingReview(
        fixture.executor,
        reviewInput(accepted.asset, 'oversized-answer', 'need_evidence', '字'.repeat(8193)),
      ),
    ).toThrow('READING_REVIEW_INVALID_ANSWER');
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([accepted.event]);
  });

  it('folds need-evidence and changed decisions without overwriting the original judgment', () => {
    const fixture = createFixture();
    const original = fixture.read();
    const unsure = appendReadingReview(
      fixture.executor,
      reviewInput(original, 'review-1', 'need_evidence', ''),
    );

    expect(unsure.asset.current).toMatchObject({
      content: original.base.content,
      latestReview: { id: 'review-1', decision: 'need_evidence' },
    });
    const changed = appendReadingReview(
      fixture.executor,
      reviewInput(unsure.asset, 'review-2', 'changed', '现在认为需要区分不同情况'),
    );

    expect(changed.asset.current).toMatchObject({
      content: '现在认为需要区分不同情况',
      latestReview: { id: 'review-2', decision: 'changed' },
    });
    expect(changed.asset.base).toEqual(original.base);
    expect(changed.event).toMatchObject({
      judgmentSnapshot: original.base.content,
      judgmentDigest: digest(original.base.content),
      previousReviewId: 'review-1',
      answer: '现在认为需要区分不同情况',
    });
    expect(readReadingMemoryProjectionJobs(fixture.executor, 10)).toEqual([
      expect.objectContaining({
        targetType: 'annotation_thread',
        targetId: 'annotation',
        operation: 'upsert',
      }),
    ]);
  });

  it('keeps invalid chain suffixes in history but excludes them from the effective judgment', () => {
    const fixture = createFixture();
    const first = appendReadingReview(fixture.executor, reviewInput(fixture.read(), 'review-1'));
    fixture.database
      .prepare(`
INSERT INTO reading_memory_reviews (
  id, article_id, annotation_id, asset_type, asset_id, asset_version,
  judgment_snapshot, judgment_digest, previous_review_id, decision, answer, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'changed', ?, ?)
`)
      .run(
        'invalid-review',
        commentRef.articleId,
        commentRef.annotationId,
        commentRef.assetType,
        commentRef.assetId,
        first.event.assetVersion,
        '不是当前有效判断',
        digest('不是当前有效判断'),
        first.event.id,
        '坏链不应成为当前判断',
        new Date(Date.parse(first.event.createdAt) + 1).toISOString(),
      );

    expect(fixture.read().current).toEqual(first.asset.current);
    expect(
      readReadingReviewHistory(fixture.executor, commentRef).events.map((event) => event.id),
    ).toEqual(['invalid-review', 'review-1']);
    expect(() =>
      appendReadingReview(fixture.executor, reviewInput(first.asset, 'branch-around-invalid')),
    ).toThrow('READING_REVIEW_CONFLICT');
  });

  it('rolls back the review event when its durable projection job cannot be queued', () => {
    const fixture = createFixture();
    const original = fixture.read();
    const input = reviewInput(original, 'review-1');
    fixture.database.exec(`
CREATE TEMP TRIGGER reject_review_projection BEFORE INSERT ON reading_memory_projection_jobs BEGIN
  SELECT RAISE(ABORT, 'projection queue unavailable');
END;
`);

    expect(() => appendReadingReview(fixture.executor, input)).toThrow();
    expect(readReadingReviewHistory(fixture.executor, commentRef).events).toEqual([]);
    expect(readReadingMemoryProjectionJobs(fixture.executor, 10)).toEqual([]);
    expect(fixture.read().current).toEqual(original.current);
    fixture.database.exec('DROP TRIGGER reject_review_projection');

    expect(appendReadingReview(fixture.executor, input).event.id).toBe('review-1');
  });
});

describe('reading review history pages and source batches', () => {
  it('reads event bodies only for assets with history on their current version in a sixty-four-asset batch', () => {
    const fixture = createFixture();
    fixture.database.prepare('DELETE FROM comments').run();
    const refs = Array.from({ length: 64 }, (_, index): ReadingReviewAssetRef => ({
      ...commentRef,
      assetId: `comment-${String(index).padStart(3, '0')}`,
    }));
    for (const ref of refs) fixture.insertComment(ref.assetId);
    const prepare = vi.spyOn(fixture.database, 'prepare');
    const historyReads = () =>
      prepare.mock.calls.filter(
        ([sql]) =>
          /\bFROM\s+reading_memory_reviews\b/i.test(sql) && /\bjudgment_snapshot\b/.test(sql),
      ).length;

    const unreviewed = readReadingReviewAssets(fixture.executor, refs);
    expect(unreviewed).toHaveLength(64);
    expect(historyReads()).toBe(0);
    const currentReview = appendReadingReview(
      fixture.executor,
      reviewInput(unreviewed[0], 'current-version-review'),
    );
    appendReadingReview(fixture.executor, reviewInput(unreviewed[1], 'old-version-review'));
    fixture.setContent(refs[1], '已直接编辑的版本');
    prepare.mockClear();

    const reviewed = readReadingReviewAssets(fixture.executor, refs);

    expect(historyReads()).toBe(1);
    expect(reviewed).toHaveLength(64);
    expect(reviewed[0].current).toEqual(currentReview.asset.current);
    expect(reviewed[1].current).toMatchObject({ content: '已直接编辑的版本', latestReview: null });
    expect(reviewed.slice(2)).toEqual(unreviewed.slice(2));
    expect(
      fixture.database.prepare('SELECT id FROM reading_memory_reviews ORDER BY id').all(),
    ).toEqual([{ id: 'current-version-review' }, { id: 'old-version-review' }]);
  });

  it('paginates fifty history events without losing equal-clock submissions', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(timestamp));
    const fixture = createFixture();
    let asset = fixture.read();
    for (let index = 0; index < 51; index += 1)
      asset = appendReadingReview(fixture.executor, reviewInput(asset, `review-${index}`)).asset;

    const first = readReadingReviewHistory(fixture.executor, commentRef);
    expect(first.events).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = readReadingReviewHistory(
      fixture.executor,
      commentRef,
      first.nextCursor ?? undefined,
    );

    expect(second.events).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const events = [...first.events, ...second.events];
    expect(events.map((event) => event.id)).toEqual(
      Array.from({ length: 51 }, (_, index) => `review-${50 - index}`),
    );
    expect(new Set(events.map((event) => event.createdAt)).size).toBe(51);
    expect(
      events.every((event, index) => index === 0 || event.createdAt < events[index - 1].createdAt),
    ).toBe(true);
  });

  it('advances a sixty-four-row raw cursor past ineligible candidates and hydrates larger ref batches', () => {
    const fixture = createFixture();
    fixture.database.prepare('DELETE FROM comments').run();
    const refs = Array.from({ length: 65 }, (_, index): ReadingReviewAssetRef => ({
      ...commentRef,
      assetId: `comment-${String(index).padStart(3, '0')}`,
    }));
    for (const ref of refs) fixture.insertComment(ref.assetId);
    fixture.database.prepare('UPDATE comments SET pending = 1 WHERE id = ?').run(refs[0].assetId);

    const first = readReadingReviewAssetPage(fixture.executor);
    expect(first.assets.map((asset) => asset.base.assetId)).toEqual(
      refs.slice(1, 64).map((ref) => ref.assetId),
    );
    expect(first.nextCursor).toEqual({ assetType: 'comment', assetId: refs[63].assetId });
    const second = readReadingReviewAssetPage(fixture.executor, first.nextCursor ?? undefined);
    expect(second.assets.map((asset) => asset.base.assetId)).toEqual([
      refs[64].assetId,
      'annotation',
    ]);
    expect(second.nextCursor).toBeNull();
    expect(
      readReadingReviewAssets(fixture.executor, refs).map((asset) => asset.base.assetId),
    ).toEqual(refs.slice(1).map((ref) => ref.assetId));
  });
});

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  databases.push(database);
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  database
    .prepare(`
INSERT INTO articles (id, url, canonical_url, title, content_hash, created_at, updated_at)
VALUES ('article', 'url', 'url', '测试资料', 'hash', ?, ?)
`)
    .run(timestamp, timestamp);
  database
    .prepare(`
INSERT INTO annotations (
  id, article_id, anchor, author, color, distillation_status, distillation_content,
  distillation_published_at, distillation_updated_at, created_at, updated_at
) VALUES ('annotation', 'article', ?, 'user', 'color', 'published', '原始提炼判断', ?, ?, ?, ?)
`)
    .run(
      JSON.stringify({ exact: '划线问题上下文', prefix: '', suffix: '', start: 0, end: 8 }),
      timestamp,
      timestamp,
      timestamp,
      timestamp,
    );
  const executor: ReadingMemorySqliteExecutor = database;
  const insertComment = (id: string) =>
    database
      .prepare(`
INSERT INTO comments (id, annotation_id, author, content, created_at)
VALUES (?, 'annotation', 'user', '原始个人判断', ?)
`)
      .run(id, timestamp);
  insertComment(commentRef.assetId);
  return {
    database,
    executor,
    insertComment,
    read(ref: ReadingReviewAssetRef = commentRef) {
      const asset = readReadingReviewAsset(executor, ref);
      if (!asset) throw new Error('Expected a current review asset');
      return asset;
    },
    setContent(ref: ReadingReviewAssetRef, content: string) {
      if (ref.assetType === 'comment')
        database
          .prepare('UPDATE comments SET content = ?, asset_revision = ? WHERE id = ?')
          .run(content, randomUUID(), ref.assetId);
      else
        database
          .prepare(
            'UPDATE annotations SET distillation_content = ?, distillation_revision = ? WHERE id = ?',
          )
          .run(content, randomUUID(), ref.assetId);
    },
  };
}

function reviewInput(
  asset: ReadingReviewAsset,
  id: string,
  decision: ReadingReviewDecision = 'changed',
  answer = '复审后的个人判断',
): Parameters<typeof appendReadingReview>[1] {
  const { articleId, annotationId, assetType, assetId, assetVersion } = asset.base;
  return {
    id,
    asset: { articleId, annotationId, assetType, assetId },
    assetVersion,
    judgmentDigest: digest(asset.current.content),
    headReviewId: asset.current.latestReview?.id ?? null,
    decision,
    answer,
  };
}

function digest(content: string) {
  return createHash('sha256').update(content).digest('hex');
}
