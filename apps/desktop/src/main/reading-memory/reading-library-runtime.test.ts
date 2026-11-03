import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type {
  LlmProvider,
  ReadingEvidence,
  ReadingEvidenceScope,
  ReadingJudgmentResult,
  ReadingMemoryEvidenceSearchResult,
} from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingLibrarySearchInput } from '../../ipc/reading-memory-domain';

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
import { upsertSettings } from '../store/settings-repository';
import { closeDatabase, getDatabase, getSqliteExecutor } from '../store/store-db';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { materializeReadingEvidenceCandidates } from './reading-memory-evidence-search';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { createReadingLibraryRuntime } from './reading-library-runtime';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

type RunJudgment = (typeof import('@yomitomo/ai'))['runReadingJudgment'];
const timestamp = '2026-08-30T00:00:00.000Z';
const libraryScope: ReadingEvidenceScope = { kind: 'library' };
const selectedScope: ReadingEvidenceScope = { kind: 'collection', collectionId: 'selected' };
const runtimes: ReturnType<typeof createReadingLibraryRuntime>[] = [];

beforeEach(async () => {
  closeDatabase();
  paths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-reading-library-test-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const runtime of runtimes.splice(0)) runtime.cancelAll();
  closeDatabase();
  await rm(paths.userData, { recursive: true, force: true });
  paths.userData = '';
});

describe('reading library source scope and local context', () => {
  it('requires request ownership, explicit privacy consent and an unlocked application', async () => {
    const fixture = createFixture();
    const context = await fixture.runtime.context({ scope: libraryScope });
    const input = fixture.input(libraryScope, context.routeRevision);
    await fixture.runtime.search(fixture.owner, input);

    expect(context.remoteConsentRequired).toBe(true);
    await expect(fixture.runtime.answer(999, input.requestId)).rejects.toThrow(
      'READING_MEMORY_SESSION_EXPIRED',
    );
    await expect(fixture.answer()).rejects.toThrow('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
    expect(fixture.getAiModule).not.toHaveBeenCalled();
    fixture.allowRemote();
    fixture.runtime.cancel(999, input.requestId);
    fixture.runtime.cancel(fixture.owner.id, 'different-request');
    const result = await fixture.answer();
    expect(result.judgment.state).toBe('generated');
    expect(fixture.runReadingJudgment.mock.calls[0][1]).toEqual({
      kind: 'library-answer',
      question: input.question,
    });
    upsertSettings(getDatabase(), { appLockEnabled: true, appLockLocked: true });
    await expect(fixture.runtime.context({ scope: libraryScope })).rejects.toThrow(
      'APP_LOCK_REQUIRED',
    );
    await expect(fixture.answer()).rejects.toThrow('APP_LOCK_REQUIRED');
    expect(fixture.send).toHaveBeenCalledOnce();
  });
});

describe('reading library provider authorization', () => {
  it('requires a new submission after observing a changed route even if the old route returns', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const before = await fixture.runtime.context({ scope: libraryScope });
    fixture.setModel('replacement');
    const input = fixture.input(libraryScope, before.routeRevision);
    const changed = await fixture.runtime.search(fixture.owner, input);
    expect(changed.providerChanged).toBe(true);
    expect(changed.routeRevision).not.toBe(input.expectedRouteRevision);
    await expect(fixture.answer()).resolves.toMatchObject({
      providerChanged: true,
      judgment: { state: 'local', sentEvidenceCount: 0 },
    });
    await expect(fixture.answer()).resolves.toMatchObject({
      judgment: { state: 'local', sentEvidenceCount: 0 },
    });
    fixture.setModel('model-1');

    const restored = await fixture.answer();

    expect(restored.judgment).toMatchObject({ state: 'local', sentEvidenceCount: 0 });
    expect(restored).not.toHaveProperty('sentProvider');
    expect(fixture.hydrateProvider).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
    const refreshed = await fixture.runtime.context({ scope: libraryScope });
    await fixture.runtime.search(
      fixture.owner,
      fixture.input(libraryScope, refreshed.routeRevision),
    );
    await expect(fixture.answer()).resolves.toMatchObject({ judgment: { state: 'generated' } });
    expect(fixture.send).toHaveBeenCalledOnce();
  });
});

