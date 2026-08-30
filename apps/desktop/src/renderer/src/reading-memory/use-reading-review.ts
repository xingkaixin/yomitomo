import { useEffect, useRef, useState } from 'react';
import {
  makeId,
  type ReadingReviewAssetRef,
  type ReadingReviewDecision,
  type ReadingReviewEvent,
} from '@yomitomo/shared';
import {
  readingReviewAnswerLimit,
  type ReadingReviewEvidenceResult,
  type ReadingReviewEvidenceSearchInput,
  type ReadingReviewEvidenceSession,
  type ReadingReviewQueue,
  type ReadingReviewQueueItem,
  type ReadingReviewRevealResult,
  type ReadingReviewSession,
  type ReadingReviewStartInput,
  type ReadingReviewSubmitInput,
} from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';

export type ReadingReviewComparisonState =
  | { phase: 'searching' | 'search-failed' }
  | {
      phase: 'idle' | 'privacy' | 'comparing' | 'failed' | 'canceled';
      result: ReadingReviewEvidenceSession | ReadingReviewEvidenceResult;
    };

export type ReadingReviewState =
  | { phase: 'queue' }
  | { phase: 'blind'; status: 'starting' | 'start-failed'; item: ReadingReviewQueueItem }
  | {
      phase: 'blind';
      status: 'ready' | 'revealing' | 'reveal-failed' | 'conflict';
      session: ReadingReviewSession;
      answer: string;
    }
  | { phase: 'revealed'; result: ReadingReviewRevealResult }
  | {
      phase: 'submitting';
      status: 'pending' | 'failed' | 'conflict';
      result: ReadingReviewRevealResult;
      input: ReadingReviewSubmitInput;
    }
  | { phase: 'done'; result: ReadingReviewRevealResult; event: ReadingReviewEvent };

type QueueState =
  | { status: 'loading' | 'failed' }
  | { status: 'ready'; result: ReadingReviewQueue };

