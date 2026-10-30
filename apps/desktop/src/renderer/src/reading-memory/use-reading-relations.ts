import { useMemo, useSyncExternalStore } from 'react';
import { makeId, type ReaderQuestionContext } from '@yomitomo/shared';
import type {
  ReadingRelationsJudgeResult,
  ReadingRelationsSearchInput,
  ReadingRelationsSession,
} from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';
import {
  recordReadingMemoryJudgment,
  recordReadingMemoryQuery,
  recordReadingMemoryUsage,
} from './reading-memory-usage';

export type ReadingRelationsState =
  | {
      phase: 'searching' | 'search-failed';
      request: ReadingRelationsSearchInput;
    }
  | {
      phase: 'ready';
      request: ReadingRelationsSearchInput;
      result: ReadingRelationsSession | ReadingRelationsJudgeResult;
      remote: 'idle' | 'privacy' | 'judging' | 'failed';
    };

export function useReadingRelations(articleId: string) {
  // A new controller per article starts empty; React unsubscribing the old one cancels its request.
  const controller = useMemo(() => createReadingRelationsController(articleId), [articleId]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return {
    state,
    search: controller.search,
    close: controller.close,
    judge: controller.judge,
    dismissPrivacy: controller.dismissPrivacy,
  };
}

function createReadingRelationsController(articleId: string) {
  let state: ReadingRelationsState | null = null;
  let activeRequest: ReadingRelationsSearchInput | null = null;
  const listeners = new Set<() => void>();

  function update(next: ReadingRelationsState | null) {
    state = next;
    for (const listener of listeners) listener();
  }

  function isCurrent(request: ReadingRelationsSearchInput) {
    return activeRequest === request;
  }

  function endRequest() {
    const request = activeRequest;
    activeRequest = null;
    if (request) cancelRequest(request);
  }

  async function search(context: ReaderQuestionContext, question?: string) {
    if (!activeRequest) recordReadingMemoryUsage('feature_opened');
    endRequest();
    const request: ReadingRelationsSearchInput = {
      requestId: makeId('reading_relations'),
      articleId,
      context,
      ...(question?.trim() ? { question: question.trim() } : {}),
    };
    activeRequest = request;
    update({ phase: 'searching', request });
    try {
      const result = await getDesktopApi().readingMemory.relations.search(request);
      if (!isCurrent(request)) return;
      recordReadingMemoryQuery(result);
      update({ phase: 'ready', request, result, remote: 'idle' });
    } catch {
      if (isCurrent(request)) update({ phase: 'search-failed', request });
    }
  }

  function close() {
    endRequest();
    update(null);
  }

  async function judge(confirmPrivacy = false) {
    const ready = state;
    if (ready?.phase !== 'ready' || ready.remote === 'judging') return;
    const { request, result } = ready;
    if (!isCurrent(request) || !result.provider || result.evidence.length === 0) return;
    if (result.remoteConsentRequired && !confirmPrivacy) {
      update({ ...ready, remote: 'privacy' });
      return;
    }

    update({ ...ready, remote: 'judging' });
    let localResult = result;
    try {
      if (confirmPrivacy) {
        await getDesktopApi().readingMemory.confirmPrivacy();
        if (!isCurrent(request)) return;
        localResult = { ...result, remoteConsentRequired: false };
      }
      const judged = await getDesktopApi().readingMemory.relations.judge({
        requestId: request.requestId,
      });
      if (isCurrent(request)) {
        recordReadingMemoryJudgment(judged.judgment);
        update({ phase: 'ready', request, result: judged, remote: 'idle' });
      }
    } catch {
      if (isCurrent(request)) update({ ...ready, result: localResult, remote: 'failed' });
    }
  }

  function dismissPrivacy() {
    if (state?.phase === 'ready' && state.remote === 'privacy')
      update({ ...state, remote: 'idle' });
  }

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) endRequest();
      };
    },
    search,
    close,
    judge,
    dismissPrivacy,
  };
}

function cancelRequest(request: ReadingRelationsSearchInput) {
  void getDesktopApi()
    .readingMemory.relations.cancel({ requestId: request.requestId })
    .catch(() => undefined);
}
