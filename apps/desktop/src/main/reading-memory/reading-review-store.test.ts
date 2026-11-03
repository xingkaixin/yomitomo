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
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import { readReadingReviewAsset, type ReadingReviewAsset } from './reading-review-source';
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
});

describe('reading review history pages and source batches', () => {
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
