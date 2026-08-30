import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
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
const ipcMainHandle = vi.hoisted(() => vi.fn<(typeof import('electron'))['ipcMain']['handle']>());

vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
  ipcMain: { handle: ipcMainHandle, on: vi.fn() },
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
import { rowToSettings } from '../store/store-normalizers';
import { registerProviderIpc } from '../ipc/ipc-provider';
import {
  backupDatabaseFile,
  closeDatabase,
  getDatabase,
  getSqliteExecutor,
  readDatabaseLifecycle,
  replaceDatabaseFile,
} from '../store/store-db';
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
  it('keeps the selection topic when a supplemental question is supplied', async () => {
    const fixture = createFixture();
    const input: ReadingRelationsSearchInput = {
      ...fixture.input,
      context: {
        sourceType: 'web',
        quote: '长期记忆如何影响阅读理解',
        nearbyText: '附近材料不应进入本地检索',
      },
      question: '我以前是否有不同看法',
    };

    await fixture.runtime.search(fixture.owner, input);
    const query = fixture.search.mock.calls[0][0].query;

    expect(query).toBe(`${input.context.quote}\n${input.question}`);
    expect(query).not.toContain(input.context.nearbyText);
  });

  it('returns at most three real source-backed candidates without loading AI or keys', async () => {
    const fixture = createFixture();
    fixture.addEvidence('fourth');
    fixture.search.mockResolvedValueOnce(searchResult(fixture.readEvidence()));

    const result = await fixture.runtime.search(fixture.owner, fixture.input);

    expect(result.evidence).toHaveLength(3);
    expect(result.evidence.every((item) => item.sourceVersion.length === 64)).toBe(true);
    expect(result).toMatchObject({
      requestId: fixture.input.requestId,
      remoteConsentRequired: true,
      provider: { id: 'provider-1', name: 'Reading provider', modelName: 'model-1' },
    });
    expect(Object.keys(result.provider!).toSorted()).toEqual(['id', 'modelName', 'name', 'type']);
    expect(fixture.hydrateProvider).not.toHaveBeenCalled();
    expect(fixture.getAiModule).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.search).toHaveBeenCalledWith(
      { query: fixture.input.context.quote, scope: { kind: 'library' }, limit: 24 },
      { signal: expect.any(AbortSignal) },
    );
    expect(JSON.stringify(fixture.logInfo.mock.calls)).not.toContain(fixture.input.context.quote);
    expect(readDatabaseLifecycle().leases).toBe(0);
  });

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

  it('preserves a search failure as a safe failure instead of reporting user cancellation', async () => {
    const fixture = createFixture();
    fixture.search.mockRejectedValueOnce(new Error('Private source text from embedding failure'));

    await expect(fixture.runtime.search(fixture.owner, fixture.input)).rejects.toMatchObject({
      name: 'Error',
      message: 'READING_MEMORY_SEARCH_FAILED',
    });
    expect(JSON.stringify(fixture.logInfo.mock.calls)).not.toContain('Private source text');
    expect(fixture.owner.listenerCount('destroyed')).toBe(0);
  });

  it('keeps confirmed privacy when generic settings save receives an older full snapshot', async () => {
    const fixture = createFixture();
    const staleSettings = rowToSettings(getDatabase().select().from(schema.appSettings).get());
    expect(staleSettings.readingMemoryRemoteConsent).toBe(false);
    await fixture.runtime.confirmPrivacy();
    const [storeSettings, providerRepository, storeProviders] = await Promise.all([
      import('../store/store-settings'),
      import('../providers/provider-repository'),
      import('../store/store-providers'),
    ]);
    const getAiModule = vi.fn(async () => {
      throw new Error('Settings must not load AI');
    });
    ipcMainHandle.mockClear();
    registerProviderIpc({
      getPersistenceModules: async () => ({ storeSettings, providerRepository, storeProviders }),
      getAiModule,
      sendFullStoreUpdated: vi.fn(),
    });
    const handler = ipcMainHandle.mock.calls.find(([channel]) => channel === 'settings:save')?.[1];
    expect(handler).toBeDefined();

    const result = await handler!({} as IpcMainInvokeEvent, {
      ...staleSettings,
      lastSeenVersion: '0.15.0',
    });

    expect(result).toMatchObject({ ok: true });
    expect(getDatabase().select().from(schema.appSettings).get()).toMatchObject({
      readingMemoryRemoteConsent: true,
      lastSeenVersion: '0.15.0',
    });
    expect(getAiModule).not.toHaveBeenCalled();
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
  it('drops changed and deleted original assets while a local search is running', async () => {
    const fixture = createFixture();
    const pending = deferred<ReadingMemoryEvidenceSearchResult>();
    const entered = deferred<void>();
    fixture.search.mockImplementationOnce(async () => {
      entered.resolve();
      return pending.promise;
    });
    const searching = fixture.runtime.search(fixture.owner, fixture.input);
    await entered.promise;

    fixture.changeComment('changed');
    fixture.deleteAnnotation('deleted');
    pending.resolve(searchResult(fixture.evidence));

    const result = await searching;
    expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['kept']);
  });

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

  it('rejects a search snapshot after restoring even an identical database', async () => {
    const fixture = createFixture();
    const backup = join(paths.userData, 'backup.sqlite');
    await backupDatabaseFile(backup);
    const pending = deferred<ReadingMemoryEvidenceSearchResult>();
    const entered = deferred<void>();
    fixture.search.mockImplementationOnce(async () => {
      entered.resolve();
      return pending.promise;
    });
    const searching = fixture.runtime.search(fixture.owner, fixture.input);
    const settled = expect(searching).rejects.toThrow('READING_MEMORY_SEARCH_FAILED');
    await entered.promise;
    const generation = readDatabaseLifecycle().generation;

    await replaceDatabaseFile(backup);
    expect(readDatabaseLifecycle().generation).toBeGreaterThan(generation);
    pending.resolve(searchResult(fixture.evidence));

    await settled;
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('allows database restore during a pending network request and rejects its old generation', async () => {
    const fixture = createFixture();
    await fixture.runtime.confirmPrivacy();
    const backup = join(paths.userData, 'backup.sqlite');
    await backupDatabaseFile(backup);
    await fixture.runtime.search(fixture.owner, fixture.input);
    const pause = fixture.holdNetwork();
    const judging = fixture.judge();
    const settled = expect(judging).rejects.toThrow('READING_MEMORY_SESSION_EXPIRED');
    await pause.entered;

    expect(readDatabaseLifecycle()).toMatchObject({ state: 'open', leases: 0 });
    const generation = readDatabaseLifecycle().generation;
    await replaceDatabaseFile(backup);
    expect(readDatabaseLifecycle().generation).toBeGreaterThan(generation);
    pause.finish();

    await settled;
    expect(readDatabaseLifecycle().leases).toBe(0);
  });

  it('cannot expand the query snapshot with other valid evidence returned by the AI layer', async () => {
    const fixture = createFixture();
    await fixture.runtime.confirmPrivacy();
    const local = await fixture.runtime.search(fixture.owner, fixture.input);
    fixture.addEvidence('outside-snapshot');
    const unrelated = fixture
      .readEvidence()
      .find((item) => item.location.annotationId === 'outside-snapshot');
    expect(unrelated).toBeDefined();
    fixture.runReadingJudgment.mockResolvedValueOnce({
      state: 'generated',
      output: {
        kind: 'reading-relations',
        relations: [
          { evidenceId: unrelated!.id, relation: 'same', explanation: 'Unrelated citation' },
        ],
      },
      evidence: [...local.evidence, unrelated!],
      inputTruncated: false,
      sentEvidenceCount: local.evidence.length,
    });

    const result = await fixture.judge();

    expect(result.evidence).toEqual(local.evidence);
    expect(result.judgment).toMatchObject({
      state: 'local',
      reason: 'failed',
      evidence: local.evidence,
    });
    expect(JSON.stringify(result)).not.toContain('outside-snapshot');
  });
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

  it('does not send when provider configuration changes while reading its key', async () => {
    const fixture = createFixture();
    await fixture.runtime.confirmPrivacy();
    await fixture.runtime.search(fixture.owner, fixture.input);
    fixture.hydrateProvider.mockImplementationOnce(async (provider) => {
      fixture.changeProvider('baseUrl');
      return { ...provider, apiKey: 'test-secret' };
    });

    const result = await fixture.judge();

    expect(result.providerChanged).toBe(true);
    expect(result.judgment).toMatchObject({
      state: 'local',
      reason: 'failed',
      sentEvidenceCount: 0,
    });
    expect(result).not.toHaveProperty('sentProvider');
    expect(result.evidence).toHaveLength(3);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('keeps the actual sending provider and counters when the target changes during the request', async () => {
    const fixture = createFixture();
    await fixture.runtime.confirmPrivacy();
    const local = await fixture.runtime.search(fixture.owner, fixture.input);
    fixture.runReadingJudgment.mockImplementationOnce(
      async (provider, _input, candidates, options) => {
        const current = await options.revalidateEvidence(candidates);
        await fixture.send(provider!, current, options.signal);
        return {
          state: 'generated',
          output: { kind: 'reading-relations', relations: [] },
          evidence: current,
          inputTruncated: true,
          sentEvidenceCount: current.length,
        };
      },
    );
    const pause = fixture.holdNetwork();
    const judging = fixture.judge();
    await pause.entered;
    fixture.changeProvider('modelName');
    pause.finish();

    const result = await judging;

    expect(fixture.send).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      providerChanged: true,
      provider: { modelName: 'replacement' },
      sentProvider: local.provider,
      judgment: { state: 'local', reason: 'failed', inputTruncated: true, sentEvidenceCount: 3 },
    });
    expect(result.evidence).toEqual(local.evidence);
  });

  it('retains actual send counters when final source validation removes deleted evidence', async () => {
    const fixture = createFixture();
    await fixture.runtime.confirmPrivacy();
    const local = await fixture.runtime.search(fixture.owner, fixture.input);
    fixture.runReadingJudgment.mockImplementationOnce(
      async (provider, _input, candidates, options) => {
        const current = await options.revalidateEvidence(candidates);
        await fixture.send(provider!, current, options.signal);
        fixture.deleteAnnotation('deleted');
        return {
          state: 'generated',
          output: { kind: 'reading-relations', relations: [] },
          evidence: current,
          inputTruncated: true,
          sentEvidenceCount: current.length,
        };
      },
    );

    const result = await fixture.judge();

    expect(fixture.send).toHaveBeenCalledOnce();
    expect(result.sentProvider).toEqual(local.provider);
    expect(result.judgment).toMatchObject({
      state: 'local',
      reason: 'failed',
      inputTruncated: true,
      sentEvidenceCount: 3,
    });
    expect(result.evidence).toHaveLength(2);
    expect(result.judgment.evidence).toEqual(result.evidence);
    expect(result.evidence.some((item) => item.location.annotationId === 'deleted')).toBe(false);
  });

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

  it('retains local results without a configured provider', async () => {
    const fixture = createFixture();
    getDatabase().delete(schema.providers).run();
    await fixture.runtime.confirmPrivacy();

    const local = await fixture.runtime.search(fixture.owner, fixture.input);
    const result = await fixture.judge();

    expect(local.provider).toBeNull();
    expect(result.judgment).toMatchObject({ state: 'local', reason: 'unconfigured' });
    expect(result.evidence).toEqual(local.evidence);
    expect(fixture.hydrateProvider).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
  });
});

describe('reading relations cancellation', () => {
  it.each(['cancel', 'destroy', 'cancelAll'] as const)(
    'aborts active remote work and drops its session on %s',
    async (action) => {
      const fixture = createFixture();
      await fixture.runtime.confirmPrivacy();
      await fixture.runtime.search(fixture.owner, fixture.input);
      const pause = fixture.holdNetwork();
      const judging = fixture.judge();
      const settled = expect(judging).rejects.toMatchObject({ name: 'AbortError' });
      const signal = await pause.entered;

      if (action === 'cancel') fixture.runtime.cancel(fixture.owner.id, fixture.input.requestId);
      if (action === 'destroy') fixture.owner.destroy();
      if (action === 'cancelAll') fixture.runtime.cancelAll();
      expect(signal?.aborted).toBe(true);
      pause.finish();

      await settled;
      expect(fixture.owner.listenerCount('destroyed')).toBe(0);
      await expect(fixture.judge()).rejects.toThrow('READING_MEMORY_SESSION_EXPIRED');
    },
  );

  it.each(['replacement', 'request-1'])(
    'keeps the replacement session when an older query finishes late: %s',
    async (requestId) => {
      const fixture = createFixture();
      const pending = deferred<ReadingMemoryEvidenceSearchResult>();
      const entered = deferred<AbortSignal | undefined>();
      fixture.search.mockImplementationOnce(async (_input, options) => {
        entered.resolve(options?.signal);
        return pending.promise;
      });
      const searching = fixture.runtime.search(fixture.owner, fixture.input);
      const settled = expect(searching).rejects.toMatchObject({ name: 'AbortError' });
      const signal = await entered.promise;
      const replacement = { ...fixture.input, requestId };

      const result = await fixture.runtime.search(fixture.owner, replacement);
      expect(signal?.aborted).toBe(true);
      pending.resolve(searchResult(fixture.evidence));

      await settled;
      expect(result.requestId).toBe(requestId);
      expect(fixture.owner.listenerCount('destroyed')).toBe(1);
      await fixture.runtime.confirmPrivacy();
      await expect(
        fixture.runtime.judge(fixture.owner.id, replacement.requestId),
      ).resolves.toMatchObject({
        requestId,
      });
    },
  );
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
