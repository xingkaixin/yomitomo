import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import SQLiteDatabase from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import {
  semanticRetrievalLanguages,
  semanticRetrievalScenarios,
} from '../../../../../packages/ai/src/evaluation/semantic-retrieval-fixtures';
import {
  evaluateProductionRetrieval,
  type ProductionRetrievalSample,
} from '../../../../../packages/ai/src/evaluation/semantic-retrieval-production-evaluation';
import { createReadingMemoryEmbeddingService } from './reading-memory-embedding-service';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import {
  materializeReadingEvidenceCandidates,
  readKeywordReadingEvidenceCandidates,
  readReadingEvidenceProjectionStatus,
} from './reading-memory-evidence-search';
import { createReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import { createReadingMemorySemanticIndex } from './reading-memory-semantic-index';
import {
  installReadingMemoryQualityModel,
  populateReadingMemoryQualityDatabase,
  prepareReadingMemoryQualityEvidence,
  readingMemoryQualityCorpus,
  readingMemoryQualityQueries,
} from './reading-memory-semantic-quality-fixture';
import { readMissingReadingMemoryVectors } from './reading-memory-vector-store';

const modelCache = process.env.YOMITOMO_READING_MEMORY_QUALITY_MODEL_CACHE;
const reportPath = process.env.YOMITOMO_READING_MEMORY_QUALITY_OUTPUT;
const workerUrl = new URL('../../../dist/main/reading-memory-embedding-worker.js', import.meta.url);
const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const libraryScope = { kind: 'library' } as const;

it('projects unchanged source-only fixtures and retains them through both production selectors and packing', () => {
  const database = new SQLiteDatabase(':memory:');
  try {
    const corpus = populateReadingMemoryQualityDatabase(database, 'zh');
    const entries = readMissingReadingMemoryVectors(database, {
      modelVersion: 'reading-memory-embedding-v1',
      dimension: 768,
      limit: corpus.length,
    });
    expect(entries).toHaveLength(120);
    const byId = new Map(corpus.map((item) => [item.id, item.text]));
    for (const entry of entries) expect(entry.searchText).toBe(byId.get(entry.targetId));
    expect(
      readReadingEvidenceProjectionStatus({ executor: database, scope: libraryScope }),
    ).toEqual({
      state: 'available',
      coverage: { projectedAssetCount: 120, eligibleAssetCount: 120 },
    });
    const candidates = materializeReadingEvidenceCandidates(
      database,
      entries.slice(0, 24),
      libraryScope,
    );
    expect(candidates).toHaveLength(24);
    expect(
      candidates.every((item) => item.role === 'source' && item.assetType === 'annotation'),
    ).toBe(true);
    for (const kind of ['relate', 'ask'] as const) {
      const query = readingMemoryQualityQueries.find((item) => item.kind === kind)!;
      const result = prepareReadingMemoryQualityEvidence(query, candidates);
      expect(result.evidence).toHaveLength(kind === 'relate' ? 3 : 12);
      expect(result.prepared?.sent.size).toBe(result.evidence.length);
      expect([...result.prepared!.sent.values()]).toEqual(result.evidence);
    }
  } finally {
    database.close();
  }
});

it.skipIf(!modelCache)(
  'strictly gates nine directional synthetic corpora through real-model production retrieval',
  async () => {
    if (!modelCache || !reportPath)
      throw new Error('Quality evaluation requires model cache and report output');
    await stat(workerUrl);
    const sourceDigests = await qualitySourceDigests();
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yomitomo-semantic-quality-'));
    const samples: Array<
      ProductionRetrievalSample & {
        keywordIds: string[];
        inputBytes: number;
        inputTruncated: boolean;
      }
    > = [];
    let result: ReturnType<typeof evaluateProductionRetrieval> | null = null;
    let executionError: string | null = null;
    let manifest: Awaited<ReturnType<typeof installReadingMemoryQualityModel>> | undefined;

    try {
      manifest = await installReadingMemoryQualityModel(modelCache, temporaryDirectory);
      for (const language of semanticRetrievalLanguages) {
        const database = new SQLiteDatabase(join(temporaryDirectory, `${language}.sqlite`));
        const modelLifecycle = createReadingMemoryModelLifecycle({
          userDataPath: temporaryDirectory,
        });
        const index = createReadingMemorySemanticIndex({
          modelLifecycle,
          withDatabase: async (operation) => operation(database, 0),
          createEmbedding: (installation) =>
            createReadingMemoryEmbeddingService(installation, {
              createProcess: (_url, options) => fork(workerUrl, [], options),
            }),
          logError: (event, error) => console.error(event, error),
        });
        try {
          const corpus = populateReadingMemoryQualityDatabase(database, language);
          await index.reconcile('quality-evaluation');
          expect(modelLifecycle.getState().status).toBe('available');
          await vi.waitFor(
            async () => {
              const status = await index.getStatus(libraryScope);
              expect(status.semantic.state).toBe('available');
              expect(status.semantic.coverage).toEqual({
                eligibleEntryCount: corpus.length,
                indexedEntryCount: corpus.length,
              });
            },
            { timeout: 240_000, interval: 100 },
          );
          await index.pauseIndexing();

          for (const query of readingMemoryQualityQueries.filter(
            (item) => item.evidenceLanguage === language,
          )) {
            const keywordIds = readKeywordReadingEvidenceCandidates(
              database,
              query.text,
              libraryScope,
            ).map((item) => item.id);
            const found = await index.search({ query: query.text, scope: libraryScope, limit: 24 });
            const { evidence, prepared } = prepareReadingMemoryQualityEvidence(
              query,
              found.evidence,
            );
            const sample = {
              queryId: query.id,
              candidateIds: found.evidence.map((item) => item.id),
              evidenceIds: evidence.map((item) => item.id),
              sentIds: [...(prepared?.sent.values() ?? [])].map((item) => item.id),
              keywordIds,
              mode: found.mode,
              projection: found.projection,
              semantic: found.semantic,
              inputBytes: prepared ? Buffer.byteLength(prepared.user, 'utf8') : 0,
              inputTruncated: prepared?.truncated ?? false,
            };
            samples.push(sample);
            console.info(
              'reading_memory.quality_query',
              JSON.stringify({
                queryId: sample.queryId,
                evidenceIds: sample.evidenceIds,
                sentIds: sample.sentIds,
                keywordCount: keywordIds.length,
              }),
            );
          }
        } finally {
          await index.dispose();
          database.close();
        }
      }
      result = evaluateProductionRetrieval(readingMemoryQualityQueries, samples);
    } catch (error) {
      executionError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      const report = {
        schemaVersion: 1,
        evaluationId: 'reading-memory-production-hybrid-v1',
        generatedAt: new Date().toISOString(),
        platform: `${process.platform}-${process.arch}`,
        nodeVersion: process.versions.node,
        evidenceClass: 'synthetic-engineering',
        humanReleaseEvidence: false,
        corpus: {
          adapter: 'one-source-highlight-per-fixture-document',
          scope: 'separate-library-per-evidence-language',
          scenarioCount: semanticRetrievalScenarios.length,
          documentCount: readingMemoryQualityCorpus.length,
          queryCount: readingMemoryQualityQueries.length,
          uniqueQueryTextCount: new Set(readingMemoryQualityQueries.map((query) => query.text))
            .size,
          datasetSha256: sha256(JSON.stringify(semanticRetrievalScenarios)),
          evidenceIdMapping: 'reading_evidence_annotation:<fixture-corpus-id>',
          limitations: [
            'No verifiable real-reading provenance or independent human review is attached to these fixtures.',
            'Each ask query has one necessary document; coverage is not multi-evidence sufficiency.',
            'Source-only directional corpora do not establish judgment retrieval or mixed-library quality.',
            'Sent IDs establish retrieval coverage, not whether truncated text supports a generated claim.',
          ],
        },
        model: manifest
          ? {
              modelVersion: manifest.internalId,
              manifestSha256: sha256(JSON.stringify(manifest)),
              runtime: manifest.runtime,
              vector: manifest.vector,
            }
          : null,
        projectorVersion: readingMemoryEvidenceProjectorVersion,
        sourceDigests,
        gate: result,
        executionError,
        queries: readingMemoryQualityQueries.map((query) => ({
          queryId: query.id,
          direction: query.direction,
          kind: query.kind,
          necessaryEvidenceIds: query.necessaryEvidenceIds,
          hardNegativeEvidenceIds: query.hardNegativeEvidenceIds,
        })),
        samples,
      };
      try {
        await mkdir(dirname(reportPath), { recursive: true });
        await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
    expect(result?.failures, 'strict production-hybrid engineering gates').toEqual([]);
    expect(result?.passed).toBe(true);
  },
  20 * 60_000,
);

async function qualitySourceDigests() {
  const paths = [
    'apps/desktop/src/main/reading-memory/reading-memory-semantic-quality-fixture.ts',
    'apps/desktop/src/main/reading-memory/reading-memory-semantic-quality.test.ts',
    'apps/desktop/src/main/reading-memory/reading-memory-semantic-index.ts',
    'apps/desktop/src/main/reading-memory/reading-memory-semantic-search.ts',
    'apps/desktop/src/main/reading-memory/reading-memory-evidence-search.ts',
    'apps/desktop/src/main/reading-memory/reading-memory-vector-store.ts',
    'apps/desktop/dist/main/reading-memory-embedding-worker.js',
    'packages/core/src/reading-memory/reading-evidence-projection.ts',
    'packages/core/src/reading-memory/reading-evidence-ranking.ts',
    'packages/core/src/reading-memory/reading-relation-evidence.ts',
    'packages/ai/src/reading-memory/reading-judgment-input.ts',
    'packages/ai/src/evaluation/semantic-retrieval-evaluation.ts',
    'packages/ai/src/evaluation/semantic-retrieval-production-evaluation.ts',
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, sha256(await readFile(join(repositoryRoot, path)))]),
    ),
  );
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
