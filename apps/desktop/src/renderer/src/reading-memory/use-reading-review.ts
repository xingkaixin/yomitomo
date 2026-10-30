import { useReducer, useRef } from 'react';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
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
  type ReadingReviewHistoryPage,
  type ReadingReviewQueue,
  type ReadingReviewQueueItem,
  type ReadingReviewRevealResult,
  type ReadingReviewSession,
  type ReadingReviewStartInput,
  type ReadingReviewSubmitInput,
} from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';
import { recordReadingMemoryJudgment, recordReadingMemoryQuery } from './reading-memory-usage';

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

function readingReviewQueueQuery(catalogRevision: unknown) {
  return queryOptions({
    queryKey: ['readingMemory', 'review', 'queue', catalogRevision],
    queryFn: () => getDesktopApi().readingMemory.review.queue(),
  });
}

export function useReadingReview(catalogRevision: unknown) {
  const queueQuery = useQuery(readingReviewQueueQuery(catalogRevision));
  const [{ comparison, completed, historyStatus, state }, dispatch] = useReducer(
    readingReviewReducer,
    initialReadingReviewState,
  );
  const activeRequest = useRef<ReadingReviewStartInput | null>(null);
  const activeComparison = useRef<ReadingReviewEvidenceSearchInput | null>(null);
  const activeSubmission = useRef<ReadingReviewSubmitInput | null>(null);
  const activeHistory = useRef<object | null>(null);
  const queue: QueueState = queueQuery.isFetching
    ? { status: 'loading' }
    : queueQuery.isError || !queueQuery.data
      ? { status: 'failed' }
      : { status: 'ready', result: queueQuery.data };

  useMountEffect(() => () => endRequest());

  function isCurrent(request: ReadingReviewStartInput) {
    return activeRequest.current === request;
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
    await queueQuery.refetch();
  }

  async function start(item: ReadingReviewQueueItem) {
    endRequest();
    const request = { requestId: makeId('reading_review'), asset: item.asset };
    activeRequest.current = request;
    dispatch({ type: 'reviewStarted', item });
    try {
      const session = await getDesktopApi().readingMemory.review.start(request);
      if (isCurrent(request)) dispatch({ type: 'sessionStarted', session });
    } catch {
      if (isCurrent(request)) dispatch({ type: 'startFailed', item });
    }
  }

  function setAnswer(answer: string) {
    dispatch({ type: 'answerEdited', answer });
  }

  async function reveal(needEvidence = false) {
    if (state.phase !== 'blind' || (state.status !== 'ready' && state.status !== 'reveal-failed'))
      return;
    const request = activeRequest.current;
    if (!request || !isCurrent(request)) return;
    const answer = state.answer.trim();
    if (!answer && !needEvidence && state.status !== 'reveal-failed') return;
    dispatch({ type: 'revealStarted', answer });
    try {
      const result = await getDesktopApi().readingMemory.review.reveal({
        requestId: request.requestId,
        answer,
      });
      if (isCurrent(request)) dispatch({ type: 'revealed', result });
    } catch (error) {
      if (isCurrent(request))
        dispatch({
          type: 'revealFailed',
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
    dispatch({ type: 'comparisonCanceled' });
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
    dispatch({ type: 'submissionStarted', result, input });
    try {
      const saved = await getDesktopApi().readingMemory.review.submit(input);
      if (!isCurrent(request) || activeSubmission.current !== input) return;
      dispatch({ type: 'submissionSaved', asset: request.asset, result, event: saved.event });
    } catch (error) {
      if (isCurrent(request) && activeSubmission.current === input) {
        const status = isReviewConflict(error) ? 'conflict' : 'failed';
        dispatch({ type: 'submissionFailed', status, result, input });
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
    dispatch({ type: 'reviewCanceled' });
  }

  async function loadHistory() {
    if (state.phase !== 'revealed' || activeHistory.current || !state.result.history.nextCursor)
      return;
    const request = activeRequest.current;
    if (!request || !isCurrent(request)) return;
    const operation = {};
    activeHistory.current = operation;
    dispatch({ type: 'historyRequested' });
    try {
      const page = await getDesktopApi().readingMemory.review.history({
        requestId: request.requestId,
        cursor: state.result.history.nextCursor,
      });
      if (!isCurrent(request) || activeHistory.current !== operation) return;
      dispatch({ type: 'historyLoaded', page });
    } catch {
      if (isCurrent(request) && activeHistory.current === operation)
        dispatch({ type: 'historyFailed' });
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
    dispatch({ type: 'comparisonSearchStarted' });
    try {
      const result = await getDesktopApi().readingMemory.review.searchEvidence(search);
      if (!isCurrentComparison(request, search)) return;
      recordReadingMemoryQuery(result);
      dispatch({ type: 'comparisonReceived', result });
      await compareRemote(request, search, result, false);
    } catch {
      if (isCurrentComparison(request, search)) dispatch({ type: 'comparisonSearchFailed' });
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
      dispatch({ type: 'comparisonPrivacyRequired', result });
      return;
    }
    dispatch({ type: 'comparisonRequested', result });
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
      if (isCurrentComparison(request, search)) {
        recordReadingMemoryJudgment(compared.judgment);
        dispatch({ type: 'comparisonReceived', result: compared });
      }
    } catch {
      if (isCurrentComparison(request, search)) {
        dispatch({ type: 'comparisonFailed', result: local });
      }
    }
  }

  async function confirmComparisonPrivacy() {
    if (comparison?.phase !== 'privacy') return;
    const request = activeRequest.current;
    const search = activeComparison.current;
    if (request && search) await compareRemote(request, search, comparison.result, true);
  }

  function dismissComparisonPrivacy() {
    dispatch({ type: 'comparisonPrivacyDismissed' });
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

type ReadingReviewSessionState = {
  comparison: ReadingReviewComparisonState | null;
  completed: ReadonlySet<string>;
  historyStatus: 'idle' | 'loading' | 'failed';
  state: ReadingReviewState;
};

type ComparisonResult = ReadingReviewEvidenceSession | ReadingReviewEvidenceResult;

type ReadingReviewSessionEvent =
  | { type: 'answerEdited'; answer: string }
  | { type: 'comparisonCanceled' }
  | { type: 'comparisonFailed'; result: ComparisonResult }
  | { type: 'comparisonPrivacyDismissed' }
  | { type: 'comparisonPrivacyRequired'; result: ComparisonResult }
  | { type: 'comparisonReceived'; result: ComparisonResult }
  | { type: 'comparisonRequested'; result: ComparisonResult }
  | { type: 'comparisonSearchFailed' }
  | { type: 'comparisonSearchStarted' }
  | { type: 'historyFailed' }
  | { type: 'historyLoaded'; page: ReadingReviewHistoryPage }
  | { type: 'historyRequested' }
  | { type: 'revealFailed'; answer: string; status: 'conflict' | 'reveal-failed' }
  | { type: 'revealStarted'; answer: string }
  | { type: 'revealed'; result: ReadingReviewRevealResult }
  | { type: 'reviewCanceled' }
  | { type: 'reviewStarted'; item: ReadingReviewQueueItem }
  | { type: 'sessionStarted'; session: ReadingReviewSession }
  | { type: 'startFailed'; item: ReadingReviewQueueItem }
  | {
      type: 'submissionFailed';
      status: 'failed' | 'conflict';
      result: ReadingReviewRevealResult;
      input: ReadingReviewSubmitInput;
    }
  | {
      type: 'submissionSaved';
      asset: ReadingReviewAssetRef;
      result: ReadingReviewRevealResult;
      event: ReadingReviewEvent;
    }
  | {
      type: 'submissionStarted';
      result: ReadingReviewRevealResult;
      input: ReadingReviewSubmitInput;
    };

const initialReadingReviewState: ReadingReviewSessionState = {
  comparison: null,
  completed: new Set(),
  historyStatus: 'idle',
  state: { phase: 'queue' },
};

function readingReviewReducer(
  current: ReadingReviewSessionState,
  event: ReadingReviewSessionEvent,
): ReadingReviewSessionState {
  const { comparison, state } = current;
  switch (event.type) {
    case 'answerEdited':
      return state.phase === 'blind' && state.status === 'ready'
        ? {
            ...current,
            state: { ...state, answer: event.answer.slice(0, readingReviewAnswerLimit) },
          }
        : current;
    case 'comparisonCanceled':
      return {
        ...current,
        comparison:
          comparison && 'result' in comparison
            ? { phase: 'canceled', result: comparison.result }
            : null,
      };
    case 'comparisonFailed':
      return { ...current, comparison: { phase: 'failed', result: event.result } };
    case 'comparisonPrivacyDismissed':
      return comparison?.phase === 'privacy'
        ? { ...current, comparison: { phase: 'idle', result: comparison.result } }
        : current;
    case 'comparisonPrivacyRequired':
      return { ...current, comparison: { phase: 'privacy', result: event.result } };
    case 'comparisonReceived':
      return { ...current, comparison: { phase: 'idle', result: event.result } };
    case 'comparisonRequested':
      return { ...current, comparison: { phase: 'comparing', result: event.result } };
    case 'comparisonSearchFailed':
      return { ...current, comparison: { phase: 'search-failed' } };
    case 'comparisonSearchStarted':
      return { ...current, comparison: { phase: 'searching' } };
    case 'historyFailed':
      return { ...current, historyStatus: 'failed' };
    case 'historyLoaded': {
      if (!('result' in state)) return { ...current, historyStatus: 'idle' };
      const seen = new Set(state.result.history.events.map((item) => item.id));
      return {
        ...current,
        historyStatus: 'idle',
        state: {
          ...state,
          result: {
            ...state.result,
            history: {
              events: [
                ...state.result.history.events,
                ...event.page.events.filter((item) => !seen.has(item.id)),
              ],
              nextCursor: event.page.nextCursor,
            },
          },
        },
      };
    }
    case 'historyRequested':
      return { ...current, historyStatus: 'loading' };
    case 'revealFailed':
      return state.phase === 'blind' && 'session' in state
        ? { ...current, state: { ...state, answer: event.answer, status: event.status } }
        : current;
    case 'revealStarted':
      return state.phase === 'blind' && 'session' in state
        ? { ...current, state: { ...state, answer: event.answer, status: 'revealing' } }
        : current;
    case 'revealed':
      return { ...current, state: { phase: 'revealed', result: event.result } };
    case 'reviewCanceled':
      return { ...current, comparison: null, historyStatus: 'idle', state: { phase: 'queue' } };
    case 'reviewStarted':
      return {
        ...current,
        comparison: null,
        historyStatus: 'idle',
        state: { phase: 'blind', status: 'starting', item: event.item },
      };
    case 'sessionStarted':
      return {
        ...current,
        state: { phase: 'blind', status: 'ready', session: event.session, answer: '' },
      };
    case 'startFailed':
      return { ...current, state: { phase: 'blind', status: 'start-failed', item: event.item } };
    case 'submissionFailed':
      return {
        ...current,
        state: {
          phase: 'submitting',
          status: event.status,
          result: event.result,
          input: event.input,
        },
      };
    case 'submissionSaved':
      return {
        ...current,
        completed: new Set(current.completed).add(assetKey(event.asset)),
        state: { phase: 'done', result: event.result, event: event.event },
      };
    case 'submissionStarted':
      return {
        ...current,
        state: { phase: 'submitting', status: 'pending', result: event.result, input: event.input },
      };
  }
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