describe('reading library freshness and lifecycle', () => {
  it('rechecks evidence before and after remote work while returning fresh original counts', async () => {
    const fixture = createFixture(4);
    fixture.collect(fixture.articleIds);
    fixture.allowRemote();
    const local = await fixture.start(selectedScope);
    expect(local).toMatchObject({ sourceCount: 4, judgmentCount: 4 });
    fixture.hydrateProvider.mockImplementationOnce(async (provider) => {
      fixture.changeComment('annotation-0');
      return { ...provider, apiKey: 'test-secret' };
    });
    const pause = fixture.holdNetwork();
    const answering = fixture.answer();
    await pause.entered;
    expect(fixture.send.mock.calls[0][1].map((item) => item.location.annotationId)).toEqual([
      'annotation-1',
      'annotation-2',
      'annotation-3',
    ]);
    fixture.removeMember('article-1');
    getDatabase()
      .insert(schema.comments)
      .values(
        [0, 1].map((index) => ({
          id: `new-judgment-${index}`,
          annotationId: 'annotation-0',
          author: 'user',
          content: `Additional judgment ${index}`,
          userId: 'reader',
          userUsername: 'reader',
          createdAt: timestamp,
        })),
      )
      .run();
    pause.finish();

    const result = await answering;

    expect(result.evidence.map((item) => item.location.annotationId)).toEqual([
      'annotation-2',
      'annotation-3',
    ]);
    expect(result.judgment.evidence).toEqual(result.evidence);
    expect(result).toMatchObject({
      sourceCount: 3,
      judgmentCount: 5,
      judgment: { sentEvidenceCount: 3 },
    });
  });

  it('keeps local evidence on remote failure without exposing private failure details', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const local = await fixture.start();
    fixture.runReadingJudgment.mockRejectedValueOnce(new Error('private source and provider key'));

    const result = await fixture.answer();

    expect(result.evidence).toEqual(local.evidence);
    expect(result.judgment).toMatchObject({ state: 'local', reason: 'failed' });
    expect(fixture.logInfo).toHaveBeenCalledWith('reading_memory.library_failed', {
      stage: 'answer',
    });
    expect(JSON.stringify(fixture.logInfo.mock.calls)).not.toContain('private source');
  });
});

