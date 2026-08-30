import { useEffect, useMemo, useRef, useState } from 'react';
import { makeId, type ReadingEvidenceScope } from '@yomitomo/shared';
import type {
  ReadingLibraryAnswerResult,
  ReadingLibraryContext,
  ReadingLibrarySearchInput,
  ReadingLibrarySession,
} from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';
import { recordReadingMemoryJudgment, recordReadingMemoryQuery } from './reading-memory-usage';

export type ReadingLibraryContextState =
  | { phase: 'loading' | 'failed' }
  | { phase: 'ready'; context: ReadingLibraryContext };

export type ReadingLibraryQuestionState =
  | { phase: 'searching' | 'search-failed'; request: ReadingLibrarySearchInput }
  | {
      phase: 'ready';
      request: ReadingLibrarySearchInput;
      result: ReadingLibrarySession | ReadingLibraryAnswerResult;
      remote: 'idle' | 'privacy' | 'answering' | 'failed' | 'canceled';
    };

export function useReadingLibraryQuestion(
  scope: ReadingEvidenceScope | null,
  catalogRevision: unknown,
) {
  const [refresh, setRefresh] = useState(0);
  const scopeKey = JSON.stringify(scope);
  const frame = useMemo(() => ({ scope }), [scopeKey, catalogRevision, refresh]);
  const currentFrame = useRef(frame);
  currentFrame.current = frame;
  const activeRequest = useRef<ReadingLibrarySearchInput | null>(null);
  const [view, setView] = useState<{
    frame: typeof frame;
    contextState: ReadingLibraryContextState;
    state: ReadingLibraryQuestionState | null;
  } | null>(null);

  useEffect(() => {
    if (!frame.scope) return;
    setView({ frame, contextState: { phase: 'loading' }, state: null });
    void getDesktopApi()
      .readingMemory.library.context({ scope: frame.scope })
      .then((context) => {
        if (currentFrame.current !== frame) return;
        setView({ frame, contextState: { phase: 'ready', context }, state: null });
      })
      .catch(() => {
        if (currentFrame.current !== frame) return;
        setView({ frame, contextState: { phase: 'failed' }, state: null });
      });
    return () => {
      const request = activeRequest.current;
      activeRequest.current = null;
      if (request) cancelRequest(request);
    };
  }, [frame]);

  const contextState = !scope
    ? null
    : view?.frame === frame
      ? view.contextState
      : ({ phase: 'loading' } as const);
  const state = view?.frame === frame ? view.state : null;

  function isCurrent(request: ReadingLibrarySearchInput) {
    return currentFrame.current === frame && activeRequest.current === request;
  }

  function updateState(next: ReadingLibraryQuestionState | null) {
    setView((current) =>
      current?.frame === frame
        ? {
            ...current,
            state: next,
            ...(next?.phase === 'ready'
              ? { contextState: { phase: 'ready' as const, context: next.result } }
              : {}),
          }
        : current,
    );
  }

  async function generate(
    request: ReadingLibrarySearchInput,
    result: ReadingLibrarySession | ReadingLibraryAnswerResult,
    confirmPrivacy: boolean,
  ) {
    if (
      !isCurrent(request) ||
      !result.provider ||
      !result.evidence.length ||
      result.providerChanged
    )
      return;
    if (result.remoteConsentRequired && !confirmPrivacy) {
      updateState({ phase: 'ready', request, result, remote: 'privacy' });
      return;
    }
    updateState({ phase: 'ready', request, result, remote: 'answering' });
    let localResult = result;
    try {
      if (confirmPrivacy) {
        await getDesktopApi().readingMemory.confirmPrivacy();
        if (!isCurrent(request)) return;
        localResult = { ...result, remoteConsentRequired: false };
      }
      const answered = await getDesktopApi().readingMemory.library.answer({
        requestId: request.requestId,
      });
      if (isCurrent(request)) {
        recordReadingMemoryJudgment(answered.judgment);
        updateState({ phase: 'ready', request, result: answered, remote: 'idle' });
      }
    } catch {
      if (isCurrent(request)) {
        updateState({ phase: 'ready', request, result: localResult, remote: 'failed' });
      }
    }
  }

  async function ask(question: string) {
    if (!scope || contextState?.phase !== 'ready' || !question.trim()) return;
    if (scope.kind === 'sources' && !scope.sources.length) return;
    if (activeRequest.current) cancelRequest(activeRequest.current);
    const request: ReadingLibrarySearchInput = {
      requestId: makeId('reading_library'),
      question: question.trim(),
      scope,
      expectedRouteRevision: contextState.context.routeRevision,
    };
    activeRequest.current = request;
    updateState({ phase: 'searching', request });
    try {
      const result = await getDesktopApi().readingMemory.library.search(request);
      if (!isCurrent(request)) return;
      recordReadingMemoryQuery(result);
      updateState({ phase: 'ready', request, result, remote: 'idle' });
      await generate(request, result, false);
    } catch {
      if (isCurrent(request)) updateState({ phase: 'search-failed', request });
    }
  }

  async function answer(confirmPrivacy = false) {
    if (state?.phase !== 'ready' || state.remote === 'answering') return;
    await generate(state.request, state.result, confirmPrivacy);
  }

  function dismissPrivacy() {
    if (state?.phase === 'ready' && state.remote === 'privacy')
      updateState({ ...state, remote: 'idle' });
  }

  function cancel() {
    const request = activeRequest.current;
    activeRequest.current = null;
    if (request) cancelRequest(request);
    updateState(state?.phase === 'ready' ? { ...state, remote: 'canceled' } : null);
  }

  return {
    contextState,
    state,
    ask,
    answer,
    dismissPrivacy,
    cancel,
    reloadContext: () => setRefresh((value) => value + 1),
  };
}

function cancelRequest(request: ReadingLibrarySearchInput) {
  void getDesktopApi()
    .readingMemory.library.cancel({ requestId: request.requestId })
    .catch(() => undefined);
}
