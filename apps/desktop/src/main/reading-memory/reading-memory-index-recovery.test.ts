import { createHash } from 'node:crypto';
import type { ReadingReviewAssetRef } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../db/migrations';
import { createReadingMemoryControls } from './reading-memory-controls';
import {
  runReadingMemoryEvidenceProjectionBatch,
  type ReadingMemoryEvidenceProjectionBatchOptions,
} from './reading-memory-evidence-projection-batch';
import type {
  ReadingMemoryModelLifecycle,
  ReadingMemoryModelLifecycleState,
} from './reading-memory-model-lifecycle';
import {
  readingMemoryModelRelease,
  readingMemoryModelVectorDimension,
} from './reading-memory-model-manifest';
import { createReadingMemorySemanticIndex } from './reading-memory-semantic-index';
import { readReadingReviewAsset } from './reading-review-source';
import { appendReadingReview } from './reading-review-store';

const timestamp = '2026-08-30T00:00:00.000Z';
const cleanups: (() => Promise<void>)[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(timestamp);
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('reading memory index recovery', () => {
  it.each(['fts', 'entries'] as const)(
    'rebuilds damaged %s despite complete receipts without changing original assets',
    async (damage) => {
      const fixture = createFixture();
      fixture.add('one');
      const original = fixture.originals();
      expect(fixture.project()).toMatchObject({ completedJobCount: 1, failures: [] });
      expect(await fixture.search()).toMatchObject({
        mode: 'keyword',
        evidence: [expect.objectContaining({ content: '复审后的判断 one' })],
        projection: { state: 'available' },
        semantic: { state: 'not_installed' },
      });

      fixture.database.exec(`DELETE FROM reading_memory_evidence_${damage}`);
      expect(fixture.rows('reading_memory_evidence_receipts')).toHaveLength(1);
      expect((await fixture.search()).evidence).toEqual([]);
      await fixture.controls.pause();
      expect(await fixture.controls.rebuild()).toMatchObject({
        semantic: { indexingPaused: true },
      });
      expect(fixture.project()).toMatchObject({ queuedBackfillCount: 1, completedJobCount: 1 });
      const recovered = await fixture.search();
      expect(fixture.originals()).toEqual(original);
      expect(recovered.evidence).toEqual([
        expect.objectContaining({ content: '复审后的判断 one' }),
      ]);
      expect(recovered.semantic).toMatchObject({ state: 'not_installed', indexingPaused: true });
      expect(fixture.createEmbedding).not.toHaveBeenCalled();
    },
  );

  it('retains original saves and retries failed projection transactions independently', async () => {
    const fixture = createFixture();
    fixture.add('broken');
    fixture.add('healthy');
    const original = fixture.originals();
    fixture.database.exec(`
CREATE TEMP TRIGGER reject_review_projection
BEFORE INSERT ON reading_memory_evidence_entries
WHEN new.target_id = 'annotation_broken' AND new.asset_type = 'comment' BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_PROJECTION_FAILURE');
END;
`);

    expect(fixture.project()).toMatchObject({
      selectedJobCount: 2,
      completedJobCount: 1,
      failures: [{ job: { targetId: 'annotation_broken' }, retryAt: '2026-08-30T00:00:05.000Z' }],
    });
    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([
      expect.objectContaining({ target_id: 'annotation_healthy' }),
    ]);
    expect(fixture.rows('reading_memory_evidence_entries')).toHaveLength(2);
    expect(fixture.rows('reading_memory_evidence_fts')).toHaveLength(2);
    expect(fixture.rows('reading_memory_projection_jobs')).toEqual([
      expect.objectContaining({
        target_id: 'annotation_broken',
        attempt_count: 1,
        available_at: '2026-08-30T00:00:05.000Z',
      }),
    ]);
    expect(await fixture.search()).toMatchObject({
      evidence: [expect.objectContaining({ content: '复审后的判断 healthy' })],
      projection: {
        state: 'failed',
        coverage: { projectedAssetCount: 1, eligibleAssetCount: 2 },
      },
    });
    expect(fixture.originals()).toEqual(original);
    expect(fixture.project()).toMatchObject({ selectedJobCount: 0, failures: [] });

    fixture.database.exec('DROP TRIGGER reject_review_projection');
    vi.setSystemTime('2026-08-30T00:00:05.000Z');
    expect(fixture.project()).toMatchObject({ completedJobCount: 1, failures: [] });
    expect((await fixture.search()).evidence.map((entry) => entry.content).toSorted()).toEqual([
      '复审后的判断 broken',
      '复审后的判断 healthy',
    ]);
    expect((await fixture.controls.status()).projection.state).toBe('available');
    expect(fixture.rows('reading_memory_projection_jobs')).toEqual([]);
    expect(fixture.originals()).toEqual(original);
    expect(fixture.createEmbedding).not.toHaveBeenCalled();
  });

  it('continues a partially rebuilt database after restart without changing completed sources', async () => {
    const fixture = createFixture();
    fixture.add('one');
    fixture.add('two');
    const original = fixture.originals();
    expect(fixture.project()).toMatchObject({ completedJobCount: 2 });

    await fixture.controls.rebuild();
    expect(fixture.project({ jobLimit: 1, backfillLimit: 2 })).toMatchObject({
      queuedBackfillCount: 2,
      completedJobCount: 1,
      hasImmediateWork: true,
    });
    expect(await fixture.search()).toMatchObject({
      evidence: [expect.objectContaining({ content: '复审后的判断 one' })],
      projection: {
        state: 'building',
        coverage: { projectedAssetCount: 1, eligibleAssetCount: 2 },
      },
    });
    const completedReceipt = fixture.rows('reading_memory_evidence_receipts');
    const pendingJob = fixture.rows('reading_memory_projection_jobs');
    expect(pendingJob).toEqual([expect.objectContaining({ target_id: 'annotation_two' })]);
    const image = fixture.database.serialize();
    await fixture.close();

    const restarted = createFixture(image);
    vi.setSystemTime('2026-08-30T00:01:00.000Z');
    await restarted.controls.reconcile('startup');
    expect(restarted.rows('reading_memory_projection_jobs')).toEqual(pendingJob);
    expect(restarted.project()).toMatchObject({
      queuedBackfillCount: 0,
      completedJobCount: 1,
      failures: [],
    });
    expect(restarted.rows('reading_memory_evidence_receipts')).toEqual([
      ...completedReceipt,
      expect.objectContaining({
        target_id: 'annotation_two',
        projected_at: new Date().toISOString(),
      }),
    ]);
    expect(await restarted.search()).toMatchObject({
      mode: 'keyword',
      evidence: expect.arrayContaining([
        expect.objectContaining({ content: '复审后的判断 one' }),
        expect.objectContaining({ content: '复审后的判断 two' }),
      ]),
      projection: {
        state: 'available',
        coverage: { projectedAssetCount: 2, eligibleAssetCount: 2 },
      },
    });
    expect(restarted.rows('reading_memory_projection_jobs')).toEqual([]);
    expect(restarted.originals()).toEqual(original);
    expect(restarted.createEmbedding).not.toHaveBeenCalled();
  });

  it('repairs restored derived data while keeping startup reconciliation non-destructive', async () => {
    const fixture = createFixture();
    fixture.add('restored');
    const original = fixture.originals();
    fixture.project();
    fixture.database.exec('DELETE FROM reading_memory_evidence_fts');
    const image = fixture.database.serialize();
    await fixture.close();

    const restored = createFixture(image);
    await restored.controls.reconcile('startup');
    expect(restored.rows('reading_memory_evidence_receipts')).toHaveLength(1);
    expect(restored.project()).toMatchObject({ queuedBackfillCount: 0, completedJobCount: 0 });
    expect((await restored.search()).evidence).toEqual([]);

    await restored.controls.reconcile('database-restored');
    expect(restored.project()).toMatchObject({
      queuedBackfillCount: 1,
      completedJobCount: 1,
      failures: [],
    });
    expect(await restored.search()).toMatchObject({
      mode: 'keyword',
      evidence: [expect.objectContaining({ content: '复审后的判断 restored' })],
      projection: { state: 'available' },
    });
    expect(restored.originals()).toEqual(original);
    expect(restored.createEmbedding).not.toHaveBeenCalled();
  });

  it('rolls back an interrupted reset and clears all derived generations on retry', async () => {
    const fixture = createFixture();
    fixture.add('indexed');
    fixture.project();
    fixture.seedVectors();
    fixture.database.exec(`
INSERT INTO reading_memory_evidence_fts (entry_id, article_id, asset_type, search_text)
VALUES ('orphan', 'article_indexed', 'comment', '复审后的判断 orphan');
`);
    fixture.add('pending');
    const original = fixture.originals();
    const derived = fixture.derived();
    expect(derived.vectors).toHaveLength(4);
    expect(derived.jobs).toHaveLength(1);
    fixture.database.exec(`
CREATE TEMP TRIGGER reject_receipt_reset
BEFORE DELETE ON reading_memory_evidence_receipts BEGIN
  SELECT RAISE(ABORT, 'CONTROLLED_RESET_FAILURE');
END;
`);

    await expect(fixture.controls.rebuild()).rejects.toThrow('CONTROLLED_RESET_FAILURE');
    expect(fixture.derived()).toEqual(derived);
    expect(fixture.originals()).toEqual(original);
    expect((await fixture.search()).evidence).toEqual([
      expect.objectContaining({ content: '复审后的判断 indexed' }),
    ]);

    fixture.database.exec('DROP TRIGGER reject_receipt_reset');
    await fixture.controls.rebuild();
    expect(fixture.derived()).toEqual({
      entries: [],
      fts: [],
      receipts: [],
      vectors: [],
      jobs: [],
      semantic: [],
    });
    expect(fixture.originals()).toEqual(original);
    expect(fixture.project()).toMatchObject({ queuedBackfillCount: 2, completedJobCount: 2 });
    expect((await fixture.search()).evidence).toHaveLength(2);
    expect(fixture.originals()).toEqual(original);
    expect(fixture.createEmbedding).not.toHaveBeenCalled();
  });
});

function createFixture(image?: Buffer) {
  const database = new SQLiteDatabase(image ?? ':memory:');
  database.pragma('foreign_keys = ON');
  if (!image) for (const migration of migrations) database.exec(migration.sql);
  const modelState: ReadingMemoryModelLifecycleState = {
    status: 'not-installed',
    internalId: readingMemoryModelRelease.internalId,
    downloadSizeBytes: readingMemoryModelRelease.distributionDownloadSizeBytes,
    resumeBytes: 0,
  };
  const modelLifecycle: ReadingMemoryModelLifecycle = {
    getState: () => modelState,
    reconcile: async () => modelState,
    download: async () => modelState,
    cancelDownload: async () => modelState,
    remove: async () => modelState,
    dispose: vi.fn(),
  };
  const createEmbedding = vi.fn(() => {
    throw new Error('Keyword recovery must not load a model');
  });
  const index = createReadingMemorySemanticIndex({
    modelLifecycle,
    withDatabase: async (operation) => operation(database, 1),
    createEmbedding,
  });
  const controls = createReadingMemoryControls({
    modelLifecycle,
    semanticIndex: index,
    userDataPath: '/tmp/yomitomo-index-recovery-test',
  });
  const close = async () => {
    await controls.dispose();
    if (database.open) database.close();
  };
  cleanups.push(close);
  const rows = (table: string) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  return {
    database,
    controls,
    close,
    createEmbedding,
    rows,
    originals: () => ({
      articles: rows('articles'),
      annotations: rows('annotations'),
      comments: rows('comments'),
      reviews: rows('reading_memory_reviews'),
    }),
    derived: () => ({
      entries: rows('reading_memory_evidence_entries'),
      fts: rows('reading_memory_evidence_fts'),
      receipts: rows('reading_memory_evidence_receipts'),
      vectors: rows('reading_memory_evidence_vectors'),
      jobs: rows('reading_memory_projection_jobs'),
      semantic: rows('reading_memory_semantic_state'),
    }),
    seedVectors() {
      const vector = new Float32Array(readingMemoryModelVectorDimension);
      vector[0] = 1;
      for (const version of [readingMemoryModelRelease.internalId, 'previous-model']) {
        database
          .prepare(`
INSERT INTO reading_memory_evidence_vectors
  (evidence_id, model_version, source_version, projector_version, dimension, vector)
SELECT id, ?, source_version, projector_version, ?, ? FROM reading_memory_evidence_entries
`)
          .run(version, vector.length, Buffer.from(vector.buffer));
      }
      database
        .prepare(
          'INSERT INTO reading_memory_semantic_state (id, active_model_version) VALUES (1, ?)',
        )
        .run('previous-model');
    },
    project: (options?: ReadingMemoryEvidenceProjectionBatchOptions) =>
      runReadingMemoryEvidenceProjectionBatch(database, options),
    search: () => index.search({ query: '复审后的判断', scope: { kind: 'library' } }),
    add(id: string) {
      database
        .prepare(`
INSERT INTO articles (id, url, canonical_url, title, content_hash, created_at, updated_at)
VALUES (?, ?, ?, '恢复测试', 'hash', ?, ?)
`)
        .run(`article_${id}`, `url_${id}`, `url_${id}`, timestamp, timestamp);
      database
        .prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', 'color', ?, ?)
`)
        .run(
          `annotation_${id}`,
          `article_${id}`,
          JSON.stringify({ exact: '划线问题上下文', prefix: '', suffix: '', start: 0, end: 8 }),
          timestamp,
          timestamp,
        );
      database
        .prepare(`
INSERT INTO comments (id, annotation_id, author, content, created_at)
VALUES (?, ?, 'user', '原始个人判断', ?)
`)
        .run(`comment_${id}`, `annotation_${id}`, timestamp);
      const asset: ReadingReviewAssetRef = {
        articleId: `article_${id}`,
        annotationId: `annotation_${id}`,
        assetType: 'comment',
        assetId: `comment_${id}`,
      };
      const source = readReadingReviewAsset(database, asset);
      if (!source) throw new Error('Expected an eligible review asset');
      appendReadingReview(database, {
        id: `review_${id}`,
        asset,
        assetVersion: source.base.assetVersion,
        judgmentDigest: createHash('sha256').update(source.current.content).digest('hex'),
        headReviewId: null,
        decision: 'changed',
        answer: `复审后的判断 ${id}`,
      });
    },
  };
}
