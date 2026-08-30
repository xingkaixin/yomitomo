// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReaderQuestionContext } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingRelationsJudgeResult, ReadingRelationsSession } from '../../../ipc-contract';
import type { YomitomoDesktopApi } from '../../../preload';
import { useReadingRelations } from './use-reading-relations';

type ReadingMemoryApi = YomitomoDesktopApi['readingMemory'];

const api = {
  recordUsage: vi.fn<ReadingMemoryApi['recordUsage']>(),
  confirmPrivacy: vi.fn<ReadingMemoryApi['confirmPrivacy']>(),
  relations: {
    search: vi.fn<ReadingMemoryApi['relations']['search']>(),
    judge: vi.fn<ReadingMemoryApi['relations']['judge']>(),
    cancel: vi.fn<ReadingMemoryApi['relations']['cancel']>(),
  },
} satisfies Pick<ReadingMemoryApi, 'confirmPrivacy' | 'relations' | 'recordUsage'>;

const context: ReaderQuestionContext = { sourceType: 'web', quote: 'Selected reading text' };

beforeEach(() => {
  vi.resetAllMocks();
  api.recordUsage.mockResolvedValue(undefined);
  api.confirmPrivacy.mockResolvedValue(undefined);
  api.relations.cancel.mockResolvedValue(undefined);
  api.relations.search.mockImplementation(async ({ requestId }) => session(requestId));
  api.relations.judge.mockImplementation(async ({ requestId }) => judged(session(requestId)));
  vi.stubGlobal('yomitomoDesktop', { readingMemory: api });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReadingRelations', () => {
  it('keeps mount and search local until explicit disclosure confirmation', async () => {
    const { result } = renderHook(() => useReadingRelations('article-current'));
    expect(result.current.state).toBeNull();
    expect(api.relations.search).not.toHaveBeenCalled();
    expect(api.relations.judge).not.toHaveBeenCalled();

    expect(api.recordUsage).not.toHaveBeenCalled();

    await act(() => result.current.search(context, '  What connects these ideas?  '));
    expect(api.relations.search).toHaveBeenCalledWith({
      requestId: expect.any(String),
      articleId: 'article-current',
      context,
      question: 'What connects these ideas?',
    });
    const localState = result.current.state;
    expect(localState).toMatchObject({ phase: 'ready', remote: 'idle' });
    expect(api.relations.judge).not.toHaveBeenCalled();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    await act(() => result.current.judge());
    expect(result.current.state).toMatchObject({ phase: 'ready', remote: 'privacy' });
    expect(api.relations.judge).not.toHaveBeenCalled();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    act(() => result.current.dismissPrivacy());
    expect(result.current.state).toEqual(localState);
    expect(api.relations.judge).not.toHaveBeenCalled();

    await act(() => result.current.judge());
    await act(() => result.current.judge(true));
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.relations.judge).toHaveBeenCalledExactlyOnceWith({
      requestId: localState?.request.requestId,
    });
    expect(result.current.state).toMatchObject({
      phase: 'ready',
      remote: 'idle',
      result: { judgment: { state: 'generated' } },
    });
    expect(api.recordUsage.mock.calls.filter(([key]) => key === 'query_completed')).toHaveLength(1);
  });

  it('counts one panel opening across refinements and another after closing and reopening', async () => {
    const { result } = renderHook(() => useReadingRelations('article-current'));
    await act(() => result.current.search(context));
    await act(() => result.current.search(context, 'Refined question'));
    const afterRefinement = api.recordUsage.mock.calls.map(([key]) => key);
    act(() => result.current.close());
    await act(() => result.current.search(context));
    const afterReopening = api.recordUsage.mock.calls.map(([key]) => key);

    expect(afterRefinement.filter((key) => key === 'feature_opened')).toHaveLength(1);
    expect(afterRefinement.filter((key) => key === 'query_completed')).toHaveLength(2);
    expect(afterReopening.filter((key) => key === 'feature_opened')).toHaveLength(2);
    expect(afterReopening.filter((key) => key === 'query_completed')).toHaveLength(3);
  });

  it('does not count an aborted judgment as a remote call failure', async () => {
    api.relations.search.mockImplementation(async ({ requestId }) =>
      session(requestId, { remoteConsentRequired: false }),
    );
    api.relations.judge.mockRejectedValueOnce(new DOMException('Canceled', 'AbortError'));
    const { result } = renderHook(() => useReadingRelations('article-current'));
    await act(() => result.current.search(context));
    const local = result.current.state;
    await act(() => result.current.judge());

    expect(result.current.state).toEqual({ ...local, remote: 'failed' });
    expect(api.recordUsage).not.toHaveBeenCalledWith('fallback_call_failure');
  });

  it.each(['close', 'unmount'] as const)(
    'does not judge after %s while disclosure confirmation is pending',
    async (action) => {
      const confirmation = deferred<void>();
      api.confirmPrivacy.mockReturnValue(confirmation.promise);
      const { result, unmount } = renderHook(() => useReadingRelations('article-current'));
      await act(() => result.current.search(context));
      await act(() => result.current.judge());
      const requestId = result.current.state?.request.requestId;
      let judgment!: Promise<void>;
      act(() => {
        judgment = result.current.judge(true);
      });
      expect(result.current.state).toMatchObject({ remote: 'judging' });

      if (action === 'close') act(() => result.current.close());
      else unmount();
      expect(api.relations.cancel).toHaveBeenCalledExactlyOnceWith({ requestId });

      await act(async () => {
        confirmation.resolve();
        await judgment;
      });
      expect(api.relations.judge).not.toHaveBeenCalled();
      if (action === 'close') expect(result.current.state).toBeNull();
    },
  );

  it('cancels an older query and ignores its late search result', async () => {
    const oldSearch = deferred<ReadingRelationsSession>();
    api.relations.search.mockReturnValueOnce(oldSearch.promise);
    const { result } = renderHook(() => useReadingRelations('article-current'));
    let firstSearch!: Promise<void>;
    act(() => {
      firstSearch = result.current.search(context, 'First question');
    });
    const oldRequestId = result.current.state?.request.requestId;
    expect(oldRequestId).toBeDefined();

    await act(() => result.current.search(context, 'New question'));
    const latest = result.current.state;
    expect(latest).toMatchObject({
      phase: 'ready',
      request: { question: 'New question' },
    });
    expect(api.relations.cancel).toHaveBeenCalledExactlyOnceWith({ requestId: oldRequestId });

    await act(async () => {
      oldSearch.resolve(session(oldRequestId!));
      await firstSearch;
    });
    expect(result.current.state).toBe(latest);
    expect(api.relations.judge).not.toHaveBeenCalled();
    expect(api.recordUsage.mock.calls.filter(([key]) => key === 'query_completed')).toHaveLength(1);
  });

  it.each(['new-query', 'article-change'] as const)(
    'cancels active judgment on %s and ignores its late result',
    async (action) => {
      const oldJudgment = deferred<ReadingRelationsJudgeResult>();
      api.relations.search.mockImplementation(async ({ requestId }) =>
        session(requestId, { remoteConsentRequired: false }),
      );
      api.relations.judge.mockReturnValueOnce(oldJudgment.promise);
      const { result, rerender } = renderHook(({ articleId }) => useReadingRelations(articleId), {
        initialProps: { articleId: 'article-current' },
      });
      await act(() => result.current.search(context));
      const oldRequestId = result.current.state?.request.requestId;
      expect(oldRequestId).toBeDefined();
      let firstJudgment!: Promise<void>;
      act(() => {
        firstJudgment = result.current.judge();
      });
      expect(result.current.state).toMatchObject({ remote: 'judging' });

      if (action === 'article-change') {
        rerender({ articleId: 'article-next' });
        expect(result.current.state).toBeNull();
      }
      await act(() => result.current.search(context, 'New question'));
      const latest = result.current.state;
      expect(api.relations.cancel).toHaveBeenCalledExactlyOnceWith({ requestId: oldRequestId });

      await act(async () => {
        oldJudgment.resolve(judged(session(oldRequestId!)));
        await firstJudgment;
      });
      expect(result.current.state).toBe(latest);
      expect(api.relations.judge).toHaveBeenCalledOnce();
    },
  );

  it('keeps local evidence after a failed judgment and allows an explicit retry', async () => {
    api.relations.search.mockImplementation(async ({ requestId }) =>
      session(requestId, { remoteConsentRequired: false }),
    );
    api.relations.judge.mockRejectedValueOnce(new Error('Remote provider unavailable'));
    const { result } = renderHook(() => useReadingRelations('article-current'));
    await act(() => result.current.search(context));
    const local = result.current.state;
    await act(() => result.current.judge());

    expect(result.current.state).toEqual({ ...local, remote: 'failed' });
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
    await act(() => result.current.judge());
    expect(api.relations.judge).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: { judgment: { state: 'generated' } },
    });
  });

  it('retains local evidence and provider-change information when the backend refuses judgment', async () => {
    api.relations.search.mockImplementation(async ({ requestId }) =>
      session(requestId, { remoteConsentRequired: false }),
    );
    api.relations.judge.mockImplementationOnce(async ({ requestId }) => {
      const local = session(requestId, { remoteConsentRequired: false });
      return {
        ...local,
        providerChanged: true,
        judgment: {
          state: 'local',
          reason: 'unconfigured',
          evidence: local.evidence,
          inputTruncated: false,
          sentEvidenceCount: 0,
        },
      };
    });
    const { result } = renderHook(() => useReadingRelations('article-current'));
    await act(() => result.current.search(context));
    await act(() => result.current.judge());
    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: {
        providerChanged: true,
        judgment: { state: 'local', evidence: [{ id: 'evidence-1' }] },
      },
    });

    await act(() => result.current.judge());
    expect(api.relations.judge).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({
      result: { judgment: { state: 'generated' } },
    });
  });

  it('does not judge if confirmation persistence fails, and retains local evidence for retry', async () => {
    api.confirmPrivacy.mockRejectedValueOnce(new Error('Could not save consent'));
    const { result } = renderHook(() => useReadingRelations('article-current'));
    await act(() => result.current.search(context));
    const local = result.current.state;
    await act(() => result.current.judge());
    await act(() => result.current.judge(true));
    expect(result.current.state).toEqual({ ...local, remote: 'failed' });
    expect(api.relations.judge).not.toHaveBeenCalled();

    await act(() => result.current.judge());
    expect(result.current.state).toMatchObject({ remote: 'privacy' });
    await act(() => result.current.judge(true));
    expect(api.confirmPrivacy).toHaveBeenCalledTimes(2);
    expect(api.relations.judge).toHaveBeenCalledOnce();
  });

  it('does not repeat saved disclosure when retrying a failed first judgment', async () => {
    api.relations.judge.mockRejectedValueOnce(new Error('Remote provider unavailable'));
    const { result } = renderHook(() => useReadingRelations('article-current'));
    await act(() => result.current.search(context));
    await act(() => result.current.judge());
    await act(() => result.current.judge(true));
    expect(result.current.state).toMatchObject({ remote: 'failed' });
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();

    await act(() => result.current.judge());

    expect(api.relations.judge).toHaveBeenCalledTimes(2);
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      remote: 'idle',
      result: { judgment: { state: 'generated' } },
    });
  });
});

