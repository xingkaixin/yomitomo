import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type {
  LlmProvider,
  ReadingEvidence,
  ReadingMemoryEvidenceSearchResult,
  ReadingReviewAssetRef,
} from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingReviewQueue } from '../../ipc/reading-memory-domain';

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
import { createReadingReviewRuntime } from './reading-review-runtime';
import { readReadingReviewAsset } from './reading-review-source';
import { appendReadingReview, readReadingReviewHistory } from './reading-review-store';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

type RunJudgment = (typeof import('@yomitomo/ai'))['runReadingJudgment'];
const formedAt = '2026-06-01T00:00:00.000Z';
const newerAt = '2026-08-01T00:00:00.000Z';
const oldJudgment = 'Private original judgment that must not be revealed early';
const blindAnswer = 'My private fresh answer must never enter the evidence comparison';
const asset: ReadingReviewAssetRef = {
  articleId: 'article-0',
  annotationId: 'annotation-0',
  assetType: 'comment',
  assetId: 'comment-0',
};
const runtimes: ReturnType<typeof createReadingReviewRuntime>[] = [];

beforeEach(async () => {
  closeDatabase();
  paths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-reading-review-test-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const runtime of runtimes.splice(0)) runtime.cancelAll();
  closeDatabase();
  await rm(paths.userData, { recursive: true, force: true });
});

describe('reading review blind session and local commits', () => {
  it('returns only blind source metadata and freezes the answer before revealing history', async () => {
    const fixture = createFixture();
    const session = await fixture.start();
    expect(JSON.stringify(session)).not.toContain(oldJudgment);
    expect(Object.keys(session).toSorted()).toEqual([
      'asset',
      'formedAt',
      'lastReviewedAt',
      'provider',
      'quote',
      'remoteConsentRequired',
      'requestId',
      'routeRevision',
      'source',
    ]);
    await expect(fixture.runtime.history(1, { requestId: 'request-1' })).rejects.toThrow(
      'READING_MEMORY_SESSION_EXPIRED',
    );
    const revealed = await fixture.reveal();
    expect(revealed).toMatchObject({
      answer: blindAnswer,
      currentJudgment: oldJudgment,
      baseJudgment: oldJudgment,
      history: { events: [], nextCursor: null },
      sourceTarget: { articleId: asset.articleId, annotationId: asset.annotationId },
    });
    await expect(
      fixture.runtime.reveal(1, { requestId: 'request-1', answer: 'a replacement answer' }),
    ).rejects.toThrow('READING_REVIEW_CONFLICT');
    expect(await fixture.reveal()).toMatchObject({ answer: blindAnswer });
    expect(fixture.getAiModule).not.toHaveBeenCalled();
    expect(fixture.hydrateProvider).not.toHaveBeenCalled();
  });

  it.each(['still_agree', 'changed', 'need_evidence'] as const)(
    'appends %s once using the frozen answer without mutating the base',
    async (decision) => {
      const fixture = createFixture();
      await fixture.start();
      await fixture.reveal();
      const result = await fixture.runtime.submit(1, {
        requestId: 'request-1',
        eventId: 'event-1',
        decision,
      });
      expect(result.event).toMatchObject({
        ...asset,
        decision,
        answer: blindAnswer,
        judgmentSnapshot: oldJudgment,
      });
      expect(
        await fixture.runtime.submit(1, { requestId: 'request-1', eventId: 'event-1', decision }),
      ).toEqual(result);
      expect(readReadingReviewHistory(getSqliteExecutor(), asset).events).toHaveLength(1);
      const current = readReadingReviewAsset(getSqliteExecutor(), asset)!;
      expect(current.base.content).toBe(oldJudgment);
      expect(current.current.content).toBe(decision === 'changed' ? blindAnswer : oldJudgment);
      expect(fixture.send).not.toHaveBeenCalled();
      expect(fixture.onReviewInserted).toHaveBeenCalledExactlyOnceWith(decision);
    },
  );

  it('allows an empty frozen answer only for need_evidence', async () => {
    const fixture = createFixture();
    await fixture.start();
    await fixture.runtime.reveal(1, { requestId: 'request-1', answer: '  ' });
    await expect(
      fixture.runtime.submit(1, {
        requestId: 'request-1',
        eventId: 'event-1',
        decision: 'still_agree',
      }),
    ).rejects.toThrow('READING_REVIEW_INVALID_ANSWER');
    expect(
      (
        await fixture.runtime.submit(1, {
          requestId: 'request-1',
          eventId: 'event-1',
          decision: 'need_evidence',
        })
      ).event.answer,
    ).toBe('');
  });

  it('preserves a lost successful response after a later edit but rejects a new stale write', async () => {
    const fixture = createFixture();
    await fixture.start();
    await fixture.reveal();
    const input = { requestId: 'request-1', eventId: 'event-1', decision: 'changed' as const };
    const committed = await fixture.runtime.submit(1, input);
    fixture.changeComment(0, 'direct edit after submission');
    expect(await fixture.runtime.submit(1, input)).toEqual(committed);
    await expect(fixture.runtime.submit(1, { ...input, eventId: 'event-2' })).rejects.toThrow(
      'READING_REVIEW_CONFLICT',
    );
    expect(readReadingReviewHistory(getSqliteExecutor(), asset).events).toHaveLength(1);
  });

  it('rejects foreign owners, changed source versions and a competing review head', async () => {
    const fixture = createFixture();
    await fixture.start();
    await expect(
      fixture.runtime.reveal(999, { requestId: 'request-1', answer: blindAnswer }),
    ).rejects.toThrow('READING_MEMORY_SESSION_EXPIRED');
    fixture.changeComment(0, 'changed source');
    await expect(fixture.reveal()).rejects.toThrow('READING_REVIEW_CONFLICT');
    await fixture.start();
    await fixture.reveal();
    fixture.appendOtherReview();
    await expect(
      fixture.runtime.submit(1, {
        requestId: 'request-1',
        eventId: 'new-review',
        decision: 'changed',
      }),
    ).rejects.toThrow('READING_REVIEW_CONFLICT');
  });
});

