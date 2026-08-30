// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReadingEvidenceScope } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ReadingLibraryAnswerResult,
  ReadingLibraryContext,
  ReadingLibrarySession,
} from '../../../ipc-contract';
import type { YomitomoDesktopApi } from '../../../preload';
import { useReadingLibraryQuestion } from './use-reading-library-question';

type ReadingMemoryApi = YomitomoDesktopApi['readingMemory'];

const libraryScope: ReadingEvidenceScope = { kind: 'library' };
const api = {
  recordUsage: vi.fn<ReadingMemoryApi['recordUsage']>(),
  confirmPrivacy: vi.fn<ReadingMemoryApi['confirmPrivacy']>(),
  library: {
    context: vi.fn<ReadingMemoryApi['library']['context']>(),
    search: vi.fn<ReadingMemoryApi['library']['search']>(),
    answer: vi.fn<ReadingMemoryApi['library']['answer']>(),
    cancel: vi.fn<ReadingMemoryApi['library']['cancel']>(),
  },
} satisfies Pick<ReadingMemoryApi, 'confirmPrivacy' | 'library' | 'recordUsage'>;

beforeEach(() => {
  vi.resetAllMocks();
  api.recordUsage.mockResolvedValue(undefined);
  api.confirmPrivacy.mockResolvedValue(undefined);
  api.library.context.mockImplementation(async ({ scope }) => context(scope));
  api.library.search.mockImplementation(async ({ requestId, scope }) => session(requestId, scope));
  api.library.answer.mockImplementation(async ({ requestId }) => answered(session(requestId)));
  api.library.cancel.mockResolvedValue(undefined);
  vi.stubGlobal('yomitomoDesktop', { readingMemory: api });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReadingLibraryQuestion', () => {
  it('does not request context or evidence before a scope is selected', async () => {
    const { result } = renderHook(() => useReadingLibraryQuestion(null, 0));
    await act(() => result.current.ask('What have I learned?'));
    await act(() => result.current.answer());

    expect(result.current.contextState).toBeNull();
    expect(result.current.state).toBeNull();
    expect(api.library.context).not.toHaveBeenCalled();
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();
    expect(api.recordUsage).not.toHaveBeenCalled();
  });

  it('shows zero counts for an empty source selection without searching or falling back to the library', async () => {
    const scope: ReadingEvidenceScope = { kind: 'sources', sources: [] };
    api.library.context.mockResolvedValue(context(scope, { sourceCount: 0, judgmentCount: 0 }));
    const { result } = renderHook(() => useReadingLibraryQuestion(scope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));
    await act(() => result.current.answer());

    expect(result.current.contextState).toMatchObject({
      context: { scope, sourceCount: 0, judgmentCount: 0 },
    });
    expect(result.current.state).toBeNull();
    expect(api.library.context).toHaveBeenCalledExactlyOnceWith({ scope });
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();
  });

  it('requires a loaded destination and publishes local evidence before first privacy confirmation', async () => {
    const loading = deferred<ReadingLibraryContext>();
    api.library.context.mockReturnValueOnce(loading.promise);
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    expect(result.current.contextState).toMatchObject({ phase: 'loading' });
    await act(() => result.current.ask('Do not submit while loading'));
    expect(api.library.search).not.toHaveBeenCalled();
    await act(async () => loading.resolve(context()));
    expect(result.current.contextState).toMatchObject({ phase: 'ready' });
    await act(() => result.current.ask('   '));
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();

    await act(() => result.current.ask('  What have I learned?  '));
    expect(api.library.search).toHaveBeenCalledExactlyOnceWith({
      requestId: expect.any(String),
      question: 'What have I learned?',
      scope: libraryScope,
      expectedRouteRevision: context().routeRevision,
    });
    expect(result.current.state).toMatchObject({
      phase: 'ready',
      remote: 'privacy',
      result: { evidence: [{ id: 'evidence-1' }] },
    });
    expect(api.library.answer).not.toHaveBeenCalled();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    act(() => result.current.dismissPrivacy());
    expect(result.current.state).toMatchObject({ remote: 'idle' });
    await act(() => result.current.answer());
    expect(result.current.state).toMatchObject({ remote: 'privacy' });
    await act(() => result.current.answer(true));
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.library.answer).toHaveBeenCalledExactlyOnceWith({
      requestId: result.current.state?.request.requestId,
    });
    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: { judgment: { state: 'generated' } },
    });
    expect(api.recordUsage.mock.calls.filter(([key]) => key === 'query_completed')).toHaveLength(1);
  });

  it('retains local evidence while an authorized automatic answer is pending and ignores it after cancel', async () => {
    const answer = deferred<ReadingLibraryAnswerResult>();
    api.library.search.mockImplementation(async ({ requestId, scope }) => ({
      ...session(requestId, scope),
      remoteConsentRequired: false,
    }));
    api.library.answer.mockReturnValueOnce(answer.promise);
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    let asking!: Promise<void>;
    act(() => {
      asking = result.current.ask('What have I learned?');
    });
    await waitFor(() => expect(result.current.state).toMatchObject({ remote: 'answering' }));
    const local = result.current.state;
    const requestId = local!.request.requestId;
    expect(local).toMatchObject({ result: { evidence: [{ id: 'evidence-1' }] } });
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    act(() => result.current.cancel());
    const canceled = result.current.state;
    expect(canceled).toEqual({ ...local, remote: 'canceled' });
    expect(api.library.cancel).toHaveBeenCalledWith({ requestId });
    await act(async () => {
      answer.resolve(answered(session(requestId)));
      await asking;
    });
    expect(result.current.state).toBe(canceled);
    await act(() => result.current.answer());
    expect(api.library.answer).toHaveBeenCalledOnce();
    await act(() => result.current.ask('A newly authorized question'));
    expect(api.library.answer).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({
      request: { question: 'A newly authorized question' },
      result: { judgment: { state: 'generated' } },
    });
  });

  it.each(['scope', 'catalog'] as const)(
    'invalidates pending local evidence when the %s changes',
    async (change) => {
      const search = deferred<ReadingLibrarySession>();
      api.library.search.mockReturnValueOnce(search.promise);
      const { result, rerender } = renderHook<
        ReturnType<typeof useReadingLibraryQuestion>,
        { scope: ReadingEvidenceScope; catalogRevision: number }
      >(
        ({ scope, catalogRevision }: { scope: ReadingEvidenceScope; catalogRevision: number }) =>
          useReadingLibraryQuestion(scope, catalogRevision),
        { initialProps: { scope: libraryScope, catalogRevision: 0 } },
      );
      await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
      let asking!: Promise<void>;
      act(() => {
        asking = result.current.ask('Old question');
      });
      const requestId = result.current.state!.request.requestId;
      const scope: ReadingEvidenceScope =
        change === 'scope' ? { kind: 'collection', collectionId: 'next' } : libraryScope;
      rerender({ scope, catalogRevision: change === 'catalog' ? 1 : 0 });
      await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
      expect(result.current.state).toBeNull();
      expect(api.library.cancel).toHaveBeenCalledWith({ requestId });

      await act(async () => {
        search.resolve(session(requestId));
        await asking;
      });
      expect(result.current.state).toBeNull();
      expect(api.library.answer).not.toHaveBeenCalled();
      expect(result.current.contextState).toMatchObject({ context: { scope } });
    },
  );

  it('ignores an older search after a new explicitly authorized question', async () => {
    const search = deferred<ReadingLibrarySession>();
    api.library.search.mockReturnValueOnce(search.promise);
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    let oldAsk!: Promise<void>;
    act(() => {
      oldAsk = result.current.ask('Old question');
    });
    const oldRequestId = result.current.state!.request.requestId;
    await act(() => result.current.ask('New question'));
    const latest = result.current.state;
    expect(latest).toMatchObject({ request: { question: 'New question' }, remote: 'privacy' });
    expect(api.library.cancel).toHaveBeenCalledWith({ requestId: oldRequestId });

    await act(async () => {
      search.resolve(session(oldRequestId));
      await oldAsk;
    });
    expect(result.current.state).toBe(latest);
    expect(api.library.answer).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'unmount'] as const)(
    'does not send an answer after %s during privacy confirmation',
    async (action) => {
      const confirmation = deferred<void>();
      api.confirmPrivacy.mockReturnValueOnce(confirmation.promise);
      const { result, unmount } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
      await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
      await act(() => result.current.ask('What have I learned?'));
      let answering!: Promise<void>;
      act(() => {
        answering = result.current.answer(true);
      });
      const requestId = result.current.state!.request.requestId;
      if (action === 'cancel') act(() => result.current.cancel());
      else unmount();
      expect(api.library.cancel).toHaveBeenCalledWith({ requestId });

      await act(async () => {
        confirmation.resolve();
        await answering;
      });
      expect(api.library.answer).not.toHaveBeenCalled();
    },
  );

  it('retries a failed answer without repeating successfully saved privacy confirmation', async () => {
    api.library.answer.mockRejectedValueOnce(new Error('Answer unavailable'));
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));
    await act(() => result.current.answer(true));
    expect(result.current.state).toMatchObject({
      remote: 'failed',
      result: { remoteConsentRequired: false, evidence: [{ id: 'evidence-1' }] },
    });
    await act(() => result.current.answer());

    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.library.answer).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: { judgment: { state: 'generated' } },
    });
  });

  it('retains local evidence without counting a rejected expired answer as a provider failure', async () => {
    api.library.answer.mockRejectedValueOnce(new Error('READING_MEMORY_SESSION_EXPIRED'));
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));
    await act(() => result.current.answer(true));

    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.library.answer).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      remote: 'failed',
      result: { remoteConsentRequired: false, evidence: [{ id: 'evidence-1' }] },
    });
    expect(api.recordUsage).not.toHaveBeenCalledWith('fallback_call_failure');
  });

  it('counts a confirmed local failed judgment while keeping local evidence readable', async () => {
    api.library.answer.mockImplementationOnce(async ({ requestId }) => {
      const local = session(requestId);
      return {
        ...local,
        remoteConsentRequired: false,
        judgment: {
          state: 'local',
          reason: 'failed',
          evidence: local.evidence,
          sentEvidenceCount: 1,
          inputTruncated: false,
        },
      };
    });
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));
    await act(() => result.current.answer(true));

    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: {
        evidence: [{ id: 'evidence-1' }],
        judgment: { state: 'local', reason: 'failed' },
      },
    });
    expect(
      api.recordUsage.mock.calls.filter(([key]) => key === 'fallback_call_failure'),
    ).toHaveLength(1);
  });

  it('does not treat failed privacy persistence as consent', async () => {
    api.confirmPrivacy.mockRejectedValueOnce(new Error('Could not save consent'));
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));
    await act(() => result.current.answer(true));
    expect(result.current.state).toMatchObject({
      remote: 'failed',
      result: { remoteConsentRequired: true, evidence: [{ id: 'evidence-1' }] },
    });
    expect(api.library.answer).not.toHaveBeenCalled();
    await act(() => result.current.answer());
    expect(result.current.state).toMatchObject({ remote: 'privacy' });
  });

  it('requires a new question authorization after the provider changes during search', async () => {
    const next = context(libraryScope, {
      routeRevision: 'b'.repeat(64),
      provider: { id: 'next', name: 'Next provider', type: 'openai-chat', modelName: 'next-model' },
      remoteConsentRequired: false,
    });
    api.library.search.mockImplementationOnce(async ({ requestId }) => ({
      ...session(requestId),
      ...next,
      providerChanged: true,
    }));
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));
    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: { providerChanged: true },
    });
    expect(api.library.answer).not.toHaveBeenCalled();
    await act(() => result.current.answer(true));
    expect(api.library.answer).not.toHaveBeenCalled();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    api.library.context.mockResolvedValue(next);
    api.library.search.mockImplementationOnce(async ({ requestId }) => ({
      ...session(requestId),
      ...next,
    }));
    await act(() => result.current.ask('What have I learned?'));
    expect(api.library.search).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRouteRevision: next.routeRevision }),
    );
    expect(api.library.answer).toHaveBeenCalledOnce();
  });

  it('reloads a failed context without submitting and ignores a previous scope context', async () => {
    const oldContext = deferred<ReadingLibraryContext>();
    api.library.context.mockReturnValueOnce(oldContext.promise);
    api.library.context.mockRejectedValueOnce(new Error('Context unavailable'));
    const { result, rerender } = renderHook<
      ReturnType<typeof useReadingLibraryQuestion>,
      { scope: ReadingEvidenceScope }
    >(({ scope }: { scope: ReadingEvidenceScope }) => useReadingLibraryQuestion(scope, 0), {
      initialProps: { scope: libraryScope },
    });
    const nextScope: ReadingEvidenceScope = { kind: 'collection', collectionId: 'next' };
    rerender({ scope: nextScope });
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'failed' }));
    act(() => result.current.reloadContext());
    await waitFor(() =>
      expect(result.current.contextState).toMatchObject({
        phase: 'ready',
        context: { scope: nextScope },
      }),
    );
    const latest = result.current.contextState;
    await act(async () => oldContext.resolve(context()));

    expect(result.current.contextState).toBe(latest);
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();
  });

  it('keeps the actual send receipt but does not resend when the provider changes during an answer', async () => {
    api.library.search.mockImplementation(async ({ requestId, scope }) => ({
      ...session(requestId, scope),
      remoteConsentRequired: false,
    }));
    api.library.answer.mockImplementationOnce(async ({ requestId }) => {
      const local = session(requestId);
      return {
        ...local,
        remoteConsentRequired: false,
        provider: {
          id: 'next',
          name: 'Next provider',
          type: 'openai-chat',
          modelName: 'next-model',
        },
        routeRevision: 'b'.repeat(64),
        sentProvider: context().provider!,
        providerChanged: true,
        judgment: {
          state: 'local',
          reason: 'failed',
          evidence: local.evidence,
          sentEvidenceCount: 1,
          inputTruncated: false,
        },
      };
    });
    const { result } = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    await waitFor(() => expect(result.current.contextState).toMatchObject({ phase: 'ready' }));
    await act(() => result.current.ask('What have I learned?'));

    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: {
        providerChanged: true,
        provider: { id: 'next' },
        sentProvider: context().provider,
        judgment: { sentEvidenceCount: 1 },
      },
    });
    await act(() => result.current.answer(true));
    expect(api.library.answer).toHaveBeenCalledOnce();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
  });

  it('does not publish a late context or send a request after unmount', async () => {
    const oldContext = deferred<ReadingLibraryContext>();
    api.library.context.mockReturnValueOnce(oldContext.promise);
    const previous = renderHook(() => useReadingLibraryQuestion(libraryScope, 0));
    previous.unmount();
    const nextScope: ReadingEvidenceScope = { kind: 'collection', collectionId: 'next' };
    const current = renderHook(() => useReadingLibraryQuestion(nextScope, 0));
    await waitFor(() =>
      expect(current.result.current.contextState).toMatchObject({ phase: 'ready' }),
    );
    const latest = current.result.current.contextState;
    await act(async () => oldContext.resolve(context()));

    expect(current.result.current.contextState).toBe(latest);
    expect(current.result.current.contextState).toMatchObject({ context: { scope: nextScope } });
    expect(api.library.search).not.toHaveBeenCalled();
    expect(api.library.answer).not.toHaveBeenCalled();
  });
});