function session(
  requestId: string,
  overrides: Partial<ReadingRelationsSession> = {},
): ReadingRelationsSession {
  return {
    requestId,
    mode: 'keyword',
    remoteConsentRequired: true,
    provider: {
      id: 'provider-1',
      name: 'Test provider',
      type: 'openai-chat',
      modelName: 'test-model',
    },
    projection: { state: 'available', coverage: { projectedAssetCount: 1, eligibleAssetCount: 1 } },
    semantic: {
      state: 'not_installed',
      modelVersion: 'embedding-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 1 },
      indexingPaused: false,
    },
    evidence: [
      {
        id: 'evidence-1',
        assetType: 'annotation',
        role: 'judgment',
        authorKind: 'user',
        content: 'A local reading judgment',
        sourceVersion: 'source-1',
        source: {
          ref: { kind: 'article', id: 'article-evidence' },
          sourceType: 'web',
          title: 'Evidence source',
        },
        location: {
          annotationId: 'annotation-1',
          anchor: { exact: 'Source quote', prefix: '', suffix: '', start: 0, end: 12 },
        },
        createdAt: '2026-08-30T00:00:00.000Z',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function judged(local: ReadingRelationsSession): ReadingRelationsJudgeResult {
  return {
    ...local,
    remoteConsentRequired: false,
    judgment: {
      state: 'generated',
      output: {
        kind: 'reading-relations',
        relations: [
          { evidenceId: 'evidence-1', relation: 'same', explanation: 'The ideas agree.' },
        ],
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
