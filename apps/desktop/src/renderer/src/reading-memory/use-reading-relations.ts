import { useEffect, useRef, useState } from 'react';
import { makeId, type ReaderQuestionContext } from '@yomitomo/shared';
import type {
  ReadingRelationsJudgeResult,
  ReadingRelationsSearchInput,
  ReadingRelationsSession,
} from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';

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
  const [state, setState] = useState<ReadingRelationsState | null>(null);
  const activeRequest = useRef<ReadingRelationsSearchInput | null>(null);
  const currentArticleId = useRef(articleId);
  currentArticleId.current = articleId;

  useEffect(() => {
    setState(null);
    return () => {
      const request = activeRequest.current;
      if (request?.articleId !== articleId) return;
      activeRequest.current = null;
      cancelRequest(request);
    };
  }, [articleId]);

  function isCurrent(request: ReadingRelationsSearchInput) {
    return activeRequest.current === request && currentArticleId.current === request.articleId;
  }

  async function search(context: ReaderQuestionContext, question?: string) {
    const previous = activeRequest.current;
    if (previous) cancelRequest(previous);
    const request: ReadingRelationsSearchInput = {
      requestId: makeId('reading_relations'),
      articleId,
      context,
      ...(question?.trim() ? { question: question.trim() } : {}),
    };
    activeRequest.current = request;
    setState({ phase: 'searching', request });
    try {
      const result = await getDesktopApi().readingMemory.relations.search(request);
      if (!isCurrent(request)) return;
      setState({ phase: 'ready', request, result, remote: 'idle' });
    } catch {
      if (isCurrent(request)) setState({ phase: 'search-failed', request });
    }
  }

  function close() {
    const request = activeRequest.current;
    activeRequest.current = null;
    setState(null);
    if (request) cancelRequest(request);
  }

  async function judge(confirmPrivacy = false) {
    if (state?.phase !== 'ready' || state.remote === 'judging') return;
    const { request, result } = state;
    if (!isCurrent(request) || !result.provider || result.evidence.length === 0) return;
    if (result.remoteConsentRequired && !confirmPrivacy) {
      setState({ ...state, remote: 'privacy' });
      return;
    }

    setState({ ...state, remote: 'judging' });
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
        setState({ phase: 'ready', request, result: judged, remote: 'idle' });
      }
    } catch {
      if (isCurrent(request)) setState({ ...state, result: localResult, remote: 'failed' });
    }
  }

  function dismissPrivacy() {
    if (state?.phase === 'ready' && state.remote === 'privacy') {
      setState({ ...state, remote: 'idle' });
    }
  }

  return {
    state: state?.request.articleId === articleId ? state : null,
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
