// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReadingReviewEvent } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readingReviewAnswerLimit,
  type ReadingReviewEvidenceResult,
  type ReadingReviewEvidenceSearchInput,
  type ReadingReviewEvidenceSession,
  type ReadingReviewQueue,
  type ReadingReviewQueueItem,
  type ReadingReviewRevealResult,
  type ReadingReviewSession,
  type ReadingReviewSubmitInput,
  type ReadingReviewSubmitResult,
} from '../../../ipc-contract';
import type { YomitomoDesktopApi } from '../../../preload';
import { useReadingReview } from './use-reading-review';

type ReadingMemoryApi = YomitomoDesktopApi['readingMemory'];
type ReviewApi = ReadingMemoryApi['review'];

const api = {
  recordUsage: vi.fn<ReadingMemoryApi['recordUsage']>(),
  confirmPrivacy: vi.fn<ReadingMemoryApi['confirmPrivacy']>(),
  review: {
    queue: vi.fn<ReviewApi['queue']>(),
    start: vi.fn<ReviewApi['start']>(),
    reveal: vi.fn<ReviewApi['reveal']>(),
    submit: vi.fn<ReviewApi['submit']>(),
    history: vi.fn<ReviewApi['history']>(),
    searchEvidence: vi.fn<ReviewApi['searchEvidence']>(),
    compareEvidence: vi.fn<ReviewApi['compareEvidence']>(),
    cancel: vi.fn<ReviewApi['cancel']>(),
  },
} satisfies Pick<ReadingMemoryApi, 'confirmPrivacy' | 'review' | 'recordUsage'>;

const item: ReadingReviewQueueItem = {
  asset: {
    articleId: 'article-1',
    annotationId: 'annotation-1',
    assetType: 'comment',
    assetId: 'comment-1',
  },
  source: { ref: { kind: 'article', id: 'article-1' }, sourceType: 'web', title: 'Learning' },
  quote: 'A source passage',
  formedAt: '2026-05-01T00:00:00.000Z',
  lastReviewedAt: null,
};
const nextItem: ReadingReviewQueueItem = {
  ...item,
  asset: { ...item.asset, assetType: 'distillation', assetId: 'distillation-1' },
};
const answer = 'My current position, written before revealing the old one';
let consentRequired = true;

