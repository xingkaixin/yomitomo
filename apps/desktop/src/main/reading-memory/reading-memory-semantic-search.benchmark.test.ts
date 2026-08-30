import { execFileSync, fork } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { availableParallelism, cpus, tmpdir, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type { ReadingEvidenceScope } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import {
  createReadingMemoryEmbeddingService,
  type ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import { createReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';
import { createReadingMemorySemanticIndex } from './reading-memory-semantic-index';
import type { ReadingMemoryDatabase } from './reading-memory-store-types';
import { activateReadingMemoryModelVersion } from './reading-memory-vector-store';

const modelCache = process.env.YOMITOMO_READING_MEMORY_BENCHMARK_MODEL_CACHE ?? '';
const reportPath = process.env.YOMITOMO_READING_MEMORY_BENCHMARK_OUTPUT;
const workerUrl = new URL('../../../dist/main/reading-memory-embedding-worker.js', import.meta.url);
const releaseDirectory = fileURLToPath(
  new URL('../../../../download/model-releases/reading-memory-embedding-v1/', import.meta.url),
);
const timestamp = '2026-08-30T00:00:00.000Z';
const entryCount = 10_000;
const warmIterations = 50;
const collectionId = 'benchmark-collection';
const corpusTexts = [
  'Reading memory connects earlier observations with new evidence and revised judgments.',
  'Sleep supports memory consolidation and makes previously learned ideas easier to recall.',
  'Learning improves when readers compare evidence instead of merely repeating conclusions.',
  'A scientific judgment should change when reliable evidence contradicts its assumptions.',
  '阅读时记录判断，再用新的证据检查过去的理解，能够改善学习。',
  '睡眠有助于记忆巩固，间隔复习也能帮助我们长期保留知识。',
  '読書の記憶を新しい証拠と比べると、自分の判断を見直すことができる。',
  '学習した内容を説明し、時間を空けて思い出すことで理解が深まる。',
];
const queries = [
  'reading memory',
  'sleep memory',
  'learning evidence',
  'scientific judgment',
  '阅读 判断',
  '睡眠 记忆',
  '読書 記憶',
  '学習 理解',
];
const scopes = [
  { name: 'library', scope: { kind: 'library' }, expectedEntries: entryCount },
  {
    name: 'collection',
    scope: { kind: 'collection', collectionId },
    expectedEntries: (entryCount * 3) / 4,
  },
] satisfies Array<{ name: string; scope: ReadingEvidenceScope; expectedEntries: number }>;

type QuerySample = {
  totalMs: number;
  embeddingMs: number;
  databaseLeaseMs: number;
  maximumDatabaseLeaseMs: number;
};

it.skipIf(!modelCache)(
  'keeps real-model hybrid retrieval over 10,000 SQLite vectors below one second at P95',
  async () => {
    await stat(workerUrl);
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yomitomo-semantic-benchmark-'));
    const databasePath = join(temporaryDirectory, 'reading-memory.sqlite');
    const database = new SQLiteDatabase(databasePath);
    const modelLifecycle = createReadingMemoryModelLifecycle({ userDataPath: temporaryDirectory });
    let embeddingMs = 0;
    let embeddingCalls = 0;
    let databaseLeaseMs = 0;
    let maximumDatabaseLeaseMs = 0;
    let inferencePid: number | undefined;
    const withDatabase: ReadingMemoryDatabase = async (operation) => {
      const started = performance.now();
      try {
        return operation(database, 0);
      } finally {
        const duration = performance.now() - started;
        databaseLeaseMs += duration;
        maximumDatabaseLeaseMs = Math.max(maximumDatabaseLeaseMs, duration);
      }
    };
    const createEmbedding: typeof createReadingMemoryEmbeddingService = (installation) => {
      const service = createReadingMemoryEmbeddingService(installation, {
        createProcess: (_url, options) => {
          const child = fork(workerUrl, [], options);
          inferencePid = child.pid;
          return child;
        },
      });
      return {
        embed: async (request, options) => {
          const started = performance.now();
          embeddingCalls += 1;
          try {
            return await service.embed(request, options);
          } finally {
            embeddingMs += performance.now() - started;
          }
        },
        dispose: () => service.dispose(),
      };
    };
    const index = createReadingMemorySemanticIndex({
      modelLifecycle,
      withDatabase,
      createEmbedding,
      logError: (event, error, data) => console.error(event, error, data),
    });
    const measureQuery = async (
      scenario: (typeof scopes)[number],
      query: string,
    ): Promise<QuerySample> => {
      embeddingMs = 0;
      embeddingCalls = 0;
      databaseLeaseMs = 0;
      maximumDatabaseLeaseMs = 0;
      const started = performance.now();
      const result = await index.search({ query, scope: scenario.scope });
      const sample = {
        totalMs: performance.now() - started,
        embeddingMs,
        databaseLeaseMs,
        maximumDatabaseLeaseMs,
      };
      expect(embeddingCalls).toBe(1);
      expect(result.mode).toBe('hybrid');
      expect(result.semantic.state).toBe('available');
      expect(result.semantic.coverage).toEqual({
        eligibleEntryCount: scenario.expectedEntries,
        indexedEntryCount: scenario.expectedEntries,
      });
      expect(result.evidence).toHaveLength(12);
      if (scenario.scope.kind === 'collection') {
        expect(
          result.evidence.every((item) => Number(item.location.annotationId.slice(-5)) % 4 !== 3),
        ).toBe(true);
      }
      return sample;
    };

    try {
      await index.pauseIndexing();
      await installCachedModel(temporaryDirectory);
      const installation = await modelLifecycle.reconcile('benchmark');
      if (installation.status !== 'available') {
        throw new Error(
          `Benchmark model installation is not available: ${JSON.stringify(installation)}`,
        );
      }
      expect(installation.manifest.vector.dimension).toBe(768);
      const seedService = createEmbedding(installation);
      let seedVectors: Float32Array;
      try {
        seedVectors = (await seedService.embed({ purpose: 'document', texts: corpusTexts }))
          .vectors;
      } finally {
        await seedService.dispose();
      }
      populateDatabase(database, installation, seedVectors);
      database.pragma('wal_checkpoint(TRUNCATE)');
      const hostBaselineRssBytes = process.memoryUsage().rss;
      const cold = await measureQuery(scopes[0], queries[0]);
      const inferenceRssAfterColdBytes = readProcessRssBytes(inferencePid);
      const scenarios = [];
      for (const scenario of scopes) {
        const samples: QuerySample[] = [];
        for (let iteration = 0; iteration < warmIterations; iteration += 1) {
          samples.push(await measureQuery(scenario, queries[iteration % queries.length]));
        }
        scenarios.push({
          scope: scenario.name,
          indexedEntryCount: scenario.expectedEntries,
          iterations: samples.length,
          completeQueryMs: summarize(samples.map((sample) => sample.totalMs)),
          queryEmbeddingMs: summarize(samples.map((sample) => sample.embeddingMs)),
          retrievalExcludingEmbeddingMs: summarize(
            samples.map((sample) => sample.totalMs - sample.embeddingMs),
          ),
          databaseLeaseMs: summarize(samples.map((sample) => sample.databaseLeaseMs)),
          maximumDatabaseLeaseMs: Math.max(
            ...samples.map((sample) => sample.maximumDatabaseLeaseMs),
          ),
        });
      }
      const hostFinalRssBytes = process.memoryUsage().rss;
      const inferenceRssAfterWarmBytes = readProcessRssBytes(inferencePid);
      const report = {
        schemaVersion: 1,
        benchmark: 'reading-memory-real-model-sqlite-hybrid-latency',
        generatedAt: new Date().toISOString(),
        platform: `${process.platform}-${process.arch}`,
        nodeVersion: process.versions.node,
        cpuModel: cpus()[0]?.model,
        cpuThreads: availableParallelism(),
        totalMemoryBytes: totalmem(),
        modelVersion: installation.internalId,
        runtimeVersion: installation.manifest.runtime.version,
        backendVersion: installation.manifest.runtime.backendVersion,
        inferenceIntraOpThreads: installation.manifest.runtime.intraOpThreads,
        inferenceInterOpThreads: installation.manifest.runtime.interOpThreads,
        dimension: installation.manifest.vector.dimension,
        corpus: {
          kind: 'repeated-real-document-vectors',
          qualityEvaluation: false,
          annotationTargetCount: entryCount,
          vectorCount: entryCount,
          uniqueTextAndVectorCount: corpusTexts.length,
          repetitionsPerText: entryCount / corpusTexts.length,
          databaseBytes: (await stat(databasePath)).size,
          journalMode: 'wal',
        },
        cold: {
          definition:
            'First query in a fresh inference process; model files and SQLite may be OS-cached',
          ...cold,
          retrievalExcludingEmbeddingMs: cold.totalMs - cold.embeddingMs,
        },
        warm: scenarios,
        memory: {
          hostBaselineRssBytes,
          hostFinalRssBytes,
          hostLifetimePeakRssBytes: process.resourceUsage().maxRSS * 1024,
          inferenceRssAfterColdBytes,
          inferenceRssAfterWarmBytes,
          combinedObservedRssAfterWarmBytes: hostFinalRssBytes + inferenceRssAfterWarmBytes,
          note: 'Host includes Vitest, SQLite and fixture setup; child RSS is sampled outside timed queries, not a peak',
        },
      };
      console.info('reading_memory.hybrid_search_benchmark', JSON.stringify(report));
      if (reportPath) {
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      }
      for (const scenario of scenarios) {
        expect(scenario.completeQueryMs.p95, `${scenario.scope} complete-query P95`).toBeLessThan(
          1000,
        );
      }
    } finally {
      await index.dispose();
      database.close();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  },
  300_000,
);

async function installCachedModel(userDataPath: string) {
  const manifestPath = join(releaseDirectory, 'manifest.json');
  const manifest = parseReadingMemoryModelManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  );
  const artifactDirectory = join(modelCache, manifest.artifact.modelId, manifest.artifact.revision);
  const modelDirectory = join(userDataPath, 'models', manifest.internalId);
  const files = [
    ...manifest.artifact.files.map((file) => ({
      path: file.path,
      sourceDirectory: artifactDirectory,
    })),
    ...manifest.legal.files.map((file) => ({ path: file.path, sourceDirectory: releaseDirectory })),
  ];
  for (const file of files) {
    const destination = join(modelDirectory, file.path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(file.sourceDirectory, file.path), destination, constants.COPYFILE_FICLONE);
  }
  await copyFile(manifestPath, join(modelDirectory, 'manifest.json'));
}

function populateDatabase(
  database: SQLiteDatabase.Database,
  installation: ReadingMemoryModelInstallation,
  seedVectors: Float32Array,
) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  const dimension = installation.manifest.vector.dimension;
  const vectorBytes = corpusTexts.map((_, row) => {
    const bytes = Buffer.alloc(dimension * Float32Array.BYTES_PER_ELEMENT);
    for (let column = 0; column < dimension; column += 1) {
      bytes.writeFloatLE(
        seedVectors[row * dimension + column],
        column * Float32Array.BYTES_PER_ELEMENT,
      );
    }
    return bytes;
  });
  const insertArticle = database.prepare(`
INSERT INTO articles (id, url, canonical_url, title, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, 'web', ?, ?, ?)
`);
  const insertAnnotation = database.prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`);
  const insertVector = database.prepare(`
INSERT INTO reading_memory_evidence_vectors (
  evidence_id, model_version, source_version, projector_version, dimension, vector
) SELECT id, ?, source_version, projector_version, ?, ?
FROM reading_memory_evidence_entries WHERE target_id = ?
`);
  database
    .prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(collectionId, 'Benchmark collection', timestamp, timestamp);
  const insertMember = database.prepare(
    "INSERT INTO collection_members (collection_id, member_kind, member_id, added_at) VALUES (?, 'article', ?, ?)",
  );
  database.transaction(() => {
    for (let item = 0; item < entryCount; item += 1) {
      const id = `item_${String(item).padStart(5, '0')}`;
      const articleId = `article_${id}`;
      const content = corpusTexts[item % corpusTexts.length];
      const url = `https://example.com/${id}`;
      insertArticle.run(articleId, url, url, id, id, timestamp, timestamp);
      insertAnnotation.run(
        id,
        articleId,
        JSON.stringify({ exact: content, prefix: '', suffix: '', start: 0, end: content.length }),
        timestamp,
        timestamp,
      );
      const [source] = readStoredAnnotationThreadSources(database, [id]);
      replaceReadingEvidenceThreadInTransaction(
        database,
        {
          targetId: id,
          articleId,
          sourceVersion: source.sourceVersion,
          projectorVersion: readingMemoryEvidenceProjectorVersion,
          projectedAt: timestamp,
        },
        projectReadingEvidenceThread({
          articleId,
          annotation: source.annotation,
          sourceVersion: source.sourceVersion,
          projectorVersion: readingMemoryEvidenceProjectorVersion,
        }),
      );
      insertVector.run(
        installation.internalId,
        dimension,
        vectorBytes[item % corpusTexts.length],
        id,
      );
      if (item % 4 !== 3) insertMember.run(collectionId, articleId, timestamp);
    }
  })();
  expect(
    activateReadingMemoryModelVersion(database, {
      modelVersion: installation.internalId,
      dimension,
    }),
  ).toBe(true);
}

function summarize(values: number[]) {
  const sorted = values.toSorted((left, right) => left - right);
  return {
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted[sorted.length - 1],
  };
}

function readProcessRssBytes(pid: number | undefined) {
  if (pid === undefined) throw new Error('Benchmark did not start a real inference process');
  const windows = process.platform === 'win32';
  const value = execFileSync(
    windows ? 'powershell.exe' : 'ps',
    windows
      ? ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`]
      : ['-o', 'rss=', '-p', String(pid)],
    { encoding: 'utf8', windowsHide: true, timeout: 10_000 },
  );
  const bytes = Number(value.trim()) * (windows ? 1 : 1024);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Invalid inference process RSS');
  return bytes;
}
