import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type {
  LlmProvider,
  ReadingEvidence,
  ReadingJudgmentResult,
  ReadingMemoryEvidenceSearchResult,
} from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingRelationsSearchInput } from '../../ipc/reading-memory-domain';

const paths = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));
vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return { loadSQLiteDatabase: () => SQLiteDatabase };
});
vi.mock('../app/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  pruneLogFile: vi.fn(async () => {}),
}));

import * as schema from '../db/schema';
import { upsertSettings } from '../store/settings-repository';
import { closeDatabase, getDatabase, getSqliteExecutor } from '../store/store-db';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { materializeReadingEvidenceCandidates } from './reading-memory-evidence-search';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { createReadingRelationsRuntime } from './reading-relations-runtime';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

type RunJudgment = (typeof import('@yomitomo/ai'))['runReadingJudgment'];
const timestamp = '2026-08-30T00:00:00.000Z';
const runtimes: ReturnType<typeof createReadingRelationsRuntime>[] = [];

beforeEach(async () => {
  closeDatabase();
  paths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-reading-relations-test-'));
});

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.cancelAll();
  closeDatabase();
  await rm(paths.userData, { recursive: true, force: true });
  paths.userData = '';
});

describe('reading relations local lookup and authorization', () => {
  it('requires ownership and an explicit persisted privacy confirmation before judgment', async () => {
    const fixture = createFixture();
    await fixture.runtime.search(fixture.owner, fixture.input);

    await expect(fixture.runtime.judge(999, fixture.input.requestId)).rejects.toThrow(
      'READING_MEMORY_SESSION_EXPIRED',
    );
    await expect(fixture.judge()).rejects.toThrow('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
    expect(fixture.hydrateProvider).not.toHaveBeenCalled();
    expect(fixture.getAiModule).not.toHaveBeenCalled();

    await fixture.runtime.confirmPrivacy();

    expect(getDatabase().select().from(schema.appSettings).get()?.readingMemoryRemoteConsent).toBe(
      true,
    );
    expect(fixture.send).not.toHaveBeenCalled();
    fixture.runtime.cancel(999, fixture.input.requestId);
    fixture.runtime.cancel(fixture.owner.id, 'different-request');
    await expect(fixture.judge()).resolves.toMatchObject({
      remoteConsentRequired: false,
      judgment: { state: 'generated' },
    });
    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it('cannot confirm privacy or judge while the app is locked', async () => {
    const fixture = createFixture();
    await fixture.runtime.search(fixture.owner, fixture.input);
    upsertSettings(getDatabase(), { appLockEnabled: true, appLockLocked: true });

    await expect(fixture.runtime.confirmPrivacy()).rejects.toThrow('APP_LOCK_REQUIRED');
    await expect(fixture.judge()).rejects.toThrow('APP_LOCK_REQUIRED');
    expect(getDatabase().select().from(schema.appSettings).get()?.readingMemoryRemoteConsent).toBe(
      false,
    );
    expect(fixture.send).not.toHaveBeenCalled();
  });
});

describe('reading relations source freshness', () => {
  it.each(['before-judgment', 'during-network'] as const)(
    'revalidates real source versions %s without serving stale evidence',
    async (stage) => {
      const fixture = createFixture();
      await fixture.runtime.confirmPrivacy();
      await fixture.runtime.search(fixture.owner, fixture.input);
      const pause = fixture.holdNetwork();
      if (stage === 'before-judgment') {
        fixture.changeComment('changed');
        fixture.deleteAnnotation('deleted');
      }

      const judging = fixture.judge();
      await pause.entered;
      if (stage === 'during-network') {
        fixture.changeComment('changed');
        fixture.deleteAnnotation('deleted');
      }
      pause.finish();

      const result = await judging;
      expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['kept']);
      expect(result.judgment.evidence).toEqual(result.evidence);
      if (stage === 'before-judgment') {
        expect(fixture.send.mock.calls[0][1].map((item) => item.location.annotationId)).toEqual([
          'kept',
        ]);
      }
    },
  );
});

describe('reading relations explicit remote work', () => {
  it.each(['id', 'modelName', 'baseUrl'] as const)(
    'requires another click when the actual provider %s changes before judgment',
    async (field) => {
      const fixture = createFixture();
      await fixture.runtime.confirmPrivacy();
      await fixture.runtime.search(fixture.owner, fixture.input);
      fixture.changeProvider(field);

      const result = await fixture.judge();

      expect(result.providerChanged).toBe(true);
      expect(result.judgment).toMatchObject({
        state: 'local',
        reason: 'failed',
        sentEvidenceCount: 0,
      });
      expect(result).not.toHaveProperty('sentProvider');
      expect(result.evidence).toHaveLength(3);
      expect(fixture.hydrateProvider).not.toHaveBeenCalled();
      expect(fixture.send).not.toHaveBeenCalled();

      await expect(fixture.judge()).resolves.toMatchObject({ judgment: { state: 'generated' } });
      expect(fixture.send).toHaveBeenCalledOnce();
    },
  );

  it('keeps source-backed candidates on AI failure and excludes private details from logs', async () => {
    const fixture = createFixture();
    await fixture.runtime.confirmPrivacy();
    const local = await fixture.runtime.search(fixture.owner, fixture.input);
    fixture.runReadingJudgment.mockRejectedValueOnce(new Error('Private provider key and text'));

    const result = await fixture.judge();

    expect(result.evidence).toEqual(local.evidence);
    expect(result.judgment).toMatchObject({
      state: 'local',
      reason: 'failed',
      sentEvidenceCount: 0,
    });
    expect(JSON.stringify(fixture.logInfo.mock.calls)).not.toContain('Private provider');
    expect(fixture.logInfo).toHaveBeenCalledWith('reading_memory.relations_failed', {
      stage: 'judge',
    });
  });
});

function createFixture() {
  const database = getDatabase();
  database.delete(schema.providers).run();
  database
    .insert(schema.providers)
    .values({
      id: 'provider-1',
      name: 'Reading provider',
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
  insertArticle('current');
  const annotationIds: string[] = [];
  function addEvidence(id: string) {
    const articleId = `article-${id}`;
    insertArticle(articleId);
    getDatabase()
      .insert(schema.annotations)
      .values({
        id,
        articleId,
        anchor: { exact: `Original passage ${id}`, prefix: '', suffix: '', start: 0, end: 20 },
        author: 'user',
        color: '#123456',
        userId: 'reader',
        userUsername: 'reader',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    getDatabase()
      .insert(schema.comments)
      .values({
        id: `comment-${id}`,
        annotationId: id,
        author: 'user',
        content: `Private previous judgment ${id}`,
        userId: 'reader',
        userUsername: 'reader',
        createdAt: timestamp,
      })
      .run();
    annotationIds.push(id);
  }
  function readEvidence() {
    const executor = getSqliteExecutor();
    const candidates = readStoredAnnotationThreadSources(executor, annotationIds).flatMap(
      (source) =>
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
    return materializeReadingEvidenceCandidates(executor, candidates, { kind: 'library' });
  }
  for (const id of ['changed', 'deleted', 'kept']) addEvidence(id);
  const evidence = readEvidence();
  const search = vi
    .fn<ReadingMemorySemanticIndex['search']>()
    .mockResolvedValue(searchResult(evidence));
  const send = vi.fn<
    (provider: LlmProvider, evidence: ReadingEvidence[], signal?: AbortSignal) => Promise<void>
  >(async () => {});
  const runReadingJudgment = vi.fn<RunJudgment>(async (provider, _input, candidates, options) => {
    const current = await options.revalidateEvidence(candidates);
    options.signal?.throwIfAborted();
    if (!provider || current.length === 0) {
      return localResult(provider ? 'no_evidence' : 'unconfigured', current);
    }
    await send(provider, current, options.signal);
    options.signal?.throwIfAborted();
    const fresh = await options.revalidateEvidence(current);
    return {
      state: 'generated',
      output: { kind: 'reading-relations', relations: [] },
      evidence: fresh,
      inputTruncated: false,
      sentEvidenceCount: current.length,
    };
  });
  const hydrateProvider = vi.fn(async (provider: LlmProvider) => ({
    ...provider,
    apiKey: 'test-secret',
  }));
  const getAiModule = vi.fn(async () => ({ runReadingJudgment }));
  const logInfo = vi.fn();
  const runtime = createReadingRelationsRuntime({
    semanticIndex: { search },
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
  const input: ReadingRelationsSearchInput = {
    requestId: 'request-1',
    articleId: 'current',
    context: {
      sourceType: 'web',
      quote: 'Private current reading selection',
      nearbyText: 'Private current paragraph',
    },
  };
  return {
    runtime,
    owner,
    input,
    evidence,
    search,
    send,
    runReadingJudgment,
    hydrateProvider,
    getAiModule,
    logInfo,
    addEvidence,
    readEvidence,
    judge: () => runtime.judge(owner.id, input.requestId),
    changeComment: (id: string) =>
      getDatabase()
        .update(schema.comments)
        .set({ content: 'Changed current judgment' })
        .where(eq(schema.comments.id, `comment-${id}`))
        .run(),
    deleteAnnotation: (id: string) =>
      getDatabase().delete(schema.annotations).where(eq(schema.annotations.id, id)).run(),
    changeProvider(field: 'id' | 'modelName' | 'baseUrl') {
      const value = field === 'baseUrl' ? 'https://replacement.example/v1' : 'replacement';
      getDatabase()
        .update(schema.providers)
        .set({ [field]: value })
        .run();
      if (field === 'id') upsertSettings(getDatabase(), { defaultProviderId: value });
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

function insertArticle(id: string) {
  getDatabase()
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

function searchResult(evidence: ReadingEvidence[]): ReadingMemoryEvidenceSearchResult {
  return {
    evidence,
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: evidence.length, eligibleAssetCount: evidence.length },
    },
    semantic: {
      state: 'not_installed',
      modelVersion: 'local-model',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: evidence.length },
      indexingPaused: false,
    },
    mode: 'keyword',
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
