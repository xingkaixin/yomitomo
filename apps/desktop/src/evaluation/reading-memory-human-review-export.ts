import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  rankReadingEvidenceCandidates,
  rankReadingReviewCandidates,
  readingReviewSignalLimits,
  selectReadingRelationEvidence,
  type ReadingReviewSignalCandidate,
} from '@yomitomo/core';
import {
  ARTICLE_SOURCE_TYPES,
  type ArticleSourceType,
  type LlmProvider,
  type ReadingEvidence,
  type ReadingEvidenceProjectionStatus,
  type ReadingEvidenceScope,
  type ReadingMemorySemanticStatus,
} from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import type { ReadingMemoryHumanRetrievalRecord } from '../../../../packages/ai/src/evaluation/reading-memory-human-retrieval-evaluation';
import type { ReadingMemoryHumanReviewRecord } from '../../../../packages/ai/src/evaluation/reading-memory-human-review-evaluation';
import { prepareReadingJudgmentInput } from '../../../../packages/ai/src/reading-memory/reading-judgment-input';
import { createReadingMemoryEmbeddingService } from '../main/reading-memory/reading-memory-embedding-service';
import { runReadingMemoryEvidenceProjectionBatch } from '../main/reading-memory/reading-memory-evidence-projection-batch';
import {
  materializeReadingEvidenceCandidates,
  readKeywordReadingEvidenceCandidates,
  readReadingEvidenceProjectionStatus,
} from '../main/reading-memory/reading-memory-evidence-search';
import { createReadingMemoryModelLifecycle } from '../main/reading-memory/reading-memory-model-lifecycle';
import { createReadingMemorySemanticIndex } from '../main/reading-memory/reading-memory-semantic-index';
import { installReadingMemoryQualityModel } from '../main/reading-memory/reading-memory-semantic-quality-fixture';
import {
  readReadingReviewAssetPage,
  type ReadingReviewAsset,
  type ReadingReviewAssetCursor,
} from '../main/reading-memory/reading-review-source';

export type ReadingMemoryHumanReviewLanguage = 'zh' | 'en' | 'ja';

export type ReadingMemoryHumanReviewQueryInput = {
  id: string;
  kind: 'relate' | 'ask';
  queryLanguage: ReadingMemoryHumanReviewLanguage;
  evidenceLanguage: ReadingMemoryHumanReviewLanguage;
  query: string;
  articleId?: string;
  selectionSourceType?: ArticleSourceType;
};

export type ExportReadingMemoryHumanReviewTemplatesOptions = {
  dbPath: string;
  queries: readonly ReadingMemoryHumanReviewQueryInput[];
  outputDir: string;
  evaluationId: string;
  systemRevision: string;
  modelCachePath?: string;
  allowKeywordFallback?: boolean;
  protectedInputPaths?: readonly string[];
};

type ReplaySnapshotEvidenceSummary = {
  id: string;
  assetType: ReadingEvidence['assetType'];
  role: ReadingEvidence['role'];
  authorKind?: ReadingEvidence['authorKind'];
  articleId: string;
  articleTitle: string;
  annotationId: string;
  commentId?: string;
  quote: string;
  content: string;
  review?: ReadingEvidence['review'];
};

export type ReadingMemoryHumanReviewReplaySnapshot = {
  schemaVersion: 1;
  evaluationId: string;
  dbSha256: string;
  systemRevision: string;
  retrievalMode: 'hybrid' | 'keyword';
  projection: ReadingEvidenceProjectionStatus;
  semantic: ReadingMemorySemanticStatus | null;
  queries: Array<{
    id: string;
    kind: 'relate' | 'ask';
    queryLanguage: ReadingMemoryHumanReviewLanguage;
    evidenceLanguage: ReadingMemoryHumanReviewLanguage;
    query: string;
    candidateIds: string[];
    displayedIds: string[];
    sentIds: string[];
    inputBytes: number;
    inputTruncated: boolean;
  }>;
  evidenceById: Record<string, ReplaySnapshotEvidenceSummary>;
};