describe('reading review explicit evidence comparison', () => {
  it('does not let a late search cancel a replacement review that reused both request ids', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const session = await fixture.start();
    await fixture.reveal();
    const pause = fixture.holdSearch();
    const searching = fixture.searchEvidence(session.routeRevision);
    const canceled = expect(searching).rejects.toMatchObject({ name: 'AbortError' });
    await pause.entered;
    const replacement = await fixture.start();
    await fixture.reveal();
    await fixture.searchEvidence(replacement.routeRevision);
    pause.finish();
    await canceled;

    const current = await fixture.compare().then(
      (result) => result.judgment.state,
      (error: unknown) => (error instanceof Error ? error.message : 'failed'),
    );
    expect(current).toBe('generated');
  });

  it('rechecks candidate versions and deletion after local search and after remote work', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const session = await fixture.start();
    await fixture.reveal();
    const pause = fixture.holdSearch();
    const searching = fixture.searchEvidence(session.routeRevision);
    await pause.entered;
    fixture.changeComment(1, 'edited during local search');
    pause.finish();
    const local = await searching;
    expect(local.evidence.map((item) => item.location.commentId)).toEqual([
      'comment-2',
      'comment-3',
    ]);
    const network = fixture.holdNetwork();
    const comparing = fixture.compare();
    await network.entered;
    getDatabase().delete(schema.comments).where(eq(schema.comments.id, 'comment-2')).run();
    network.finish();
    const result = await comparing;
    expect(result.evidence.map((item) => item.location.commentId)).toEqual(['comment-3']);
    expect(result.judgment.sentEvidenceCount).toBe(2);
    expect(result.sentProvider).toEqual(session.provider);
  });

  it('uses the latest effective review time instead of the original formation time', async () => {
    const fixture = createFixture();
    fixture.appendOtherReview();
    const session = await fixture.start();
    await fixture.reveal();
    expect(session.lastReviewedAt).not.toBeNull();
    expect((await fixture.searchEvidence(session.routeRevision)).evidence).toEqual([]);
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('refuses reads and writes while the app is locked without losing the frozen answer', async () => {
    const fixture = createFixture();
    await fixture.start();
    await fixture.reveal();
    upsertSettings(getDatabase(), { appLockEnabled: true, appLockLocked: true });
    await expect(fixture.reveal()).rejects.toThrow('APP_LOCK_REQUIRED');
    await expect(
      fixture.runtime.submit(1, {
        requestId: 'request-1',
        eventId: 'event-1',
        decision: 'still_agree',
      }),
    ).rejects.toThrow('APP_LOCK_REQUIRED');
    expect(readReadingReviewHistory(getSqliteExecutor(), asset).events).toEqual([]);
  });

  it('retrieves only newer evidence outside the current thread, with a six-card cap and no remote work', async () => {
    const fixture = createFixture(9);
    const session = await fixture.start();
    await fixture.reveal();
    const local = await fixture.searchEvidence(session.routeRevision);
    expect(local.evidence).toHaveLength(6);
    expect(
      local.evidence.every(
        (item) =>
          item.location.annotationId !== asset.annotationId &&
          Date.parse(item.createdAt) > Date.parse(formedAt),
      ),
    ).toBe(true);
    expect(fixture.search).toHaveBeenCalledWith(
      { query: oldJudgment, scope: { kind: 'library' }, limit: 24 },
      { signal: expect.any(AbortSignal) },
    );
    expect(fixture.hydrateProvider).not.toHaveBeenCalled();
    expect(fixture.getAiModule).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('requires persistent consent and sends only the old effective judgment and source-backed evidence', async () => {
    const fixture = createFixture();
    const session = await fixture.start();
    await fixture.reveal();
    await fixture.searchEvidence(session.routeRevision);
    await expect(fixture.compare()).rejects.toThrow('READING_MEMORY_PRIVACY_CONFIRMATION_REQUIRED');
    fixture.allowRemote();
    const compared = await fixture.compare();
    expect(compared.judgment.state).toBe('generated');
    expect(fixture.runReadingJudgment.mock.calls[0][1]).toEqual({
      kind: 'evidence-comparison',
      judgment: oldJudgment,
    });
    expect(JSON.stringify(fixture.send.mock.calls)).not.toContain(blindAnswer);
    expect(JSON.stringify(fixture.logInfo.mock.calls)).not.toContain(oldJudgment);
    expect(readDatabaseLifecycle().leases).toBe(0);
  });

  it('never restores authorization for a changed comparison but allows a new explicit comparison id', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const session = await fixture.start();
    await fixture.reveal();
    fixture.setModel('replacement');
    const local = await fixture.searchEvidence(session.routeRevision);
    expect(local.providerChanged).toBe(true);
    fixture.setModel('model-1');
    expect((await fixture.compare()).judgment.sentEvidenceCount).toBe(0);
    expect(fixture.send).not.toHaveBeenCalled();
    await expect(fixture.searchEvidence(session.routeRevision)).rejects.toThrow(
      'READING_MEMORY_SESSION_EXPIRED',
    );
    await fixture.searchEvidence(session.routeRevision, 'comparison-2');
    fixture.runtime.cancel(1, 'request-1', 'comparison-1');
    expect((await fixture.compare('comparison-2')).judgment.state).toBe('generated');
  });

  it('keeps the actual send receipt when the provider changes during remote work', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const session = await fixture.start();
    await fixture.reveal();
    await fixture.searchEvidence(session.routeRevision);
    const pause = fixture.holdNetwork();
    const comparing = fixture.compare();
    await pause.entered;
    fixture.setModel('replacement');
    pause.finish();
    const result = await comparing;
    expect(result).toMatchObject({
      providerChanged: true,
      provider: { modelName: 'replacement' },
      sentProvider: session.provider,
      judgment: { state: 'local', sentEvidenceCount: 3, inputTruncated: true },
    });
    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it('cancels only the matching comparison while retaining the frozen review for submission', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const session = await fixture.start();
    await fixture.reveal();
    await fixture.searchEvidence(session.routeRevision);
    const pause = fixture.holdNetwork();
    const comparing = fixture.compare();
    const canceled = expect(comparing).rejects.toMatchObject({ name: 'AbortError' });
    const signal = await pause.entered;
    fixture.runtime.cancel(1, 'request-1', 'comparison-1');
    expect(signal?.aborted).toBe(true);
    pause.finish();
    await canceled;
    expect(
      (
        await fixture.runtime.submit(1, {
          requestId: 'request-1',
          eventId: 'event-1',
          decision: 'still_agree',
        })
      ).event.answer,
    ).toBe(blindAnswer);
  });

  it.each(['cancel', 'destroy', 'cancelAll'] as const)(
    'aborts and clears the review on %s',
    async (action) => {
      const fixture = createFixture();
      fixture.allowRemote();
      const session = await fixture.start();
      await fixture.reveal();
      await fixture.searchEvidence(session.routeRevision);
      const pause = fixture.holdNetwork();
      const comparing = fixture.compare();
      const canceled = expect(comparing).rejects.toMatchObject({ name: 'AbortError' });
      const signal = await pause.entered;
      if (action === 'cancel') fixture.runtime.cancel(1, 'request-1');
      if (action === 'destroy') fixture.owner.destroy();
      if (action === 'cancelAll') fixture.runtime.cancelAll();
      expect(signal?.aborted).toBe(true);
      pause.finish();
      await canceled;
      expect(fixture.owner.listenerCount('destroyed')).toBe(0);
      await expect(fixture.reveal()).rejects.toThrow('READING_MEMORY_SESSION_EXPIRED');
    },
  );

  it('does not hold a database lease across remote work and rejects a restored generation', async () => {
    const fixture = createFixture();
    fixture.allowRemote();
    const backup = join(paths.userData, 'review-backup.sqlite');
    await backupDatabaseFile(backup);
    const session = await fixture.start();
    await fixture.reveal();
    await fixture.searchEvidence(session.routeRevision);
    const pause = fixture.holdNetwork();
    const comparing = fixture.compare();
    const stale = expect(comparing).rejects.toThrow('READING_MEMORY_SESSION_EXPIRED');
    await pause.entered;
    expect(readDatabaseLifecycle().leases).toBe(0);
    await replaceDatabaseFile(backup);
    pause.finish();
    await stale;
  });
});

function createFixture(newerCount = 3) {
  const database = getDatabase();
  database
    .insert(schema.providers)
    .values({
      id: 'provider-1',
      name: 'Review provider',
      type: 'openai-chat',
      baseUrl: 'https://provider.example/v1',
      apiKey: '',
      apiKeyRef: 'provider:provider-1:apiKey',
      modelName: 'model-1',
      modelInputMode: 'custom',
      reasoningEffort: 'none',
      createdAt: formedAt,
      updatedAt: formedAt,
    })
    .run();
  upsertSettings(database, { defaultProviderId: 'provider-1', readingMemoryRemoteConsent: false });
  const annotationIds: string[] = [];
  for (let index = 0; index <= newerCount + 1; index += 1) {
    const id = String(index);
    const createdAt =
      index === 0 ? formedAt : index > newerCount ? '2026-01-01T00:00:00.000Z' : newerAt;
    database
      .insert(schema.articles)
      .values({
        id: `article-${id}`,
        url: `https://example.test/${id}`,
        canonicalUrl: `https://example.test/${id}`,
        sourceType: 'web',
        title: `Source ${id}`,
        contentHash: `hash-${id}`,
        createdAt,
        updatedAt: createdAt,
      })
      .run();
    database
      .insert(schema.annotations)
      .values({
        id: `annotation-${id}`,
        articleId: `article-${id}`,
        anchor: {
          exact: `Necessary source quote ${id}`,
          prefix: '',
          suffix: '',
          start: 0,
          end: 20,
        },
        author: 'user',
        color: '#123456',
        userId: 'reader',
        userUsername: 'reader',
        createdAt,
        updatedAt: createdAt,
      })
      .run();
    database
      .insert(schema.comments)
      .values({
        id: `comment-${id}`,
        annotationId: `annotation-${id}`,
        author: 'user',
        content: index === 0 ? oldJudgment : `New source-backed judgment ${id}`,
        assetRevision: `revision-${id}`,
        userId: 'reader',
        userUsername: 'reader',
        createdAt,
      })
      .run();
    annotationIds.push(`annotation-${id}`);
  }
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
  const evidence = materializeReadingEvidenceCandidates(executor, candidates, { kind: 'library' });
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
  const send = vi.fn<
    (provider: LlmProvider, evidence: ReadingEvidence[], signal?: AbortSignal) => Promise<void>
  >(async () => {});
  const runReadingJudgment = vi.fn<RunJudgment>(async (provider, _input, supplied, options) => {
    const current = await options.revalidateEvidence(supplied);
    options.signal?.throwIfAborted();
    if (!provider || current.length === 0)
      return {
        state: 'local',
        reason: provider ? 'no_evidence' : 'unconfigured',
        evidence: current,
        inputTruncated: false,
        sentEvidenceCount: 0,
      };
    await send(provider, current, options.signal);
    options.signal?.throwIfAborted();
    const fresh = await options.revalidateEvidence(current);
    return {
      state: 'generated',
      output: { kind: 'evidence-comparison', relations: [] },
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
  const readQueue = vi.fn(async (): Promise<ReadingReviewQueue> => ({
    ...status,
    items: [],
    mode: 'time',
    coverage: {
      eligibleAssetCount: 0,
      timeCandidateCount: 0,
      semanticCandidateCount: 0,
      recentEvidenceCount: 0,
    },
    semanticWindow: { candidateLimit: 64, evidenceLimit: 128, lookbackDays: 30 },
  }));
  const logInfo = vi.fn();
  const onReviewInserted = vi.fn();
  const runtime = createReadingReviewRuntime({
    semanticIndex: { search },
    readQueue,
    getAiModule,
    hydrateProvider,
    logInfo,
    onReviewInserted,
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
  }) as unknown as Parameters<typeof runtime.start>[0] & {
    destroy: () => void;
    listenerCount: EventEmitter['listenerCount'];
  };
  return {
    runtime,
    owner,
    search,
    send,
    runReadingJudgment,
    hydrateProvider,
    getAiModule,
    readQueue,
    logInfo,
    onReviewInserted,
    start: () => runtime.start(owner, { requestId: 'request-1', asset }),
    reveal: () => runtime.reveal(1, { requestId: 'request-1', answer: blindAnswer }),
    searchEvidence: (expectedRouteRevision: string, comparisonId = 'comparison-1') =>
      runtime.searchEvidence(1, { requestId: 'request-1', comparisonId, expectedRouteRevision }),
    compare: (comparisonId = 'comparison-1') =>
      runtime.compareEvidence(1, { requestId: 'request-1', comparisonId }),
    setModel: (modelName: string) =>
      getDatabase().update(schema.providers).set({ modelName }).run(),
    allowRemote: () => upsertSettings(getDatabase(), { readingMemoryRemoteConsent: true }),
    changeComment: (index: number, content: string) =>
      getDatabase()
        .update(schema.comments)
        .set({ content, assetRevision: 'changed-revision' })
        .where(eq(schema.comments.id, `comment-${index}`))
        .run(),
    appendOtherReview: () => {
      const current = readReadingReviewAsset(getSqliteExecutor(), asset)!;
      return appendReadingReview(getSqliteExecutor(), {
        id: 'competing-review',
        asset,
        assetVersion: current.base.assetVersion,
        judgmentDigest: createHash('sha256').update(current.current.content).digest('hex'),
        headReviewId: current.current.latestReview?.id ?? null,
        decision: 'still_agree',
        answer: 'other confirmation',
      });
    },
    holdNetwork: () => {
      const entered = deferred<AbortSignal | undefined>();
      const finished = deferred<void>();
      send.mockImplementationOnce(async (_provider, _evidence, signal) => {
        entered.resolve(signal);
        await finished.promise;
      });
      return { entered: entered.promise, finish: () => finished.resolve() };
    },
    holdSearch: () => {
      const entered = deferred<void>();
      const finished = deferred<void>();
      search.mockImplementationOnce(async () => {
        entered.resolve();
        await finished.promise;
        return found;
      });
      return { entered: entered.promise, finish: () => finished.resolve() };
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
