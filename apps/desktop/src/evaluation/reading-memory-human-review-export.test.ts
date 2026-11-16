import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { evaluateReadingMemoryHumanReview } from '../../../../packages/ai/src/evaluation/reading-memory-human-review-evaluation';
import { migrations } from '../main/db/migrations';
import { runReadingMemoryEvidenceProjectionBatch } from '../main/reading-memory/reading-memory-evidence-projection-batch';
import {
  exportReadingMemoryHumanReviewTemplates,
  type ReadingMemoryHumanReviewLanguage,
  type ReadingMemoryHumanReviewQueryInput,
  type ReadingMemoryHumanReviewReplaySnapshot,
} from './reading-memory-human-review-export';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const systemRevision = '1234567890abcdef1234567890abcdef12345678';
const languages: ReadingMemoryHumanReviewLanguage[] = ['zh', 'en', 'ja'];
const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const directory of temporaryRoots.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('offline reading memory human review template export', () => {
  it('excludes the selected highlight from related evidence', async () => {
    const workDir = await createTempDir('yomitomo-review-export-selection-');
    const dbPath = join(workDir, 'reading.sqlite');
    const outputDir = join(workDir, 'exported');
    createFixtureDatabase(dbPath, { reviewAssetCount: 0, includeLongSharedBlock: false });
    const database = new SQLiteDatabase(dbPath);
    database.prepare("DELETE FROM annotations WHERE id <> 'annotation-00'").run();
    const row = database
      .prepare("SELECT anchor FROM annotations WHERE id = 'annotation-00'")
      .get() as { anchor: string };
    database.close();

    await exportReadingMemoryHumanReviewTemplates({
      dbPath,
      queries: [
        {
          id: 'selected-highlight',
          kind: 'relate',
          queryLanguage: 'en',
          evidenceLanguage: 'en',
          query: 'topic-0',
          articleId: 'article-00',
          selectionAnchor: JSON.parse(row.anchor),
        },
      ],
      outputDir,
      evaluationId: 'offline-selection-test',
      systemRevision,
      allowKeywordFallback: true,
    });

    const snapshot = JSON.parse(
      await readFile(join(outputDir, 'replay-snapshot.json'), 'utf8'),
    ) as ReadingMemoryHumanReviewReplaySnapshot;
    const selectedId = 'reading_evidence_annotation:annotation-00';
    expect(snapshot.queries[0].candidateIds).toContain(selectedId);
    expect(snapshot.queries[0].displayedIds).not.toContain(selectedId);
    expect(snapshot.queries[0].sentIds).not.toContain(selectedId);
  });

  it('rebuilds stale derived evidence after deidentifying an indexed database', async () => {
    const workDir = await createTempDir('yomitomo-review-export-rebuild-');
    const dbPath = join(workDir, 'reading.sqlite');
    const outputDir = join(workDir, 'exported');
    createFixtureDatabase(dbPath, { reviewAssetCount: 0, includeLongSharedBlock: false });
    const database = new SQLiteDatabase(dbPath);
    while (runReadingMemoryEvidenceProjectionBatch(database).hasImmediateWork) {}
    database.prepare("UPDATE annotations SET user_username = 'deidentified-reader'").run();
    database.close();
    const before = await readFile(dbPath);

    await exportReadingMemoryHumanReviewTemplates({
      dbPath,
      queries: [
        {
          id: 'rebuild',
          kind: 'ask',
          queryLanguage: 'en',
          evidenceLanguage: 'en',
          query: 'topic-0',
        },
      ],
      outputDir,
      evaluationId: 'offline-rebuild-test',
      systemRevision,
      allowKeywordFallback: true,
    });

    const snapshot = JSON.parse(
      await readFile(join(outputDir, 'replay-snapshot.json'), 'utf8'),
    ) as ReadingMemoryHumanReviewReplaySnapshot;
    expect(snapshot.queries[0].displayedIds).toHaveLength(12);
    expect(snapshot.queries[0].sentIds).toHaveLength(12);
    expect(await readFile(dbPath)).toEqual(before);
  });

  it('leaves the time queue blank when its actual top five repeat a judgment', async () => {
    const workDir = await createTempDir('yomitomo-review-export-duplicate-');
    const dbPath = join(workDir, 'reading.sqlite');
    const outputDir = join(workDir, 'exported');
    createFixtureDatabase(dbPath, { reviewAssetCount: 7, includeLongSharedBlock: false });
    const database = new SQLiteDatabase(dbPath);
    database
      .prepare("UPDATE comments SET content = 'User judgment 00' WHERE id = 'comment-01'")
      .run();
    database.close();

    const result = await exportReadingMemoryHumanReviewTemplates({
      dbPath,
      queries: [
        {
          id: 'duplicates',
          kind: 'ask',
          queryLanguage: 'en',
          evidenceLanguage: 'en',
          query: 'topic-0',
        },
      ],
      outputDir,
      evaluationId: 'offline-duplicate-test',
      systemRevision,
      allowKeywordFallback: true,
    });

    const qualityTemplate = JSON.parse(
      await readFile(join(outputDir, 'quality-review-template.json'), 'utf8'),
    );
    const timeQueue = qualityTemplate.reviewQueues.find(
      (queue: { mode: string }) => queue.mode === 'time',
    );
    expect(result.prefilledTimeReviewQueue).toBe(false);
    expect(timeQueue.items.map((item: { judgment: string }) => item.judgment)).toEqual([
      '',
      '',
      '',
      '',
      '',
    ]);
  });

  it('preserves input SQLite SHA-256, validates outputDir boundaries, and exports validatable templates', async () => {
    const workDir = await createTempDir('yomitomo-review-export-test-');
    const dbPath = join(workDir, 'reading.sqlite');
    const outputDir = join(workDir, 'exported');
    createFixtureDatabase(dbPath, { reviewAssetCount: 2, includeLongSharedBlock: false });

    const beforeBytes = await readFile(dbPath);
    const beforeSha256 = sha256(beforeBytes);

    await expect(
      exportReadingMemoryHumanReviewTemplates({
        dbPath,
        queries: buildCompleteQueryMatrix(),
        outputDir: join(repositoryRoot, 'tmp-forbidden-review-export'),
        evaluationId: 'offline-export-test',
        systemRevision,
        allowKeywordFallback: true,
      }),
    ).rejects.toThrow('outputDir');

    const repoSymlink = join(workDir, 'repo-link');
    await symlink(repositoryRoot, repoSymlink);
    await expect(
      exportReadingMemoryHumanReviewTemplates({
        dbPath,
        queries: buildCompleteQueryMatrix(),
        outputDir: join(repoSymlink, 'nested-forbidden'),
        evaluationId: 'offline-export-test',
        systemRevision,
        allowKeywordFallback: true,
      }),
    ).rejects.toThrow('outputDir');

    await expect(
      exportReadingMemoryHumanReviewTemplates({
        dbPath,
        queries: buildCompleteQueryMatrix(),
        outputDir,
        evaluationId: 'offline-export-test',
        systemRevision,
      }),
    ).rejects.toThrow('modelCachePath');

    await expect(
      exportReadingMemoryHumanReviewTemplates({
        dbPath,
        queries: buildCompleteQueryMatrix(),
        outputDir: dbPath,
        evaluationId: 'offline-export-test',
        systemRevision,
        allowKeywordFallback: true,
      }),
    ).rejects.toThrow('outputDir');

    const result = await exportReadingMemoryHumanReviewTemplates({
      dbPath,
      queries: buildCompleteQueryMatrix(),
      outputDir,
      evaluationId: 'offline-export-test',
      systemRevision,
      allowKeywordFallback: true,
    });

    const afterBytes = await readFile(dbPath);
    expect(sha256(afterBytes)).toBe(beforeSha256);
    expect(result.dbSha256).toBe(beforeSha256);
    expect(result.retrievalMode).toBe('keyword');
    expect(result.prefilledTimeReviewQueue).toBe(false);

    const retrievalTemplate = JSON.parse(
      await readFile(join(outputDir, 'retrieval-review-template.json'), 'utf8'),
    );
    const qualityTemplate = JSON.parse(
      await readFile(join(outputDir, 'quality-review-template.json'), 'utf8'),
    );
    const replaySnapshot = JSON.parse(
      await readFile(join(outputDir, 'replay-snapshot.json'), 'utf8'),
    ) as ReadingMemoryHumanReviewReplaySnapshot;

    expect(() => evaluateReadingMemoryHumanReview(retrievalTemplate)).toThrow();
    expect(() => evaluateReadingMemoryHumanReview(qualityTemplate)).toThrow();

    expect(retrievalTemplate.provenance).toEqual({
      source: 'deidentified-real-reading',
      sourceStatement: '',
      reviewMethod: 'independent-human',
      reviewerId: '',
    });
    expect(retrievalTemplate.retrieval).toHaveLength(360);

    for (const item of retrievalTemplate.retrieval) {
      const limit = item.kind === 'relate' ? 3 : 12;
      expect(item.displayedIds.length).toBeGreaterThan(0);
      expect(item.displayedIds.length).toBeLessThanOrEqual(limit);
      expect(item.sentIds.length).toBeGreaterThan(0);
      expect(
        JSON.stringify(item.displayedIds.filter((id: string) => item.sentIds.includes(id))),
      ).toBe(JSON.stringify(item.sentIds));
      if (item.kind === 'relate') {
        expect(item.helpfulIds).toEqual([]);
      } else {
        expect(item.necessaryIds).toEqual([]);
      }
    }

    const relateSample = retrievalTemplate.retrieval.find(
      (item: { kind: string }) => item.kind === 'relate',
    );
    const askSample = retrievalTemplate.retrieval.find(
      (item: { kind: string }) => item.kind === 'ask',
    );
    expect(relateSample.displayedIds).toHaveLength(3);
    expect(askSample.displayedIds).toHaveLength(12);

    const annotatedRetrieval = structuredClone(retrievalTemplate);
    annotatedRetrieval.provenance.sourceStatement =
      'Deidentified fixture export test with human-supplied labels.';
    annotatedRetrieval.provenance.reviewerId = 'test-reviewer-1';
    for (const item of annotatedRetrieval.retrieval) {
      if (item.kind === 'relate') {
        item.helpfulIds = [item.displayedIds[0]];
      } else {
        item.necessaryIds = [item.sentIds[0]];
      }
    }

    const scored = evaluateReadingMemoryHumanReview(annotatedRetrieval);
    expect(scored.passed).toBe(true);
    expect(scored.failures).toEqual([]);

    expect(replaySnapshot.dbSha256).toBe(beforeSha256);
    expect(replaySnapshot.systemRevision).toBe(systemRevision);
    expect(replaySnapshot.retrievalMode).toBe('keyword');
    expect(replaySnapshot.projection).toEqual({
      state: 'available',
      coverage: { projectedAssetCount: 15, eligibleAssetCount: 15 },
    });
    expect(replaySnapshot.queries).toHaveLength(360);
    expect(Object.keys(replaySnapshot.evidenceById).length).toBe(17);
    const snapshotText = JSON.stringify(replaySnapshot);
    expect(snapshotText).not.toContain(workDir);
    expect(snapshotText).not.toContain(dbPath);
    expect(snapshotText).not.toContain(outputDir);
  });

  it('prefills top-5 time queue candidates with null reviewable flags when >= 5 review assets exist and preserves strict sentIds subset under byte budget', async () => {
    const workDir = await createTempDir('yomitomo-review-export-queue-');
    const dbPath = join(workDir, 'reading-reviews.sqlite');
    const outputDir = join(workDir, 'exported');
    createFixtureDatabase(dbPath, { reviewAssetCount: 7, includeLongSharedBlock: true });

    const longQuery = `shared-budget-anchor ${'x'.repeat(5_820)}`;
    const queries: ReadingMemoryHumanReviewQueryInput[] = [
      {
        id: 'budget-ask',
        kind: 'ask',
        queryLanguage: 'en',
        evidenceLanguage: 'en',
        query: longQuery,
      },
    ];

    const result = await exportReadingMemoryHumanReviewTemplates({
      dbPath,
      queries,
      outputDir,
      evaluationId: 'offline-review-queue-test',
      systemRevision,
      allowKeywordFallback: true,
    });

    expect(result.prefilledTimeReviewQueue).toBe(true);

    const retrievalTemplate = JSON.parse(
      await readFile(join(outputDir, 'retrieval-review-template.json'), 'utf8'),
    );
    const qualityTemplate = JSON.parse(
      await readFile(join(outputDir, 'quality-review-template.json'), 'utf8'),
    );
    const replaySnapshot = JSON.parse(
      await readFile(join(outputDir, 'replay-snapshot.json'), 'utf8'),
    ) as ReadingMemoryHumanReviewReplaySnapshot;

    expect(retrievalTemplate.retrieval[0].displayedIds).toHaveLength(12);
    expect(retrievalTemplate.retrieval[0].sentIds.length).toBeGreaterThan(0);
    expect(retrievalTemplate.retrieval[0].sentIds.length).toBeLessThan(12);
    expect(
      JSON.stringify(
        retrievalTemplate.retrieval[0].displayedIds.filter((id: string) =>
          retrievalTemplate.retrieval[0].sentIds.includes(id),
        ),
      ),
    ).toBe(JSON.stringify(retrievalTemplate.retrieval[0].sentIds));
    expect(replaySnapshot.queries[0].inputTruncated).toBe(true);
    expect(replaySnapshot.queries[0].inputBytes).toBeLessThanOrEqual(6_000);

    expect(() => evaluateReadingMemoryHumanReview(qualityTemplate)).toThrow();
    const timeQueue = qualityTemplate.reviewQueues.find(
      (queue: { mode: string }) => queue.mode === 'time',
    );
    expect(timeQueue.items).toHaveLength(5);
    expect(timeQueue.items.map((item: { judgment: string }) => item.judgment)).toEqual([
      'User judgment 00',
      'User judgment 01',
      'User judgment 02',
      'User judgment 03',
      'User judgment 04',
    ]);
    expect(timeQueue.items.every((item: { reviewable: null }) => item.reviewable === null)).toBe(
      true,
    );
  }, 15_000);
});