beforeEach(() => {
  vi.resetAllMocks();
  api.recordUsage.mockResolvedValue(undefined);
  consentRequired = true;
  api.confirmPrivacy.mockImplementation(async () => {
    consentRequired = false;
  });
  api.review.queue.mockImplementation(async () => queue());
  api.review.start.mockImplementation(async ({ requestId, asset }) => ({
    ...session(requestId),
    asset,
  }));
  api.review.reveal.mockImplementation(async (input) => revealed(input.requestId, input.answer));
  api.review.submit.mockImplementation(async (input) => saved(input));
  api.review.history.mockResolvedValue({ events: [], nextCursor: null });
  api.review.searchEvidence.mockImplementation(async (input) => evidenceSession(input));
  api.review.compareEvidence.mockImplementation(async (input) => compared(input));
  api.review.cancel.mockResolvedValue(undefined);
  vi.stubGlobal('yomitomoDesktop', { readingMemory: api });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useReadingReview', () => {
  it('keeps queue and blind start local and requires the explicit need-evidence action for an empty answer', async () => {
    const loadingQueue = deferred<ReadingReviewQueue>();
    const starting = deferred<ReadingReviewSession>();
    api.review.queue.mockReturnValueOnce(loadingQueue.promise);
    api.review.start.mockReturnValueOnce(starting.promise);
    const { result } = renderHook(() => useReadingReview(0));
    expect(result.current.queue).toEqual({ status: 'loading' });
    expect(result.current.state).toEqual({ phase: 'queue' });
    await act(async () => loadingQueue.resolve(queue()));
    expect(result.current.items).toEqual([item, nextItem]);

    let start!: Promise<void>;
    act(() => {
      start = result.current.start(item);
    });
    expect(result.current.state).toEqual({ phase: 'blind', status: 'starting', item });
    await act(() => result.current.reveal(true));
    await act(() => result.current.compare());
    expect(api.review.reveal).not.toHaveBeenCalled();
    expect(api.review.searchEvidence).not.toHaveBeenCalled();
    const requestId = api.review.start.mock.calls[0][0].requestId;
    await act(async () => {
      starting.resolve(session(requestId));
      await start;
    });
    act(() => result.current.setAnswer('   '));
    await act(() => result.current.reveal());
    expect(api.review.reveal).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    expect(api.confirmPrivacy).not.toHaveBeenCalled();

    await act(() => result.current.reveal(true));
    expect(result.current.state).toMatchObject({ phase: 'revealed', result: { answer: '' } });
    act(() => result.current.setAnswer('An answer written after seeing the evidence'));
    expect(result.current.state).toMatchObject({ result: { answer: '' } });
    await act(() => result.current.submit('changed'));
    await act(() => result.current.submit('still_agree'));
    expect(api.review.submit).not.toHaveBeenCalled();
    await act(() => result.current.submit('need_evidence'));
    expect(result.current.state).toMatchObject({
      phase: 'done',
      event: { decision: 'need_evidence' },
    });
  });

  it('bounds the blind answer and freezes its trimmed value through reveal failure and retry', async () => {
    const revealing = deferred<ReadingReviewRevealResult>();
    api.review.reveal.mockReturnValueOnce(revealing.promise);
    const { result } = renderHook(() => useReadingReview(0));
    await act(() => result.current.start(item));
    act(() => result.current.setAnswer('x'.repeat(readingReviewAnswerLimit + 1)));
    expect(result.current.state).toMatchObject({ answer: 'x'.repeat(readingReviewAnswerLimit) });
    act(() => result.current.setAnswer(`  ${answer}  `));
    let reveal!: Promise<void>;
    act(() => {
      reveal = result.current.reveal();
    });
    expect(result.current.state).toMatchObject({ phase: 'blind', status: 'revealing', answer });
    act(() => result.current.setAnswer('Changed while revealing'));
    await act(async () => {
      revealing.reject(new Error('Reveal unavailable'));
      await reveal;
    });
    expect(result.current.state).toMatchObject({ status: 'reveal-failed', answer });
    act(() => result.current.setAnswer('Changed after reveal failure'));
    await act(() => result.current.reveal());
    expect(api.review.reveal.mock.calls[1][0]).toEqual(api.review.reveal.mock.calls[0][0]);
    expect(result.current.state).toMatchObject({ phase: 'revealed', result: { answer } });
    act(() => result.current.setAnswer('Changed after reveal success'));
    expect(result.current.state).toMatchObject({ result: { answer } });
  });

  it('requires a fresh blind session after a reveal conflict and preserves the frozen answer', async () => {
    api.review.reveal.mockRejectedValueOnce(new Error('READING_REVIEW_CONFLICT'));
    const { result } = renderHook(() => useReadingReview(0));
    await act(() => result.current.start(item));
    const originalRequestId = api.review.start.mock.calls[0][0].requestId;
    act(() => result.current.setAnswer(answer));
    await act(() => result.current.reveal());
    expect.soft(result.current.state).toMatchObject({ phase: 'blind', status: 'conflict', answer });
    act(() => result.current.setAnswer('Changed after the conflict'));
    expect(result.current.state).toMatchObject({ answer });
    await act(() => result.current.reveal());
    expect.soft(api.review.reveal).toHaveBeenCalledOnce();

    await act(() => result.current.start(item));
    expect(api.review.start.mock.calls[1][0].requestId).not.toBe(originalRequestId);
    expect(result.current.state).toMatchObject({ phase: 'blind', status: 'ready', answer: '' });
  });

  it('counts and removes an item only after server confirmation and keeps it excluded after queue reload', async () => {
    const saving = deferred<ReadingReviewSubmitResult>();
    api.review.submit.mockReturnValueOnce(saving.promise);
    const { result } = await startRevealed();
    let submit!: Promise<void>;
    act(() => {
      submit = result.current.submit('changed');
    });
    const input = api.review.submit.mock.calls[0][0];
    expect(result.current.state).toMatchObject({ phase: 'submitting', status: 'pending', input });
    expect(result.current.completedCount).toBe(0);
    expect(result.current.items).toEqual([item, nextItem]);
    await act(() => result.current.submit('still_agree'));
    expect(api.review.submit).toHaveBeenCalledOnce();
    await act(async () => {
      saving.resolve(saved(input));
      await submit;
    });
    expect(result.current.state).toMatchObject({ phase: 'done', event: { id: input.eventId } });
    expect(result.current.completedCount).toBe(1);
    expect(result.current.items).toEqual([nextItem]);
    act(() => result.current.cancel());
    await act(() => result.current.loadQueue());
    expect(result.current.state).toEqual({ phase: 'queue' });
    expect(result.current.items).toEqual([nextItem]);
    expect(result.current.completedCount).toBe(1);
  });

  it('retries ordinary save failures with the same event identity and decision', async () => {
    api.review.submit.mockRejectedValueOnce(new Error('Connection interrupted after save'));
    const { result } = await startRevealed();
    await act(() => result.current.submit('changed'));
    const input = api.review.submit.mock.calls[0][0];
    expect(result.current.state).toMatchObject({ phase: 'submitting', status: 'failed', input });
    expect(result.current.completedCount).toBe(0);
    expect(result.current.items).toContainEqual(item);
    await act(() => result.current.submit('still_agree'));
    expect(api.review.submit).toHaveBeenCalledOnce();
    await act(() => result.current.retrySubmit());
    expect(api.review.submit.mock.calls[1][0]).toEqual(input);
    expect(result.current.completedCount).toBe(1);
    expect(result.current.state).toMatchObject({ phase: 'done', event: { decision: 'changed' } });
  });

  it('requires a fresh blind session after a conflict instead of retrying a stale event', async () => {
    api.review.submit.mockRejectedValueOnce(new Error('READING_REVIEW_CONFLICT'));
    const { result } = await startRevealed();
    await act(() => result.current.submit('still_agree'));
    const staleInput = api.review.submit.mock.calls[0][0];
    expect(result.current.state).toMatchObject({ phase: 'submitting', status: 'conflict' });
    await act(() => result.current.retrySubmit());
    await act(() => result.current.submit('changed'));
    expect(api.review.submit).toHaveBeenCalledOnce();
    expect(result.current.completedCount).toBe(0);

    await act(() => result.current.start(item));
    expect(result.current.state).toMatchObject({ phase: 'blind', status: 'ready', answer: '' });
    act(() => result.current.setAnswer(answer));
    await act(() => result.current.reveal());
    await act(() => result.current.submit('changed'));
    const freshInput = api.review.submit.mock.calls[1][0];
    expect(freshInput.requestId).not.toBe(staleInput.requestId);
    expect(freshInput.eventId).not.toBe(staleInput.eventId);
    expect(result.current.completedCount).toBe(1);
  });

  it('reloads the catalog queue without discarding an active blind answer', async () => {
    const { result, rerender } = renderHook(({ revision }) => useReadingReview(revision), {
      initialProps: { revision: 0 },
    });
    await act(() => result.current.start(item));
    act(() => result.current.setAnswer(answer));
    const blind = result.current.state;
    api.review.queue.mockResolvedValueOnce(queue([nextItem]));
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current.items).toEqual([nextItem]));
    expect(result.current.state).toBe(blind);
    expect(api.review.cancel).not.toHaveBeenCalled();
    expect(api.review.reveal).not.toHaveBeenCalled();
    expect(api.review.searchEvidence).not.toHaveBeenCalled();
  });

  it('ignores a canceled start response instead of reopening the blind session', async () => {
    const starting = deferred<ReadingReviewSession>();
    api.review.start.mockReturnValueOnce(starting.promise);
    const { result } = renderHook(() => useReadingReview(0));
    let start!: Promise<void>;
    act(() => {
      start = result.current.start(item);
    });
    const requestId = api.review.start.mock.calls[0][0].requestId;
    act(() => result.current.cancel());
    expect(api.review.cancel).toHaveBeenCalledExactlyOnceWith({ requestId });
    await act(async () => {
      starting.resolve(session(requestId));
      await start;
    });
    expect(result.current.state).toEqual({ phase: 'queue' });
    expect(result.current.completedCount).toBe(0);
  });

  it('does not let an old reveal failure replace a new blind session', async () => {
    const revealing = deferred<ReadingReviewRevealResult>();
    api.review.reveal.mockReturnValueOnce(revealing.promise);
    const { result } = renderHook(() => useReadingReview(0));
    await act(() => result.current.start(item));
    act(() => result.current.setAnswer(answer));
    let reveal!: Promise<void>;
    act(() => {
      reveal = result.current.reveal();
    });
    const requestId = api.review.start.mock.calls[0][0].requestId;
    await act(() => result.current.start(nextItem));
    const latest = result.current.state;
    expect(api.review.cancel).toHaveBeenCalledWith({ requestId });
    await act(async () => {
      revealing.reject(new Error('The old source is no longer available'));
      await reveal;
    });
    expect(result.current.state).toBe(latest);
    expect(result.current.state).toMatchObject({
      phase: 'blind',
      status: 'ready',
      session: { asset: nextItem.asset },
      answer: '',
    });
  });

  it('does not count a late successful save after canceling the review', async () => {
    const saving = deferred<ReadingReviewSubmitResult>();
    api.review.submit.mockReturnValueOnce(saving.promise);
    const { result } = await startRevealed();
    let submit!: Promise<void>;
    act(() => {
      submit = result.current.submit('changed');
    });
    const input = api.review.submit.mock.calls[0][0];
    act(() => result.current.cancel());
    expect(api.review.cancel).toHaveBeenCalledWith({ requestId: input.requestId });
    await act(async () => {
      saving.resolve(saved(input));
      await submit;
    });
    expect(result.current.state).toEqual({ phase: 'queue' });
    expect(result.current.completedCount).toBe(0);
    expect(result.current.items).toContainEqual(item);
  });

  it('compares only after explicit action, publishes local evidence first, and never sends the blind answer in comparison IPC', async () => {
    const searching = deferred<ReadingReviewEvidenceSession>();
    api.review.searchEvidence.mockReturnValueOnce(searching.promise);
    const { result } = await startRevealed();
    expect(result.current.comparison).toBeNull();

    expect(api.recordUsage).not.toHaveBeenCalled();
    expect(api.review.searchEvidence).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    let compare!: Promise<void>;
    act(() => {
      compare = result.current.compare();
    });
    const first = api.review.searchEvidence.mock.calls[0][0];
    expect(first).toEqual({
      requestId: api.review.start.mock.calls[0][0].requestId,
      comparisonId: expect.any(String),
      expectedRouteRevision: 'route-a',
    });
    expect(result.current.comparison).toEqual({ phase: 'searching' });
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    await act(async () => {
      searching.resolve(evidenceSession(first));
      await compare;
    });
    expect(result.current.comparison).toMatchObject({
      phase: 'privacy',
      result: { evidence: [{ id: 'evidence-1' }] },
    });
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    act(() => result.current.dismissComparisonPrivacy());
    await act(() => result.current.confirmComparisonPrivacy());
    expect(api.confirmPrivacy).not.toHaveBeenCalled();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();

    await act(() => result.current.compare());
    const authorized = api.review.searchEvidence.mock.calls[1][0];
    expect(authorized.comparisonId).not.toBe(first.comparisonId);
    await act(() => result.current.confirmComparisonPrivacy());
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.review.compareEvidence).toHaveBeenCalledExactlyOnceWith({
      requestId: authorized.requestId,
      comparisonId: authorized.comparisonId,
    });
    expect(result.current.comparison).toMatchObject({
      phase: 'idle',
      result: { judgment: { state: 'generated' } },
    });
    expect(result.current.state).toMatchObject({ phase: 'revealed', result: { answer } });
    expect(result.current.completedCount).toBe(0);
  });

  it('cancels only the comparison and ignores its late result while keeping review submission available', async () => {
    consentRequired = false;
    const comparing = deferred<ReadingReviewEvidenceResult>();
    api.review.compareEvidence.mockReturnValueOnce(comparing.promise);
    const { result } = await startRevealed();
    let compare!: Promise<void>;
    act(() => {
      compare = result.current.compare();
    });
    await waitFor(() => expect(result.current.comparison?.phase).toBe('comparing'));
    const input = api.review.compareEvidence.mock.calls[0][0];
    act(() => result.current.cancelComparison());
    expect(api.review.cancel).toHaveBeenCalledExactlyOnceWith(input);
    expect(result.current.comparison).toMatchObject({ phase: 'canceled' });
    await act(() => result.current.submit('changed'));
    const completed = result.current.state;
    expect(completed.phase).toBe('done');
    await act(async () => {
      comparing.resolve(compared(input));
      await compare;
    });
    expect(result.current.state).toBe(completed);
    expect(result.current.comparison).toMatchObject({ phase: 'canceled' });
    expect(result.current.completedCount).toBe(1);
  });

  it('does not send or display evidence after its local comparison search is canceled', async () => {
    consentRequired = false;
    const searching = deferred<ReadingReviewEvidenceSession>();
    api.review.searchEvidence.mockReturnValueOnce(searching.promise);
    const { result } = await startRevealed();
    let compare!: Promise<void>;
    act(() => {
      compare = result.current.compare();
    });
    const input = api.review.searchEvidence.mock.calls[0][0];
    act(() => result.current.cancelComparison());
    expect(api.review.cancel).toHaveBeenCalledExactlyOnceWith({
      requestId: input.requestId,
      comparisonId: input.comparisonId,
    });
    await act(async () => {
      searching.resolve(evidenceSession(input));
      await compare;
    });
    expect(api.review.compareEvidence).not.toHaveBeenCalled();
    expect(result.current.comparison).toBeNull();
    expect(result.current.state).toMatchObject({ phase: 'revealed', result: { answer } });
  });

  it.each(['submit', 'unmount'] as const)(
    'does not send a comparison after %s while privacy confirmation is pending',
    async (action) => {
      const confirmation = deferred<void>();
      api.confirmPrivacy.mockReturnValueOnce(confirmation.promise);
      const { result, unmount } = await startRevealed();
      await act(() => result.current.compare());
      let confirm!: Promise<void>;
      act(() => {
        confirm = result.current.confirmComparisonPrivacy();
      });
      const search = api.review.searchEvidence.mock.calls[0][0];
      if (action === 'submit') await act(() => result.current.submit('still_agree'));
      else unmount();
      expect(api.review.cancel).toHaveBeenCalledWith(
        action === 'submit'
          ? { requestId: search.requestId, comparisonId: search.comparisonId }
          : { requestId: search.requestId },
      );
      await act(async () => {
        confirmation.resolve();
        await confirm;
      });
      expect(api.review.compareEvidence).not.toHaveBeenCalled();
      if (action === 'submit') {
        expect(result.current.state).toMatchObject({ phase: 'done' });
        expect(result.current.comparison).toMatchObject({ phase: 'canceled' });
        expect(result.current.completedCount).toBe(1);
      }
    },
  );

  it('requires a new explicit comparison identity after the provider route changes', async () => {
    consentRequired = false;
    api.review.searchEvidence.mockImplementationOnce(async (input) => ({
      ...evidenceSession(input),
      providerChanged: true,
      routeRevision: 'route-b',
      provider: { ...session(input.requestId).provider!, id: 'provider-b', modelName: 'model-b' },
    }));
    const { result } = await startRevealed();
    await act(() => result.current.compare());
    const first = api.review.searchEvidence.mock.calls[0][0];
    expect(result.current.comparison).toMatchObject({
      phase: 'idle',
      result: { providerChanged: true, routeRevision: 'route-b' },
    });
    await act(() => result.current.confirmComparisonPrivacy());
    expect(api.review.searchEvidence).toHaveBeenCalledOnce();
    expect(api.review.compareEvidence).not.toHaveBeenCalled();

    api.review.searchEvidence.mockImplementationOnce(async (input) => ({
      ...evidenceSession(input),
      routeRevision: 'route-b',
      provider: { ...session(input.requestId).provider!, id: 'provider-b', modelName: 'model-b' },
    }));
    await act(() => result.current.compare());
    const second = api.review.searchEvidence.mock.calls[1][0];
    expect(second.expectedRouteRevision).toBe('route-b');
    expect(second.comparisonId).not.toBe(first.comparisonId);
    expect(api.review.compareEvidence).toHaveBeenCalledExactlyOnceWith({
      requestId: second.requestId,
      comparisonId: second.comparisonId,
    });
  });

  it('retains successful privacy confirmation when the comparison RPC fails', async () => {
    api.review.compareEvidence.mockRejectedValueOnce(new Error('Provider unavailable'));
    const { result } = await startRevealed();
    await act(() => result.current.compare());
    await act(() => result.current.confirmComparisonPrivacy());
    expect(result.current.comparison).toMatchObject({
      phase: 'failed',
      result: { remoteConsentRequired: false, evidence: [{ id: 'evidence-1' }] },
    });
    expect(result.current.state).toMatchObject({ phase: 'revealed', result: { answer } });
    await act(() => result.current.compare());
    expect(api.confirmPrivacy).toHaveBeenCalledOnce();
    expect(api.review.compareEvidence).toHaveBeenCalledTimes(2);
    expect(result.current.comparison?.phase).toBe('idle');
  });

  it.each([
    ['READING_REVIEW_CONFLICT', new Error('READING_REVIEW_CONFLICT')],
    ['READING_MEMORY_SESSION_EXPIRED', new Error('READING_MEMORY_SESSION_EXPIRED')],
    ['AbortError', new DOMException('Canceled', 'AbortError')],
  ])('does not count a %s rejection as a remote call failure', async (_name, error) => {
    consentRequired = false;
    api.review.compareEvidence.mockRejectedValueOnce(error);
    const { result } = await startRevealed();
    await act(() => result.current.compare());

    expect(result.current.comparison).toMatchObject({
      phase: 'failed',
      result: { evidence: [{ id: 'evidence-1' }] },
    });
    expect(result.current.state).toMatchObject({ phase: 'revealed', result: { answer } });
    expect(api.recordUsage).not.toHaveBeenCalledWith('fallback_call_failure');
  });

  it('appends history pages without dropping old asset versions or duplicating existing events', async () => {
    const currentEvent = event('review-current');
    const oldEvent = { ...event('review-old'), assetVersion: 'asset-version-previous' };
    const cursor = { createdAt: currentEvent.createdAt, id: currentEvent.id };
    api.review.reveal.mockImplementationOnce(async (input) => ({
      ...revealed(input.requestId, input.answer),
      history: { events: [currentEvent], nextCursor: cursor },
    }));
    api.review.history.mockResolvedValueOnce({
      events: [currentEvent, oldEvent],
      nextCursor: null,
    });
    const { result } = await startRevealed();
    await act(() => result.current.loadHistory());
    expect(api.review.history).toHaveBeenCalledExactlyOnceWith({
      requestId: api.review.start.mock.calls[0][0].requestId,
      cursor,
    });
    expect(result.current.state).toMatchObject({
      phase: 'revealed',
      result: { answer, history: { events: [currentEvent, oldEvent], nextCursor: null } },
    });
    expect(result.current.historyStatus).toBe('idle');
    await act(() => result.current.loadHistory());
    expect(api.review.history).toHaveBeenCalledOnce();
  });
});