function createFixture(count = 3) {
  const database = getDatabase();
  database
    .insert(schema.providers)
    .values({
      id: 'provider-1',
      name: 'Library provider',
      type: 'openai-chat',
      baseUrl: 'https://provider.example/v1',
      apiKey: '',
      apiKeyRef: 'provider:provider-1:apiKey',
      modelName: 'model-1',
      modelInputMode: 'custom',
      reasoningEffort: 'none',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();
  upsertSettings(database, { defaultProviderId: 'provider-1', readingMemoryRemoteConsent: false });
  const articleIds = Array.from({ length: count }, (_, index) => `article-${index}`);
  for (const id of [...articleIds, 'empty']) {
    database
      .insert(schema.articles)
      .values({
        id,
        url: `https://example.test/${id}`,
        canonicalUrl: `https://example.test/${id}`,
        sourceType: 'web',
        title: `Private title ${id}`,
        contentHash: `hash-${id}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }
  const annotationIds = articleIds.map((articleId, index) => {
    const id = `annotation-${index}`;
    database
      .insert(schema.annotations)
      .values({
        id,
        articleId,
        anchor: { exact: `Saved passage ${index}`, prefix: '', suffix: '', start: 0, end: 20 },
        author: 'user',
        color: '#123456',
        userId: 'reader',
        userUsername: 'reader',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    database
      .insert(schema.comments)
      .values({
        id: `comment-${id}`,
        annotationId: id,
        author: 'user',
        content: `Private reading judgment ${index}`,
        userId: 'reader',
        userUsername: 'reader',
        createdAt: timestamp,
      })
      .run();
    return id;
  });
  const executor = getSqliteExecutor();
  const candidates = readStoredAnnotationThreadSources(executor, annotationIds).flatMap((source) =>
    projectReadingEvidenceThread({
      articleId: source.articleId,
      annotation: source.annotation,
      sourceVersion: source.sourceVersion,
      projectorVersion: readingMemoryEvidenceProjectorVersion,
    })
      .filter((entry) => entry.assetType === 'comment')
      .map((entry) => ({
        id: entry.id,
        articleId: source.articleId,
        targetId: source.targetId,
        sourceVersion: source.sourceVersion,
      })),
  );
  const evidence = materializeReadingEvidenceCandidates(executor, candidates, libraryScope);
  const status = {
    projection: {
      state: 'not_built' as const,
      coverage: { projectedAssetCount: 0, eligibleAssetCount: 0 },
    },
    semantic: {
      state: 'not_installed' as const,
      modelVersion: 'local-model',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 0 },
      indexingPaused: false,
    },
  };
  const found: ReadingMemoryEvidenceSearchResult = { ...status, evidence, mode: 'keyword' };
  const search = vi.fn<ReadingMemorySemanticIndex['search']>().mockResolvedValue(found);
  const getStatus = vi.fn<ReadingMemorySemanticIndex['getStatus']>().mockResolvedValue(status);
  const send = vi.fn<
    (provider: LlmProvider, evidence: ReadingEvidence[], signal?: AbortSignal) => Promise<void>
  >(async () => {});
  const runReadingJudgment = vi.fn<RunJudgment>(async (provider, _input, supplied, options) => {
    const current = await options.revalidateEvidence(supplied);
    options.signal?.throwIfAborted();
    if (!provider || current.length === 0)
      return localResult(provider ? 'no_evidence' : 'unconfigured', current);
    await send(provider, current, options.signal);
    options.signal?.throwIfAborted();
    const fresh = await options.revalidateEvidence(current);
    return {
      state: 'generated',
      output: {
        kind: 'library-answer',
        judgments: [],
        supporting: [],
        opposingOrLimiting: [],
        gaps: [],
      },
      evidence: fresh,
      inputTruncated: true,
      sentEvidenceCount: current.length,
    };
  });
  const hydrateProvider = vi.fn(async (provider: LlmProvider) => ({
    ...provider,
    apiKey: 'test-secret',
  }));
  const getAiModule = vi.fn(async () => ({ runReadingJudgment }));
  const logInfo = vi.fn();
  const runtime = createReadingLibraryRuntime({
    semanticIndex: { search, getStatus },
    getAiModule,
    hydrateProvider,
    logInfo,
  });
  runtimes.push(runtime);
  const events = new EventEmitter();
  let destroyed = false;
  const owner = Object.assign(events, {
    id: 1,
    isDestroyed: () => destroyed,
    destroy: () => {
      destroyed = true;
      events.emit('destroyed');
    },
  }) as unknown as Parameters<typeof runtime.search>[0] & {
    destroy: () => void;
    listenerCount: EventEmitter['listenerCount'];
  };
  return {
    runtime,
    owner,
    input: librarySearchInput,
    articleIds,
    evidence,
    search,
    getStatus,
    send,
    runReadingJudgment,
    hydrateProvider,
    getAiModule,
    logInfo,
    allowRemote: () => upsertSettings(getDatabase(), { readingMemoryRemoteConsent: true }),
    answer: () => runtime.answer(owner.id, 'request-1'),
    start: async (scope: ReadingEvidenceScope = libraryScope) => {
      const context = await runtime.context({ scope });
      return runtime.search(owner, librarySearchInput(scope, context.routeRevision));
    },
    setModel: (modelName: string) =>
      getDatabase().update(schema.providers).set({ modelName }).run(),
    changeComment: (id: string) =>
      getDatabase()
        .update(schema.comments)
        .set({ content: 'Changed judgment' })
        .where(eq(schema.comments.annotationId, id))
        .run(),
    removeMember: (articleId: string) =>
      getDatabase()
        .delete(schema.collectionMembers)
        .where(
          and(
            eq(schema.collectionMembers.collectionId, 'selected'),
            eq(schema.collectionMembers.memberId, articleId),
          ),
        )
        .run(),
    collect(ids: string[]) {
      getDatabase()
        .insert(schema.collections)
        .values({
          id: 'selected',
          name: 'Selected reading',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      for (const memberId of ids)
        getDatabase()
          .insert(schema.collectionMembers)
          .values({ collectionId: 'selected', memberKind: 'article', memberId, addedAt: timestamp })
          .run();
    },
    holdNetwork() {
      const entered = deferred<AbortSignal | undefined>();
      const finished = deferred<void>();
      send.mockImplementationOnce(async (_provider, _evidence, signal) => {
        entered.resolve(signal);
        await finished.promise;
      });
      return { entered: entered.promise, finish: () => finished.resolve() };
    },
  };
}

function librarySearchInput(
  scope: ReadingEvidenceScope,
  expectedRouteRevision: string,
): ReadingLibrarySearchInput {
  return {
    requestId: 'request-1',
    question: 'What have I learned about memory?',
    scope,
    expectedRouteRevision,
  };
}

function localResult(
  reason: 'no_evidence' | 'unconfigured',
  evidence: ReadingEvidence[],
): ReadingJudgmentResult {
  return { state: 'local', reason, evidence, inputTruncated: false, sentEvidenceCount: 0 };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
