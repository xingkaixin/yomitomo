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
      remote: 'idle' | 'privacy' | 'answering' | 'failed' | 'canceled';
    };

type ReadingLibraryQuestionView = {
  contextState: ReadingLibraryContextState | null;
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
  const { contextState, state } = useSyncExternalStore(controller.subscribe, controller.getView);
  return {
    contextState,
    state,
    ask: controller.ask,
    answer: controller.answer,
    dismissPrivacy: controller.dismissPrivacy,
    cancel: controller.cancel,
    reloadContext: controller.reloadContext,
  };
}

function createReadingLibraryQuestionController(scope: ReadingEvidenceScope | null) {
  let view: ReadingLibraryQuestionView = {
    contextState: scope ? { phase: 'loading' } : null,
    state: null,
  };
  let activeRequest: ReadingLibrarySearchInput | null = null;
  let contextLoad: object | null = null;
  const listeners = new Set<() => void>();

  function publish(next: ReadingLibraryQuestionView) {
    view = next;
    for (const listener of listeners) listener();
  }

  function updateState(next: ReadingLibraryQuestionState | null) {
    publish({
      contextState:
        next?.phase === 'ready' ? { phase: 'ready', context: next.result } : view.contextState,
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
          publish({ contextState: { phase: 'ready', context }, state: null });
      })
      .catch(() => {
        if (contextLoad === load) publish({ contextState: { phase: 'failed' }, state: null });
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
        updateState({ phase: 'ready', request, result: answered, remote: 'idle' });
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
      updateState({ phase: 'ready', request, result, remote: 'idle' });
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
    if (scope) publish({ contextState: { phase: 'loading' }, state: null });
    loadContext();
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
  };
}

function cancelRequest(request: ReadingLibrarySearchInput) {
  void getDesktopApi()
    .readingMemory.library.cancel({ requestId: request.requestId })
    .catch(() => undefined);
}