async function startRevealed() {
  const hook = renderHook(() => useReadingReview(0));
  await act(() => hook.result.current.start(item));
  act(() => hook.result.current.setAnswer(answer));
  await act(() => hook.result.current.reveal());
  return hook;
}

function queue(items = [item, nextItem]): ReadingReviewQueue {
  return {
    items,
    mode: 'time',
    projection: {
      state: 'available',
      coverage: { projectedAssetCount: 2, eligibleAssetCount: 2 },
    },
    semantic: {
      state: 'not_installed',
      modelVersion: 'local-v1',
      queryModelVersion: null,
      coverage: { indexedEntryCount: 0, eligibleEntryCount: 2 },
      indexingPaused: false,
    },
    coverage: {
      eligibleAssetCount: 2,
      timeCandidateCount: 2,
      semanticCandidateCount: 0,
      recentEvidenceCount: 0,
    },
    semanticWindow: { candidateLimit: 64, evidenceLimit: 128, lookbackDays: 30 },
  };
}

function session(requestId: string): ReadingReviewSession {
  return {
    ...item,
    requestId,
    provider: { id: 'provider-a', name: 'Provider A', type: 'openai-chat', modelName: 'model-a' },
    routeRevision: 'route-a',
    remoteConsentRequired: consentRequired,
  };
}