async function createTempDir(prefix: string) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(dir);
  return dir;
}

function createFixtureDatabase(
  dbPath: string,
  options: { reviewAssetCount: number; includeLongSharedBlock: boolean },
) {
  const database = new SQLiteDatabase(dbPath);
  try {
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    for (const migration of migrations) {
      database.exec(migration.sql);
    }

    const insertArticle = database.prepare(`
INSERT INTO articles (id, url, canonical_url, title, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, 'web', ?, ?, ?)
`);
    const insertAnnotation = database.prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`);
    const insertComment = database.prepare(`
INSERT INTO comments (id, annotation_id, author, content, created_at, asset_revision)
VALUES (?, ?, 'user', ?, ?, 'initial')
`);

    const topicTokens = Array.from({ length: 20 }, (_, index) => `topic-${index}`).join(' ');
    const longSharedBlock = options.includeLongSharedBlock
      ? ` shared-budget-anchor ${'x'.repeat(5_820)}`
      : '';

    database.transaction(() => {
      for (let index = 0; index < 15; index += 1) {
        const padded = String(index).padStart(2, '0');
        const createdAt = `2026-08-01T00:${padded}:00.000Z`;
        const articleId = `article-${padded}`;
        const annotationId = `annotation-${padded}`;
        const exact = `Evidence ${padded} ${topicTokens}${longSharedBlock}`;

        insertArticle.run(
          articleId,
          `https://example.invalid/${articleId}`,
          `https://example.invalid/${articleId}`,
          `Article ${padded}`,
          `hash-${padded}`,
          createdAt,
          createdAt,
        );
        insertAnnotation.run(
          annotationId,
          articleId,
          JSON.stringify({
            exact,
            prefix: '',
            suffix: '',
            start: 0,
            end: exact.length,
          }),
          createdAt,
          createdAt,
        );

        if (index < options.reviewAssetCount) {
          insertComment.run(
            `comment-${padded}`,
            annotationId,
            `User judgment ${padded}`,
            createdAt,
          );
        }
      }
    })();
  } finally {
    database.close();
  }
}

function buildCompleteQueryMatrix(): ReadingMemoryHumanReviewQueryInput[] {
  return languages.flatMap((queryLanguage) =>
    languages.flatMap((evidenceLanguage) =>
      (['relate', 'ask'] as const).flatMap((kind) =>
        Array.from({ length: 20 }, (_, index) => ({
          id: `${queryLanguage}-${evidenceLanguage}-${kind}-${index}`,
          kind,
          queryLanguage,
          evidenceLanguage,
          query: `topic-${index}`,
        })),
      ),
    ),
  );
}

function sha256(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