export function useReadingReview(catalogRevision: unknown) {
  const [queue, setQueue] = useState<QueueState>({ status: 'loading' });
  const [state, setState] = useState<ReadingReviewState>({ phase: 'queue' });
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [comparison, setComparison] = useState<ReadingReviewComparisonState | null>(null);
  const mounted = useRef(false);
  const queueRequest = useRef<object | null>(null);
  const activeRequest = useRef<ReadingReviewStartInput | null>(null);
  const activeComparison = useRef<ReadingReviewEvidenceSearchInput | null>(null);
  const activeSubmission = useRef<ReadingReviewSubmitInput | null>(null);
  const activeHistory = useRef<object | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueRequest.current = null;
      endRequest();
    };
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [catalogRevision]);

  function isCurrent(request: ReadingReviewStartInput) {
    return mounted.current && activeRequest.current === request;
  }

  function endRequest() {
    const request = activeRequest.current;
    activeRequest.current = null;
    activeComparison.current = null;
    activeSubmission.current = null;
    activeHistory.current = null;
    if (request) cancelRequest({ requestId: request.requestId });
  }

  async function loadQueue() {
    const request = {};
    queueRequest.current = request;
    setQueue({ status: 'loading' });
    try {
      const result = await getDesktopApi().readingMemory.review.queue();
      if (mounted.current && queueRequest.current === request)
        setQueue({ status: 'ready', result });
    } catch {
      if (mounted.current && queueRequest.current === request) setQueue({ status: 'failed' });
    }
  }

  async function start(item: ReadingReviewQueueItem) {
    endRequest();
    const request = { requestId: makeId('reading_review'), asset: item.asset };
    activeRequest.current = request;
    setHistoryStatus('idle');
    setComparison(null);
    setState({ phase: 'blind', status: 'starting', item });
    try {
      const session = await getDesktopApi().readingMemory.review.start(request);
      if (isCurrent(request)) setState({ phase: 'blind', status: 'ready', session, answer: '' });
    } catch {
      if (isCurrent(request)) setState({ phase: 'blind', status: 'start-failed', item });
    }
  }

  function setAnswer(answer: string) {
    setState((current) =>
      current.phase === 'blind' && current.status === 'ready'
        ? { ...current, answer: answer.slice(0, readingReviewAnswerLimit) }
        : current,
    );
  }

  async function reveal(needEvidence = false) {
    if (state.phase !== 'blind' || (state.status !== 'ready' && state.status !== 'reveal-failed'))
      return;
    const request = activeRequest.current;
    if (!request || !isCurrent(request)) return;
    const answer = state.answer.trim();
    if (!answer && !needEvidence && state.status !== 'reveal-failed') return;
    setState({ ...state, answer, status: 'revealing' });
    try {
      const result = await getDesktopApi().readingMemory.review.reveal({
        requestId: request.requestId,
        answer,
      });
      if (isCurrent(request)) setState({ phase: 'revealed', result });
    } catch (error) {
      if (isCurrent(request))
        setState({
          ...state,
          answer,
          status: isReviewConflict(error) ? 'conflict' : 'reveal-failed',
        });
    }
  }

  function cancelComparison() {
    const request = activeComparison.current;
    activeComparison.current = null;
    if (request)
      cancelRequest({ requestId: request.requestId, comparisonId: request.comparisonId });
    setComparison((current) =>
      current && 'result' in current ? { phase: 'canceled', result: current.result } : null,
    );
  }

  async function submit(decision: ReadingReviewDecision) {
    if (state.phase !== 'revealed' || activeSubmission.current) return;
    if (decision !== 'need_evidence' && !state.result.answer.trim()) return;
    const request = activeRequest.current;
    if (!request || !isCurrent(request)) return;
    cancelComparison();
    await save(request, state.result, {
      requestId: request.requestId,
      eventId: makeId('reading_review_event'),
      decision,
    });
  }

  async function save(
    request: ReadingReviewStartInput,
    result: ReadingReviewRevealResult,
    input: ReadingReviewSubmitInput,
  ) {
    if (activeSubmission.current) return;
    activeSubmission.current = input;
    setState({ phase: 'submitting', status: 'pending', result, input });
    try {
      const saved = await getDesktopApi().readingMemory.review.submit(input);
      if (!isCurrent(request) || activeSubmission.current !== input) return;
      setCompleted((current) => new Set(current).add(assetKey(request.asset)));
      setState({ phase: 'done', result, event: saved.event });
    } catch (error) {
      if (isCurrent(request) && activeSubmission.current === input) {
        const status = isReviewConflict(error) ? 'conflict' : 'failed';
        setState({ phase: 'submitting', status, result, input });
      }
    } finally {
      if (activeSubmission.current === input) activeSubmission.current = null;
    }
  }

  async function retrySubmit() {
    if (state.phase !== 'submitting' || state.status !== 'failed') return;
    const request = activeRequest.current;
    if (request && isCurrent(request)) await save(request, state.result, state.input);
  }

  function cancel() {
    endRequest();
    setComparison(null);
    setHistoryStatus('idle');
    setState({ phase: 'queue' });
  }

  async function loadHistory() {
    if (state.phase !== 'revealed' || activeHistory.current || !state.result.history.nextCursor)
      return;
    const request = activeRequest.current;
    if (!request || !isCurrent(request)) return;
    const operation = {};
    activeHistory.current = operation;
    setHistoryStatus('loading');
    try {
      const page = await getDesktopApi().readingMemory.review.history({
        requestId: request.requestId,
        cursor: state.result.history.nextCursor,
      });
      if (!isCurrent(request) || activeHistory.current !== operation) return;
      setState((current) => {
        if (!('result' in current)) return current;
        const seen = new Set(current.result.history.events.map((event) => event.id));
        return {
          ...current,
          result: {
            ...current.result,
            history: {
              events: [
                ...current.result.history.events,
                ...page.events.filter((event) => !seen.has(event.id)),
              ],
              nextCursor: page.nextCursor,
            },
          },
        };
      });
      setHistoryStatus('idle');
    } catch {
      if (isCurrent(request) && activeHistory.current === operation) setHistoryStatus('failed');
    } finally {
      if (activeHistory.current === operation) activeHistory.current = null;
    }
  }

  function isCurrentComparison(
    request: ReadingReviewStartInput,
    search: ReadingReviewEvidenceSearchInput,
  ) {
    return isCurrent(request) && activeComparison.current === search;
  }

  async function compare() {
    if (state.phase !== 'revealed') return;
    const request = activeRequest.current;
    if (!request || !isCurrent(request)) return;
    const previous = comparison && 'result' in comparison ? comparison.result : state.result;
    cancelComparison();
    const search = {
      requestId: request.requestId,
      comparisonId: makeId('reading_review_compare'),
      expectedRouteRevision: previous.routeRevision,
    };
    activeComparison.current = search;
    setComparison({ phase: 'searching' });
    try {
      const result = await getDesktopApi().readingMemory.review.searchEvidence(search);
      if (!isCurrentComparison(request, search)) return;
      setComparison({ phase: 'idle', result });
      await compareRemote(request, search, result, false);
    } catch {
      if (isCurrentComparison(request, search)) setComparison({ phase: 'search-failed' });
    }
  }

  async function compareRemote(
    request: ReadingReviewStartInput,
    search: ReadingReviewEvidenceSearchInput,
    result: ReadingReviewEvidenceSession | ReadingReviewEvidenceResult,
    confirmPrivacy: boolean,
  ) {
    if (
      !isCurrentComparison(request, search) ||
      !result.provider ||
      !result.evidence.length ||
      result.providerChanged
    )
      return;
    if (result.remoteConsentRequired && !confirmPrivacy) {
      setComparison({ phase: 'privacy', result });
      return;
    }
    setComparison({ phase: 'comparing', result });
    let local = result;
    try {
      if (confirmPrivacy) {
        await getDesktopApi().readingMemory.confirmPrivacy();
        if (!isCurrentComparison(request, search)) return;
        local = { ...result, remoteConsentRequired: false };
      }
      const compared = await getDesktopApi().readingMemory.review.compareEvidence({
        requestId: request.requestId,
        comparisonId: search.comparisonId,
      });
      if (isCurrentComparison(request, search)) setComparison({ phase: 'idle', result: compared });
    } catch {
      if (isCurrentComparison(request, search)) setComparison({ phase: 'failed', result: local });
    }
  }

  async function confirmComparisonPrivacy() {
    if (comparison?.phase !== 'privacy') return;
    const request = activeRequest.current;
    const search = activeComparison.current;
    if (request && search) await compareRemote(request, search, comparison.result, true);
  }

  function dismissComparisonPrivacy() {
    setComparison((current) =>
      current?.phase === 'privacy' ? { phase: 'idle', result: current.result } : current,
    );
  }

  const items =
    queue.status === 'ready'
      ? queue.result.items.filter((item) => !completed.has(assetKey(item.asset)))
      : [];
  return {
    queue,
    items,
    completedCount: completed.size,
    state,
    historyStatus,
    comparison,
    loadQueue,
    start,
    setAnswer,
    reveal,
    submit,
    retrySubmit,
    cancel,
    loadHistory,
    compare,
    confirmComparisonPrivacy,
    dismissComparisonPrivacy,
    cancelComparison,
  };
}

function assetKey(asset: ReadingReviewAssetRef) {
  return `${asset.assetType}:${asset.assetId}`;
}

function isReviewConflict(error: unknown) {
  return String(error).includes('READING_REVIEW_CONFLICT');
}

function cancelRequest(input: { requestId: string; comparisonId?: string }) {
  void getDesktopApi()
    .readingMemory.review.cancel(input)
    .catch(() => undefined);
}