export type UnlabeledQualityReviewTemplate = Omit<
  ReadingMemoryHumanReviewRecord,
  'claims' | 'reviewQueues'
> & {
  claims: Array<
    Omit<ReadingMemoryHumanReviewRecord['claims'][number], 'directlySupported'> & {
      directlySupported: boolean | null;
    }
  >;
  reviewQueues: Array<
    Omit<ReadingMemoryHumanReviewRecord['reviewQueues'][number], 'items'> & {
      items: Array<
        Omit<
          ReadingMemoryHumanReviewRecord['reviewQueues'][number]['items'][number],
          'reviewable'
        > & {
          reviewable: boolean | null;
        }
      >;
    }
  >;
};

export type ExportReadingMemoryHumanReviewTemplatesResult = {
  evaluationId: string;
  systemRevision: string;
  retrievalMode: 'hybrid' | 'keyword';
  dbSha256: string;
  projection: ReadingEvidenceProjectionStatus;
  queryCount: number;
  prefilledTimeReviewQueue: boolean;
  files: {
    retrievalTemplate: string;
    qualityTemplate: string;
    replaySnapshot: string;
  };
};

type ValidatedQuery = {
  id: string;
  kind: 'relate' | 'ask';
  queryLanguage: ReadingMemoryHumanReviewLanguage;
  evidenceLanguage: ReadingMemoryHumanReviewLanguage;
  query: string;
  articleId?: string;
  selectionSourceType?: ArticleSourceType;
};

const repositoryRoot = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const workerUrl = new URL('../../dist/main/reading-memory-embedding-worker.js', import.meta.url);
const libraryScope: ReadingEvidenceScope = { kind: 'library' };
const supportedLanguages = new Set<ReadingMemoryHumanReviewLanguage>(['zh', 'en', 'ja']);
const supportedSourceTypes = new Set<ArticleSourceType>(ARTICLE_SOURCE_TYPES);
const candidateSearchLimit = 24;
const askEvidenceLimit = 12;
const semanticReadyTimeoutMs = 20 * 60_000;
const semanticPollIntervalMs = 100;
const outputFileNames = {
  retrievalTemplate: 'retrieval-review-template.json',
  qualityTemplate: 'quality-review-template.json',
  replaySnapshot: 'replay-snapshot.json',
} as const;
const inputBudgetProvider: LlmProvider = {
  id: 'offline-review-input-budget',
  name: 'Offline input budget only',
  type: 'openai-chat',
  baseUrl: 'https://example.invalid',
  apiKey: '',
  modelName: 'offline-review-input-budget',
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
};

