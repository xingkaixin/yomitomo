import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ReadingMemorySemanticStatus,
  ReadingReviewAssetRef,
  ReadingReviewDecision,
} from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paths = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));
vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return { loadSQLiteDatabase: () => SQLiteDatabase };
});
vi.mock('../app/logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));

import * as schema from '../db/schema';
import { closeDatabase, getDatabase, getSqliteExecutor } from '../store/store-db';
import { runReadingMemoryEvidenceProjectionBatch } from './reading-memory-evidence-projection-batch';
import {
  materializeReadingEvidenceCandidates,
  readReadingEvidenceProjectionStatus,
  searchReadingEvidence,
} from './reading-memory-evidence-search';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import {
  readingMemoryModelRelease,
  readingMemoryModelVectorDimension,
} from './reading-memory-model-manifest';
import {
  readMissingReadingMemoryVectors,
  writeReadingMemoryVectors,
} from './reading-memory-vector-store';
import { createReadingReviewQueue } from './reading-review-queue';
import { readReadingReviewAsset } from './reading-review-source';
import { appendReadingReview } from './reading-review-store';

const library = { kind: 'library' } as const;
const model = {
  modelVersion: readingMemoryModelRelease.internalId,
  dimension: readingMemoryModelVectorDimension,
};

beforeEach(async () => {
  closeDatabase();
  paths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-review-queue-'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabase();
  await rm(paths.userData, { recursive: true, force: true });
  paths.userData = '';
});

describe('reading review queue', () => {
  it('derives the oldest 64 raw judgments without revealing their text or requiring projections', async () => {
    const fixture = createFixture();
    for (let index = 0; index < 70; index += 1) fixture.add(`comment-${index}`, 100 - index);
    const queue = await fixture.readQueue();
    expect(queue.items.map((item) => item.asset.assetId)).toEqual(
      Array.from({ length: 64 }, (_, index) => `comment-${index}`),
    );
    expect(queue.coverage).toEqual({
      eligibleAssetCount: 70,
      timeCandidateCount: 64,
      semanticCandidateCount: 0,
      recentEvidenceCount: 0,
    });
    expect(queue.mode).toBe('time');
    expect(JSON.stringify(queue)).not.toContain('UNREVEALED');
    expect(queue.items[0]?.quote).toBe('Necessary source context comment-0');
    expect(queue.projection.coverage.projectedAssetCount).toBe(0);
  });

  it('uses the current valid review date instead of the original formation date', async () => {
    const fixture = createFixture();
    const old = fixture.add('old', 100);
    fixture.add('unreviewed', 50);
    fixture.review(old, 'need_evidence', '');
    const queue = await fixture.readQueue();
    expect(queue.items.map((item) => item.asset.assetId)).toEqual(['unreviewed', 'old']);
    expect(queue.items[1]?.lastReviewedAt).not.toBeNull();
  });

  it('uses only current local vectors to weakly promote nearby dates', async () => {
    const fixture = createFixture();
    const oldest = fixture.add('oldest', 10);
    const related = fixture.add('related', 9);
    const recent = fixture.add('recent', 1);
    fixture.vector(oldest, 1);
    fixture.vector(related, 0);
    fixture.vector(recent, 0);
    fixture.semanticAvailable = true;
    const semantic = await fixture.readQueue();
    expect(semantic.items[0]?.asset.assetId).toBe('related');
    expect(semantic.mode).toBe('semantic');
    fixture.semanticAvailable = false;
    const time = await fixture.readQueue();
    expect(time.items[0]?.asset.assetId).toBe('oldest');
    expect(time.mode).toBe('time');
    expect(time.coverage.semanticCandidateCount).toBe(0);
  });
});

describe('reviewed evidence projection', () => {
  it.each(['still_agree', 'changed', 'need_evidence'] as const)(
    'invalidates old evidence and reprojects the current %s judgment without changing its identity',
    (decision) => {
      const fixture = createFixture();
      const ref = fixture.add('reviewed');
      fixture.vector(ref, 0);
      const [before] = readStoredAnnotationThreadSources(fixture.executor, [ref.annotationId]);
      const candidate = {
        id: `reading_evidence_comment:${ref.assetId}`,
        articleId: ref.articleId,
        targetId: ref.annotationId,
        sourceVersion: before.sourceVersion,
      };
      const saved = fixture.review(
        ref,
        decision,
        decision === 'need_evidence' ? '' : 'My independent new answer',
      );
      const [after] = readStoredAnnotationThreadSources(fixture.executor, [ref.annotationId]);
      expect(after?.sourceVersion).not.toBe(before?.sourceVersion);
      expect(materializeReadingEvidenceCandidates(fixture.executor, [candidate], library)).toEqual(
        [],
      );
      fixture.project();
      const query = decision === 'changed' ? 'independent new answer' : 'UNREVEALED judgment';
      const result = searchReadingEvidence({ executor: fixture.executor, scope: library, query });
      expect(result.evidence).toEqual([
        expect.objectContaining({
          id: candidate.id,
          content:
            decision === 'changed' ? 'My independent new answer' : 'UNREVEALED judgment reviewed',
          review: { decision, reviewedAt: saved.event.createdAt },
        }),
      ]);
      expect(
        fixture.executor.prepare('SELECT content FROM comments WHERE id = ?').get(ref.assetId),
      ).toEqual({ content: 'UNREVEALED judgment reviewed' });
      expect(
        fixture.executor
          .prepare('SELECT count(*) AS count FROM reading_memory_evidence_entries')
          .get(),
      ).toEqual({ count: 2 });
    },
  );
});

function createFixture() {
  const database = getDatabase();
  const executor = getSqliteExecutor();
  const getStatus = vi.fn(async () => {
    const currentExecutor = getSqliteExecutor();
    const semantic: ReadingMemorySemanticStatus = {
      state: fixture.semanticAvailable ? 'available' : 'not_installed',
      modelVersion: model.modelVersion,
      queryModelVersion: fixture.semanticAvailable ? model.modelVersion : null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 0 },
      indexingPaused: false,
    };
    return {
      projection: readReadingEvidenceProjectionStatus({
        executor: currentExecutor,
        scope: library,
      }),
      semantic,
    };
  });
  const fixture = {
    executor,
    semanticAvailable: false,
    readQueue: createReadingReviewQueue({ semanticIndex: { getStatus } }),
    add: (id: string, daysAgo = 10): ReadingReviewAssetRef => {
      const createdAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
      const articleId = `article-${id}`;
      const annotationId = `annotation-${id}`;
      database
        .insert(schema.articles)
        .values({
          id: articleId,
          url: `https://example.test/${id}`,
          canonicalUrl: `https://example.test/${id}`,
          sourceType: 'web',
          title: `Source ${id}`,
          contentHash: id,
          createdAt,
          updatedAt: createdAt,
        })
        .run();
      database
        .insert(schema.annotations)
        .values({
          id: annotationId,
          articleId,
          author: 'user',
          color: '#000000',
          anchor: {
            exact: `Necessary source context ${id}`,
            prefix: '',
            suffix: '',
            start: 0,
            end: 30,
          },
          createdAt,
          updatedAt: createdAt,
        })
        .run();
      database
        .insert(schema.comments)
        .values({
          id,
          annotationId,
          author: 'user',
          content: `UNREVEALED judgment ${id}`,
          createdAt,
        })
        .run();
      return { articleId, annotationId, assetType: 'comment', assetId: id };
    },
    project: () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const result = runReadingMemoryEvidenceProjectionBatch(executor, {
          jobLimit: 100,
          backfillLimit: 100,
        });
        if (!result.hasImmediateWork) return;
      }
      throw new Error('Projection did not settle');
    },
    vector: (ref: ReadingReviewAssetRef, axis: number) => {
      fixture.project();
      const entries = readMissingReadingMemoryVectors(executor, { ...model, limit: 100 }).filter(
        (entry) => entry.id === `reading_evidence_comment:${ref.assetId}`,
      );
      const vector = new Float32Array(model.dimension);
      vector[axis] = 1;
      expect(writeReadingMemoryVectors(executor, { ...model, entries, vectors: vector })).toBe(1);
    },
    review: (ref: ReadingReviewAssetRef, decision: ReadingReviewDecision, answer: string) => {
      const asset = readReadingReviewAsset(executor, ref);
      if (!asset) throw new Error('Missing review asset');
      return appendReadingReview(executor, {
        id: randomUUID(),
        asset: ref,
        assetVersion: asset.base.assetVersion,
        judgmentDigest: createHash('sha256').update(asset.current.content).digest('hex'),
        headReviewId: asset.current.latestReview?.id ?? null,
        decision,
        answer,
      });
    },
  };
  return fixture;
}
