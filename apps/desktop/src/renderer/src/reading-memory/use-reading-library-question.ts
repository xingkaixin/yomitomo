import { useMemo, useSyncExternalStore } from 'react';
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
      remote: 'idle' | 'privacy' | 'answering' | 'failed' | 'canceled' | 'history';
    };

const MAX_HISTORY_ENTRIES = 20;

export type ReadingLibraryHistoryEntry = {
  id: string;
  question: string;
  askedAt: string;
  request: ReadingLibrarySearchInput;
  result: ReadingLibrarySession | ReadingLibraryAnswerResult;
};

type ReadingLibraryQuestionView = {
  contextState: ReadingLibraryContextState | null;
  history: ReadingLibraryHistoryEntry[];
  state: ReadingLibraryQuestionState | null;
};

export function useReadingLibraryQuestion(
  scope: ReadingEvidenceScope | null,
  catalogRevision: unknown,
) {
  const scopeKey = JSON.stringify(scope);
  // A new controller per scope and catalog revision starts empty and reloads its context;
  // React unsubscribing the old one cancels its request.
  const controller = useMemo(
    () => createReadingLibraryQuestionController(scope),
    [scopeKey, catalogRevision],
  );
  const { contextState, history, state } = useSyncExternalStore(
    controller.subscribe,
    controller.getView,
  );
  return {
    contextState,
    history,
    state,
    ask: controller.ask,
    answer: controller.answer,
    dismissPrivacy: controller.dismissPrivacy,
    cancel: controller.cancel,
    reloadContext: controller.reloadContext,
    selectHistory: controller.selectHistory,
  };
}

function createReadingLibraryQuestionController(scope: ReadingEvidenceScope | null) {
  let view: ReadingLibraryQuestionView = {
    contextState: scope ? { phase: 'loading' } : null,
    history: [],
    state: null,
  };
  let activeRequest: ReadingLibrarySearchInput | null = null;
  let contextLoad: object | null = null;
  const listeners = new Set<() => void>();

  function publish(next: ReadingLibraryQuestionView) {
    view = next;
    for (const listener of listeners) listener();
  }

  function recordHistory(
    request: ReadingLibrarySearchInput,
    result: ReadingLibrarySession | ReadingLibraryAnswerResult,
  ): ReadingLibraryHistoryEntry[] {
    const existing = view.history.find((entry) => entry.id === request.requestId);
    const updated: ReadingLibraryHistoryEntry = {
      id: request.requestId,
      question: request.question,
      askedAt: existing?.askedAt ?? new Date().toISOString(),
      request,
      result,
    };
    return [updated, ...view.history.filter((entry) => entry.id !== request.requestId)].slice(
      0,
      MAX_HISTORY_ENTRIES,
    );
  }

  function updateState(
    next: ReadingLibraryQuestionState | null,
    nextHistory: ReadingLibraryHistoryEntry[] = view.history,
  ) {
    publish({
      contextState:
        next?.phase === 'ready' ? { phase: 'ready', context: next.result } : view.contextState,
      history: nextHistory,
      state: next,
    });
  }

  function isCurrent(request: ReadingLibrarySearchInput) {
    return activeRequest === request;
  }

  function endRequest() {
    const request = activeRequest;
    activeRequest = null;
    if (request) cancelRequest(request);
  }

  function loadContext() {
    if (!scope) return;
    const load = {};
    contextLoad = load;
    void getDesktopApi()
      .readingMemory.library.context({ scope })
      .then((context) => {
        if (contextLoad === load)
          publish({
            contextState: { phase: 'ready', context },
            history: view.history,
            state: null,
          });
      })
      .catch(() => {
        if (contextLoad === load)
          publish({ contextState: { phase: 'failed' }, history: view.history, state: null });
      });
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
        updateState(
          { phase: 'ready', request, result: answered, remote: 'idle' },
          recordHistory(request, answered),
        );
      }
    } catch {
      if (isCurrent(request)) {
        updateState({ phase: 'ready', request, result: localResult, remote: 'failed' });
      }
    }
  }

  async function ask(question: string) {
    const { contextState } = view;
    if (!scope || contextState?.phase !== 'ready' || !question.trim()) return;
    if (scope.kind === 'sources' && !scope.sources.length) return;
    endRequest();
    const request: ReadingLibrarySearchInput = {
      requestId: makeId('reading_library'),
      question: question.trim(),
      scope,
      expectedRouteRevision: contextState.context.routeRevision,
    };
    activeRequest = request;
    updateState({ phase: 'searching', request });
    try {
      const result = await getDesktopApi().readingMemory.library.search(request);
      if (!isCurrent(request)) return;
      recordReadingMemoryQuery(result);
      updateState(
        { phase: 'ready', request, result, remote: 'idle' },
        recordHistory(request, result),
      );
      await generate(request, result, false);
    } catch {
      if (isCurrent(request)) updateState({ phase: 'search-failed', request });
    }
  }

  async function answer(confirmPrivacy = false) {
    const { state } = view;
    if (state?.phase !== 'ready' || state.remote === 'answering') return;
    await generate(state.request, state.result, confirmPrivacy);
  }

  function dismissPrivacy() {
    const { state } = view;
    if (state?.phase === 'ready' && state.remote === 'privacy')
      updateState({ ...state, remote: 'idle' });
  }

  function cancel() {
    const { state } = view;
    endRequest();
    updateState(state?.phase === 'ready' ? { ...state, remote: 'canceled' } : null);
  }

  function reloadContext() {
    endRequest();
    if (scope) publish({ contextState: { phase: 'loading' }, history: view.history, state: null });
    loadContext();
  }

  function selectHistory(id: string) {
    const entry = view.history.find((item) => item.id === id);
    if (!entry) return;
    if (isCurrent(entry.request)) return;
    endRequest();
    updateState({
      phase: 'ready',
      request: entry.request,
      result: entry.result,
      remote: 'history',
    });
  }

  return {
    getView: () => view,
    subscribe: (listener: () => void) => {
      if (!listeners.size) loadContext();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        contextLoad = null;
        endRequest();
      };
    },
    ask,
    answer,
    dismissPrivacy,
    cancel,
    reloadContext,
    selectHistory,
  };
}

function cancelRequest(request: ReadingLibrarySearchInput) {
  void getDesktopApi()
    .readingMemory.library.cancel({ requestId: request.requestId })
    .catch(() => undefined);
}