export async function exportReadingMemoryHumanReviewTemplates(
  options: ExportReadingMemoryHumanReviewTemplatesOptions,
): Promise<ExportReadingMemoryHumanReviewTemplatesResult> {
  const validated = validateOptions(options);
  const paths = await validatePaths(validated);
  const dbSha256 = await sha256File(paths.dbPath);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'yomitomo-human-review-export-'));
  const temporaryDbPath = join(temporaryDirectory, 'reading-memory.sqlite');
  let database: SQLiteDatabase.Database | null = null;

  try {
    await copyFile(paths.dbPath, temporaryDbPath);
    database = new SQLiteDatabase(temporaryDbPath);
    database.pragma('foreign_keys = ON');
    runProjectionBatchToCompletion(database);

    const projection = readReadingEvidenceProjectionStatus({
      executor: database,
      scope: libraryScope,
    });
    const retrievalRun = paths.modelCachePath
      ? await runHybridRetrieval(
          database,
          temporaryDirectory,
          paths.modelCachePath,
          validated.queries,
        )
      : runKeywordRetrieval(database, validated.queries);

    const evidenceById: Record<string, ReplaySnapshotEvidenceSummary> = {};
    const retrievalItems: ReadingMemoryHumanRetrievalRecord['retrieval'] = [];
    const snapshotQueries: ReadingMemoryHumanReviewReplaySnapshot['queries'] = [];

    for (const [index, query] of validated.queries.entries()) {
      const candidates = retrievalRun.candidatesByQuery[index];
      for (const candidate of candidates) {
        evidenceById[candidate.id] ??= summarizeEvidence(candidate);
      }

      const displayed = selectDisplayedEvidence(query, candidates);
      const judgmentInput =
        query.kind === 'relate'
          ? { kind: 'reading-relations' as const, selection: query.query }
          : { kind: 'library-answer' as const, question: query.query };
      const prepared = prepareReadingJudgmentInput(inputBudgetProvider, judgmentInput, displayed);
      const candidateIds = candidates.map((item) => item.id);
      const displayedIds = displayed.map((item) => item.id);
      const sentIds = [...(prepared?.sent.values() ?? [])].map((item) => item.id);
      const inputBytes = prepared ? Buffer.byteLength(prepared.user, 'utf8') : 0;
      const inputTruncated = prepared?.truncated ?? false;

      const baseRecord = {
        id: query.id,
        queryLanguage: query.queryLanguage,
        evidenceLanguage: query.evidenceLanguage,
        query: query.query,
        displayedIds,
        sentIds,
      };
      retrievalItems.push(
        query.kind === 'relate'
          ? { ...baseRecord, kind: 'relate', helpfulIds: [] }
          : { ...baseRecord, kind: 'ask', necessaryIds: [] },
      );
      snapshotQueries.push({
        id: query.id,
        kind: query.kind,
        queryLanguage: query.queryLanguage,
        evidenceLanguage: query.evidenceLanguage,
        query: query.query,
        candidateIds,
        displayedIds,
        sentIds,
        inputBytes,
        inputTruncated,
      });
    }

    const retrievalTemplate: ReadingMemoryHumanRetrievalRecord = {
      schemaVersion: 1,
      evaluationId: validated.evaluationId,
      systemRevision: validated.systemRevision,
      provenance: emptyProvenance(),
      retrieval: retrievalItems,
    };

    const timeQueueAssets = selectTopTimeReviewAssets(database);
    const qualityTemplate = buildQualityReviewTemplate(
      validated.evaluationId,
      validated.systemRevision,
      timeQueueAssets,
    );

    const replaySnapshot: ReadingMemoryHumanReviewReplaySnapshot = {
      schemaVersion: 1,
      evaluationId: validated.evaluationId,
      dbSha256,
      systemRevision: validated.systemRevision,
      retrievalMode: retrievalRun.retrievalMode,
      projection,
      semantic: retrievalRun.semantic,
      queries: snapshotQueries,
      evidenceById,
    };

    await mkdir(paths.outputDir, { recursive: true });
    const actualOutputDir = await realpath(paths.outputDir);
    assertOutsidePath(actualOutputDir, paths.repositoryRootReal, 'outputDir');

    const outputPaths = {
      retrievalTemplate: join(actualOutputDir, outputFileNames.retrievalTemplate),
      qualityTemplate: join(actualOutputDir, outputFileNames.qualityTemplate),
      replaySnapshot: join(actualOutputDir, outputFileNames.replaySnapshot),
    };
    await writeJson(outputPaths.retrievalTemplate, retrievalTemplate);
    await writeJson(outputPaths.qualityTemplate, qualityTemplate);
    await writeJson(outputPaths.replaySnapshot, replaySnapshot);

    return {
      evaluationId: validated.evaluationId,
      systemRevision: validated.systemRevision,
      retrievalMode: retrievalRun.retrievalMode,
      dbSha256,
      projection,
      queryCount: retrievalItems.length,
      prefilledTimeReviewQueue: timeQueueAssets.length === 5,
      files: outputPaths,
    };
  } finally {
    database?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function validateOptions(options: ExportReadingMemoryHumanReviewTemplatesOptions) {
  const dbPath = requireNonBlank(options.dbPath, 'dbPath');
  const outputDir = requireNonBlank(options.outputDir, 'outputDir');
  const evaluationId = requireIdentifier(options.evaluationId, 'evaluationId');
  const systemRevision = requireNonBlank(options.systemRevision, 'systemRevision');
  if (!/^[a-f\d]{40}$/iu.test(systemRevision)) {
    throw new Error('systemRevision must be a full 40-hex commit');
  }
  const modelCachePath =
    options.modelCachePath === undefined
      ? undefined
      : requireNonBlank(options.modelCachePath, 'modelCachePath');
  if (!modelCachePath && options.allowKeywordFallback !== true) {
    throw new Error(
      'Provide modelCachePath for hybrid retrieval, or set allowKeywordFallback: true for offline keyword retrieval',
    );
  }
  const queries = validateQueries(options.queries);
  return {
    dbPath,
    outputDir,
    evaluationId,
    systemRevision,
    modelCachePath,
    queries,
    protectedInputPaths: options.protectedInputPaths ?? [],
  };
}

function validateQueries(queries: readonly ReadingMemoryHumanReviewQueryInput[]): ValidatedQuery[] {
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('queries must be a non-empty array');
  }
  const ids = new Set<string>();
  const uniqueQueries = new Set<string>();
  return queries.map((entry, index) => {
    const label = `queries[${index}]`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${label} must be an object`);
    }
    const id = requireIdentifier(entry.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`${label}.id duplicates an existing query id`);
    ids.add(id);

    if (entry.kind !== 'relate' && entry.kind !== 'ask') {
      throw new Error(`${label}.kind must be relate or ask`);
    }
    if (!supportedLanguages.has(entry.queryLanguage)) {
      throw new Error(`${label}.queryLanguage must be one of: zh, en, ja`);
    }
    if (!supportedLanguages.has(entry.evidenceLanguage)) {
      throw new Error(`${label}.evidenceLanguage must be one of: zh, en, ja`);
    }
    const query = requireNonBlank(entry.query, `${label}.query`);
    const dedupeKey = JSON.stringify([
      entry.kind,
      entry.queryLanguage,
      entry.evidenceLanguage,
      query,
    ]);
    if (uniqueQueries.has(dedupeKey)) {
      throw new Error(`${label}.query duplicates an existing query for this kind and direction`);
    }
    uniqueQueries.add(dedupeKey);

    const articleId =
      entry.articleId === undefined
        ? undefined
        : requireNonBlank(entry.articleId, `${label}.articleId`);
    if (
      entry.selectionSourceType !== undefined &&
      !supportedSourceTypes.has(entry.selectionSourceType)
    ) {
      throw new Error(`${label}.selectionSourceType must be one of: web, ebook, pdf, text`);
    }
    return {
      id,
      kind: entry.kind,
      queryLanguage: entry.queryLanguage,
      evidenceLanguage: entry.evidenceLanguage,
      query,
      ...(articleId ? { articleId } : {}),
      ...(entry.selectionSourceType ? { selectionSourceType: entry.selectionSourceType } : {}),
    };
  });
}

async function validatePaths(validated: ReturnType<typeof validateOptions>) {
  const repositoryRootResolved = resolve(repositoryRoot);
  const repositoryRootReal = await realpath(repositoryRootResolved);
  const resolvedDbPath = resolve(validated.dbPath);
  const dbStat = await stat(resolvedDbPath);
  if (!dbStat.isFile()) throw new Error('dbPath must point to an existing SQLite file');
  const dbPath = await realpath(resolvedDbPath);

  let modelCachePath: string | undefined;
  if (validated.modelCachePath !== undefined) {
    const resolvedCachePath = resolve(validated.modelCachePath);
    const cacheStat = await stat(resolvedCachePath);
    if (!cacheStat.isDirectory()) throw new Error('modelCachePath must be a directory');
    modelCachePath = await realpath(resolvedCachePath);
  }

  const resolvedOutputDir = resolve(validated.outputDir);
  assertOutsidePath(resolvedOutputDir, repositoryRootResolved, 'outputDir');
  const outputDirReal = await resolveCandidateRealPath(resolvedOutputDir);
  assertOutsidePath(outputDirReal, repositoryRootReal, 'outputDir');

  const existingOutput = await lstatIfExists(resolvedOutputDir);
  if (existingOutput) {
    const targetStat = existingOutput.isSymbolicLink()
      ? await stat(resolvedOutputDir)
      : existingOutput;
    if (!targetStat.isDirectory()) {
      throw new Error('outputDir must not point to an existing file');
    }
  }

  const protectedFiles = [dbPath];
  for (const inputPath of validated.protectedInputPaths) {
    const resolved = resolve(inputPath);
    const real = (await lstatIfExists(resolved)) ? await realpath(resolved) : resolved;
    protectedFiles.push(real);
  }

  if (modelCachePath) {
    assertOutsidePath(outputDirReal, modelCachePath, 'outputDir');
  }

  for (const protectedFile of protectedFiles) {
    if (isSameOrInsidePath(outputDirReal, protectedFile)) {
      throw new Error('outputDir must not equal an input file');
    }
    const protectedStat = await statIfExists(protectedFile);
    for (const fileName of Object.values(outputFileNames)) {
      const outputFilePath = join(outputDirReal, fileName);
      if (outputFilePath === protectedFile) {
        throw new Error(`outputDir would overwrite input file: ${fileName}`);
      }
      if (protectedStat) {
        const existingTarget = await statIfExists(outputFilePath);
        if (
          existingTarget &&
          existingTarget.dev === protectedStat.dev &&
          existingTarget.ino === protectedStat.ino
        ) {
          throw new Error(`outputDir would overwrite input file: ${fileName}`);
        }
      }
    }
  }

  return {
    dbPath,
    outputDir: resolvedOutputDir,
    modelCachePath,
    repositoryRootReal,
  };
}

function runProjectionBatchToCompletion(database: SQLiteDatabase.Database) {
  let now = new Date();
  while (true) {
    const batch = runReadingMemoryEvidenceProjectionBatch(database, { now });
    if (batch.failures.length > 0) {
      throw new AggregateError(
        batch.failures.map((failure) => failure.error),
        'Reading memory evidence projection failed',
      );
    }
    if (batch.hasImmediateWork) continue;
    if (!batch.nextJobAvailableAt) break;
    const nextTimestamp = Date.parse(batch.nextJobAvailableAt);
    if (!Number.isFinite(nextTimestamp) || nextTimestamp <= now.getTime()) break;
    now = new Date(nextTimestamp + 1);
  }
}

async function runHybridRetrieval(
  database: SQLiteDatabase.Database,
  temporaryDirectory: string,
  modelCachePath: string,
  queries: readonly ValidatedQuery[],
) {
  await stat(workerUrl);
  const modelUserDataPath = join(temporaryDirectory, 'model-user-data');
  await installReadingMemoryQualityModel(modelCachePath, modelUserDataPath);

  const modelLifecycle = createReadingMemoryModelLifecycle({
    userDataPath: modelUserDataPath,
  });
  const index = createReadingMemorySemanticIndex({
    modelLifecycle,
    withDatabase: async (operation) => operation(database, 0),
    createEmbedding: (installation) =>
      createReadingMemoryEmbeddingService(installation, {
        createProcess: (_url, options) => fork(workerUrl, [], options),
      }),
  });

  try {
    await index.reconcile('human-review-export');
    const lifecycleState = modelLifecycle.getState();
    if (lifecycleState.status !== 'available') {
      throw new Error(`Model verification failed: ${lifecycleState.status}`);
    }
    const status = await waitForSemanticReady(index);
    await index.pauseIndexing();

    const candidatesByQuery: ReadingEvidence[][] = [];
    for (const query of queries) {
      const found = await index.search({
        query: query.query,
        scope: libraryScope,
        limit: candidateSearchLimit,
      });
      candidatesByQuery.push(found.evidence);
    }

    return {
      retrievalMode: 'hybrid' as const,
      semantic: status.semantic,
      candidatesByQuery,
    };
  } finally {
    await index.dispose();
  }
}

function runKeywordRetrieval(
  database: SQLiteDatabase.Database,
  queries: readonly ValidatedQuery[],
) {
  const candidatesByQuery = queries.map((query) => {
    const normalizedQuery = query.query.trim().normalize();
    const rawCandidates = readKeywordReadingEvidenceCandidates(
      database,
      normalizedQuery,
      libraryScope,
    );
    if (rawCandidates.length === 0) return [];
    const materialized = materializeReadingEvidenceCandidates(
      database,
      rawCandidates,
      libraryScope,
      normalizedQuery,
    );
    return rankReadingEvidenceCandidates(materialized, candidateSearchLimit);
  });

  return {
    retrievalMode: 'keyword' as const,
    semantic: null,
    candidatesByQuery,
  };
}

async function waitForSemanticReady(index: ReturnType<typeof createReadingMemorySemanticIndex>) {
  const deadline = Date.now() + semanticReadyTimeoutMs;
  while (true) {
    const status = await index.getStatus(libraryScope);
    if (status.semantic.state === 'failed') {
      throw new Error('Reading memory semantic indexing failed during export');
    }
    if (
      status.semantic.state === 'available' &&
      status.semantic.coverage.indexedEntryCount === status.semantic.coverage.eligibleEntryCount
    ) {
      return status;
    }
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for reading memory semantic indexing');
    }
    await delay(semanticPollIntervalMs);
  }
}

function selectDisplayedEvidence(query: ValidatedQuery, candidates: readonly ReadingEvidence[]) {
  if (query.kind === 'relate') {
    return selectReadingRelationEvidence(candidates, {
      articleId: query.articleId ?? 'offline-review-selection',
      context: {
        sourceType: query.selectionSourceType ?? 'web',
        quote: query.query,
      },
    });
  }
  return rankReadingEvidenceCandidates(candidates, askEvidenceLimit);
}

function selectTopTimeReviewAssets(database: SQLiteDatabase.Database): ReadingReviewAsset[] {
  const candidates: Array<ReadingReviewSignalCandidate & { asset: ReadingReviewAsset }> = [];
  let cursor: ReadingReviewAssetCursor | undefined;
  while (true) {
    const page = readReadingReviewAssetPage(database, cursor);
    for (const asset of page.assets) {
      const dueAt = asset.current.latestReview?.createdAt ?? asset.base.formedAt;
      if (!Number.isFinite(Date.parse(dueAt))) continue;
      candidates.push({
        id: `reading_evidence_${asset.base.assetType}:${asset.base.assetId}`,
        targetId: asset.base.annotationId,
        sourceCreatedAt: asset.base.formedAt,
        ...(asset.current.latestReview ? { lastReviewedAt: dueAt } : {}),
        asset,
      });
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  if (candidates.length < 5) return [];

  const earliestCandidates = candidates
    .toSorted((left, right) => {
      const leftDue = Date.parse(left.lastReviewedAt ?? left.sourceCreatedAt);
      const rightDue = Date.parse(right.lastReviewedAt ?? right.sourceCreatedAt);
      return leftDue - rightDue || compareIds(left.id, right.id);
    })
    .slice(0, readingReviewSignalLimits.candidateCount);
  const ranked = rankReadingReviewCandidates(earliestCandidates, new Map());

  const selected: ReadingReviewAsset[] = [];
  const seenJudgments = new Set<string>();
  for (const candidate of ranked) {
    const judgment = candidate.asset.current.content.trim();
    if (!judgment || seenJudgments.has(judgment)) continue;
    seenJudgments.add(judgment);
    selected.push(candidate.asset);
    if (selected.length === 5) return selected;
  }
  return [];
}

function buildQualityReviewTemplate(
  evaluationId: string,
  systemRevision: string,
  timeQueueAssets: readonly ReadingReviewAsset[],
): UnlabeledQualityReviewTemplate {
  const placeholderQueueItems = () =>
    Array.from({ length: 5 }, () => ({ judgment: '', reviewable: null }));

  const timeQueue =
    timeQueueAssets.length === 5
      ? {
          id: 'time-queue-1',
          mode: 'time' as const,
          context: 'Top 5 time-ordered reading review assets from offline SQLite snapshot',
          items: timeQueueAssets.map((asset) => ({
            judgment: asset.current.content.trim(),
            reviewable: null,
          })),
        }
      : {
          id: 'time-queue-1',
          mode: 'time' as const,
          context: '',
          items: placeholderQueueItems(),
        };

  return {
    schemaVersion: 1,
    evaluationId,
    systemRevision,
    provenance: emptyProvenance(),
    claims: [
      {
        id: 'claim-1',
        claim: '',
        citations: [{ excerpt: '' }],
        directlySupported: null,
      },
    ],
    relations: [
      {
        id: 'relation-1',
        judgment: '',
        evidence: '',
        expectedRelation: null,
        outputRelation: null,
      },
    ],
    reviewQueues: [
      {
        id: 'semantic-queue-1',
        mode: 'semantic',
        context: '',
        items: placeholderQueueItems(),
      },
      timeQueue,
    ],
  };
}

function emptyProvenance() {
  return {
    source: 'deidentified-real-reading' as const,
    sourceStatement: '',
    reviewMethod: 'independent-human' as const,
    reviewerId: '',
  };
}

function summarizeEvidence(evidence: ReadingEvidence): ReplaySnapshotEvidenceSummary {
  return {
    id: evidence.id,
    assetType: evidence.assetType,
    role: evidence.role,
    ...(evidence.authorKind ? { authorKind: evidence.authorKind } : {}),
    articleId: evidence.source.ref.id,
    articleTitle: evidence.source.title,
    annotationId: evidence.location.annotationId,
    ...(evidence.location.commentId ? { commentId: evidence.location.commentId } : {}),
    quote: evidence.location.anchor.exact,
    content: evidence.content,
    ...(evidence.review ? { review: evidence.review } : {}),
  };
}

function requireNonBlank(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must contain nonblank text`);
  }
  return value.trim();
}

function requireIdentifier(value: unknown, label: string) {
  const normalized = requireNonBlank(value, label);
  if (normalized.length > 128) throw new Error(`${label} must not exceed 128 characters`);
  return normalized;
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSameOrInsidePath(candidate: string, base: string) {
  const rel = relative(base, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function assertOutsidePath(candidate: string, boundary: string, label: string) {
  if (isSameOrInsidePath(candidate, boundary)) {
    throw new Error(`${label} must be outside ${boundary}`);
  }
}

async function resolveCandidateRealPath(targetPath: string) {
  const missingSegments: string[] = [];
  let current = resolve(targetPath);
  while (true) {
    try {
      const resolvedExisting = await realpath(current);
      return missingSegments.length === 0
        ? resolvedExisting
        : join(resolvedExisting, ...missingSegments.toReversed());
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) return resolve(targetPath);
      missingSegments.push(basename(current));
      current = parent;
    }
  }
}

async function lstatIfExists(targetPath: string) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

async function statIfExists(targetPath: string) {
  try {
    return await stat(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw error;
  }
}

async function sha256File(filePath: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