function revealed(requestId: string, currentAnswer = answer): ReadingReviewRevealResult {
  return {
    ...session(requestId),
    answer: currentAnswer,
    currentJudgment: 'My previous position',
    baseJudgment: 'My original position',
    history: { events: [], nextCursor: null },
    sourceTarget: { articleId: item.asset.articleId, annotationId: item.asset.annotationId },
  };
}

function event(id: string): ReadingReviewEvent {
  return {
    ...item.asset,
    id,
    assetVersion: 'asset-version-current',
    judgmentSnapshot: 'My previous position',
    judgmentDigest: 'judgment-digest',
    previousReviewId: null,
    decision: 'changed',
    answer,
    createdAt: '2026-08-30T00:00:00.000Z',
  };
}

function saved(input: ReadingReviewSubmitInput): ReadingReviewSubmitResult {
  return {
    requestId: input.requestId,
    event: { ...event(input.eventId), decision: input.decision },
  };
}

function evidenceSession(
  input: Pick<ReadingReviewEvidenceSearchInput, 'requestId' | 'comparisonId'>,
): ReadingReviewEvidenceSession {
  const { projection, semantic } = queue();
  const { provider, routeRevision, remoteConsentRequired } = session(input.requestId);
  return {
    requestId: input.requestId,
    comparisonId: input.comparisonId,
    provider,
    routeRevision,
    remoteConsentRequired,
    projection,
    semantic,
    mode: 'keyword',
    evidence: [
      {
        id: 'evidence-1',
        assetType: 'comment',
        role: 'judgment',
        authorKind: 'user',
        content: 'Related evidence',
        sourceVersion: 'source-v1',
        source: item.source,
        location: {
          annotationId: item.asset.annotationId,
          commentId: item.asset.assetId,
          anchor: { exact: item.quote, prefix: '', suffix: '', start: 0, end: item.quote.length },
        },
        createdAt: item.formedAt,
        updatedAt: item.formedAt,
      },
    ],
  };
}

function compared(
  input: Pick<ReadingReviewEvidenceSearchInput, 'requestId' | 'comparisonId'>,
): ReadingReviewEvidenceResult {
  const local = evidenceSession(input);
  return {
    ...local,
    judgment: {
      state: 'generated',
      output: {
        kind: 'evidence-comparison',
        relations: [
          { evidenceId: 'evidence-1', relation: 'complementary', explanation: 'Adds a condition' },
        ],
      },
      evidence: local.evidence,
      inputTruncated: false,
      sentEvidenceCount: 1,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