function context(
  scope: ReadingEvidenceScope = libraryScope,
  overrides: Partial<ReadingLibraryContext> = {},
): ReadingLibraryContext {
  return {
    scope,
    sourceCount: 4,
    judgmentCount: 2,
    provider: {
      id: 'provider',
      name: 'Test provider',
      type: 'openai-chat',
      modelName: 'test-model',
    },
    routeRevision: 'a'.repeat(64),
    remoteConsentRequired: true,
    projection: { state: 'available', coverage: { projectedAssetCount: 2, eligibleAssetCount: 3 } },
    semantic: {
      state: 'not_installed',
      modelVersion: 'embedding-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 3 },
      indexingPaused: false,
    },
    ...overrides,
  };
}

function session(requestId: string, scope = libraryScope): ReadingLibrarySession {
  return {
    ...context(scope),
    requestId,
    mode: 'keyword',
    evidence: [
      {
        id: 'evidence-1',
        assetType: 'annotation',
        role: 'judgment',
        authorKind: 'user',
        content: 'A local reading judgment',
        sourceVersion: 'source-1',
        source: {
          ref: { kind: 'article', id: 'source' },
          sourceType: 'web',
          title: 'Evidence source',
        },
        location: {
          annotationId: 'annotation',
          anchor: { exact: 'Source quote', prefix: '', suffix: '', start: 0, end: 12 },
        },
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
    ],
  };
}

function answered(local: ReadingLibrarySession): ReadingLibraryAnswerResult {
  return {
    ...local,
    remoteConsentRequired: false,
    judgment: {
      state: 'generated',
      output: {
        kind: 'library-answer',
        judgments: [{ text: 'A supported answer', evidenceIds: ['evidence-1'] }],
        supporting: [],
        opposingOrLimiting: [],
        gaps: [],
      },
      evidence: local.evidence,
      inputTruncated: false,
      sentEvidenceCount: local.evidence.length,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
