import { useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import type {
  ArticleRecord,
  PublicAgent,
  ReaderChatMessage,
  ReaderChatSession,
  ReaderChatState,
  ReaderQuestionContext,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { createReaderChatState } from '../../../../reader-chat-state';
import type { ArticleReaderChatStateSaveInput } from '../../../../ipc-contract';
import i18next from 'i18next';
import { getOptionalDesktopApi } from '../../shell/app-desktop-api';
import {
  classifyAssistantError,
  classifyAssistantRunFailure,
  type AssistantFailureInfo,
} from '../../shell/assistant-error-classification';
import {
  type AssistantRunView,
  assistantRunScope,
  deliverAssistantMessage,
  useAssistantRuns,
} from '../../shell/app-assistant-runs';

const SESSION_TITLE_MAX_CHARS = 48;

type UseReaderChatSessionInput = {
  agents: PublicAgent[];
  article: ArticleRecord;
  onSaveArticleReaderChatState?: (input: ArticleReaderChatStateSaveInput) => Promise<unknown>;
};

type ArticleChatState = {
  articleId: string;
  state: ReaderChatState | undefined;
};

type ArticleChatScope = {
  articleId: string;
  base: ReaderChatState | undefined;
};

type ChatRetryTarget = {
  articleId: string;
  assistantId: string;
  sessionId: string;
};

type ReaderChatSessionState = {
  articleId: string;
  draftContext: ReaderQuestionContext | undefined;
  error: string;
  errorCanRetry: boolean;
  errorOpenSettings: boolean;
  open: boolean;
  // A local chat state stays visible until the article's saved chat state changes.
  override: (ArticleChatScope & { value: ReaderChatState | undefined }) | null;
  retryTarget: ChatRetryTarget | null;
  submittingArticleId: string | undefined;
};

type ReaderChatSessionEvent =
  | { type: 'articleOpened'; articleId: string }
  | { type: 'closed' }
  | { type: 'draftContextCleared' }
  | { type: 'errorCleared' }
  | {
      type: 'failed';
      articleId: string;
      failure: AssistantFailureInfo;
      retryTarget: ChatRetryTarget | null;
    }
  | { type: 'opened' }
  | { type: 'questionSubmitted'; articleId: string }
  | { type: 'retryStarted'; articleId: string }
  | {
      type: 'saveFailed';
      attempted: ReaderChatState;
      message: string;
      previous: ReaderChatState | undefined;
      scope: ArticleChatScope;
    }
  | { type: 'saveStarted'; scope: ArticleChatScope; value: ReaderChatState }
  | { type: 'selectionAsked'; context: ReaderQuestionContext }
  | { type: 'submissionSettled'; articleId: string };

function readerChatSessionReducer(
  state: ReaderChatSessionState,
  event: ReaderChatSessionEvent,
): ReaderChatSessionState {
  switch (event.type) {
    case 'articleOpened':
      return {
        ...state,
        articleId: event.articleId,
        draftContext: undefined,
        error: '',
        errorCanRetry: false,
        errorOpenSettings: false,
        retryTarget: null,
      };
    case 'closed':
      return { ...state, open: false };
    case 'draftContextCleared':
      return { ...state, draftContext: undefined };
    case 'errorCleared':
      return {
        ...state,
        error: '',
        errorCanRetry: false,
        errorOpenSettings: false,
        retryTarget: null,
      };
    case 'failed':
      return event.articleId === state.articleId
        ? {
            ...state,
            error: event.failure.message,
            errorCanRetry: event.failure.canRetry && event.retryTarget !== null,
            errorOpenSettings: event.failure.openSettings,
            retryTarget: event.retryTarget,
          }
        : state;
    case 'opened':
      return { ...state, open: true };
    case 'questionSubmitted':
      return {
        ...state,
        draftContext: undefined,
        error: '',
        errorCanRetry: false,
        errorOpenSettings: false,
        retryTarget: null,
        submittingArticleId: event.articleId,
      };
    case 'retryStarted':
      return {
        ...state,
        error: '',
        errorCanRetry: false,
        errorOpenSettings: false,
        retryTarget: null,
        submittingArticleId: event.articleId,
      };
    case 'saveFailed':
      if (event.scope.articleId !== state.articleId) return state;
      return {
        ...state,
        error: event.message,
        errorCanRetry: false,
        errorOpenSettings: false,
        retryTarget: null,
        // A later local change wins over the rollback of an earlier save.
        override:
          state.override?.value === event.attempted
            ? { ...state.override, value: event.previous }
            : state.override,
      };
    case 'saveStarted':
      if (event.scope.articleId !== state.articleId) return state;
      return {
        ...state,
        override: { articleId: event.scope.articleId, base: event.scope.base, value: event.value },
      };
    case 'selectionAsked':
      return {
        ...state,
        draftContext: event.context,
        error: '',
        errorCanRetry: false,
        errorOpenSettings: false,
        open: true,
        retryTarget: null,
      };
    case 'submissionSettled':
      return state.submittingArticleId === event.articleId
        ? { ...state, submittingArticleId: undefined }
        : state;
  }
}

function updateActiveSession(
  current: ReaderChatState,
  update: (session: ReaderChatSession, now: string) => ReaderChatSession,
) {
  const now = new Date().toISOString();
  return {
    ...current,
    updatedAt: now,
    sessions: current.sessions.map((session) =>
      session.id === current.activeSessionId ? update(session, now) : session,
    ),
  };
}

function deriveSessionTitle(question: string) {
  const singleLine = question.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= SESSION_TITLE_MAX_CHARS) return singleLine;
  return `${singleLine.slice(0, SESSION_TITLE_MAX_CHARS - 1)}…`;
}

export function useReaderChatSession({
  agents,
  article,
  onSaveArticleReaderChatState,
}: UseReaderChatSessionInput) {
  const [session, dispatch] = useReducer(readerChatSessionReducer, {
    articleId: article.id,
    draftContext: undefined,
    error: '',
    errorCanRetry: false,
    errorOpenSettings: false,
    open: false,
    override: null,
    retryTarget: null,
    submittingArticleId: undefined,
  });
  // Ebook and PDF readers stay mounted across articles, so the draft resets while rendering.
  if (session.articleId !== article.id) dispatch({ type: 'articleOpened', articleId: article.id });
  const { draftContext, error, errorCanRetry, errorOpenSettings, open, override, retryTarget } =
    session;
  const state =
    override?.articleId === article.id && override.base === article.readerChatState
      ? override.value
      : article.readerChatState;
  const submittingRef = useRef<string | undefined>(undefined);
  const readChat = useStableCallback(() => ({
    articleId: article.id,
    base: article.readerChatState,
    state,
  }));

  const activeSessionId = state?.activeSessionId;
  const { runs } = useAssistantRuns(
    article.id,
    activeSessionId ? assistantRunScope({ kind: 'chat', sessionId: activeSessionId }) : '',
  );
  const pendingRuns = useMemo(() => unsavedAssistantRuns(state, runs), [runs, state]);

  const viewState = useMemo(() => stateWithAssistantRuns(state, pendingRuns), [pendingRuns, state]);
  // The assistant reply is appended by the main process, so a new question waits for it to
  // land instead of rewriting the chat state underneath the run.
  const sending = session.submittingArticleId === article.id || pendingRuns.length > 0;

  const selectedAssistantId = useMemo(
    () => state?.selectedAssistantId || agents[0]?.id,
    [agents, state?.selectedAssistantId],
  );

  async function persistState(
    scope: ArticleChatScope & ArticleChatState,
    nextState: ReaderChatState,
    input: ArticleReaderChatStateSaveInput,
  ) {
    dispatch({ type: 'saveStarted', scope, value: nextState });
    if (!onSaveArticleReaderChatState) return true;
    try {
      await onSaveArticleReaderChatState(input);
      return true;
    } catch (persistError) {
      console.warn('[reader-chat] state persistence failed', {
        articleId: scope.articleId,
        error: persistError instanceof Error ? persistError.message : String(persistError),
      });
      dispatch({
        type: 'saveFailed',
        attempted: nextState,
        message: i18next.t('common.saveFailed'),
        previous: scope.state,
        scope,
      });
      return false;
    }
  }

  function askSelection(context: ReaderQuestionContext) {
    dispatch({ type: 'selectionAsked', context });
  }

  async function selectAssistant(assistantId: string) {
    const chat = readChat();
    const nextState = { ...ensureState(chat, assistantId), selectedAssistantId: assistantId };
    await persistState(chat, nextState, {
      articleId: chat.articleId,
      initialSessionId: nextState.activeSessionId,
      selectedAssistantId: assistantId,
    });
  }

  async function createSession() {
    if (sending || submittingRef.current) return;
    const chat = readChat();
    const assistantId = selectedAssistantId || agents[0]?.id || '';
    const current = ensureState(chat, assistantId);
    const active = current.sessions.find((item) => item.id === current.activeSessionId);
    if (!active || active.messages.length === 0) return;

    const now = new Date().toISOString();
    const nextSession: ReaderChatSession = {
      id: makeId('reader_chat_session'),
      articleId: chat.articleId,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    const nextState: ReaderChatState = {
      ...current,
      activeSessionId: nextSession.id,
      updatedAt: now,
      sessions: [...current.sessions, nextSession],
    };
    dispatch({ type: 'errorCleared' });
    dispatch({ type: 'draftContextCleared' });
    await persistState(chat, nextState, {
      articleId: chat.articleId,
      readerChatState: nextState,
    });
  }

  async function selectSession(sessionId: string) {
    if (sending || submittingRef.current) return;
    const chat = readChat();
    const current = chat.state;
    if (!current || current.activeSessionId === sessionId) return;
    if (!current.sessions.some((item) => item.id === sessionId)) return;

    const nextState: ReaderChatState = {
      ...current,
      activeSessionId: sessionId,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'errorCleared' });
    await persistState(chat, nextState, {
      articleId: chat.articleId,
      readerChatState: nextState,
    });
  }

  async function clearSession() {
    if (sending || submittingRef.current) return;
    const chat = readChat();
    const current = chat.state;
    if (!current) return;
    const active = current.sessions.find((item) => item.id === current.activeSessionId);
    if (!active || active.messages.length === 0) return;

    const nextState = updateActiveSession(current, (item, now) => ({
      ...item,
      messages: [],
      title: undefined,
      updatedAt: now,
    }));
    dispatch({ type: 'errorCleared' });
    await persistState(chat, nextState, {
      articleId: chat.articleId,
      readerChatState: nextState,
    });
  }

  async function stop() {
    const chat = readChat();
    const sessionId = chat.state?.activeSessionId;
    if (!sessionId || !sending) return;
    await getOptionalDesktopApi()
      ?.assistant?.cancel?.({
        articleId: chat.articleId,
        channel: { kind: 'chat', sessionId },
        runKey: pendingRuns[0]?.runKey,
      })
      .catch(() => false);
  }

  async function deliverChatQuestion(target: ChatRetryTarget, triggerId: string) {
    const showFailure = (failure: AssistantFailureInfo) =>
      dispatch({
        type: 'failed',
        articleId: target.articleId,
        failure,
        retryTarget: target,
      });
    try {
      const delivery = await deliverAssistantMessage({
        articleId: target.articleId,
        channel: { kind: 'chat', sessionId: target.sessionId },
        agentId: target.assistantId,
        triggerId,
      });
      const settled = await delivery?.settled;
      if (settled?.status !== 'done' || !settled.commentId) {
        console.warn('[reader-chat] assistant run failed', settled?.error ?? 'not_started');
        showFailure(classifyAssistantRunFailure(settled, 'source.readerChatFailed'));
      }
    } catch (requestError) {
      showFailure(classifyAssistantError(requestError, 'source.readerChatFailed'));
    } finally {
      submittingRef.current = undefined;
      dispatch({ type: 'submissionSettled', articleId: target.articleId });
    }
  }

  async function submit(content: string) {
    const question = content.trim();
    const assistant = agents.find((agent) => agent.id === selectedAssistantId) || agents[0];
    if (!question || !assistant || sending || submittingRef.current) return;

    const chat = readChat();
    const userMessage: ReaderChatMessage = {
      id: makeId('reader_chat_message'),
      role: 'user',
      content: question,
      context: draftContext,
      createdAt: new Date().toISOString(),
    };
    const nextState = updateActiveSession(ensureState(chat, assistant.id), (item, now) => ({
      ...item,
      title: item.title || deriveSessionTitle(question),
      messages: [...item.messages, userMessage],
      updatedAt: now,
    }));

    submittingRef.current = chat.articleId;
    dispatch({ type: 'questionSubmitted', articleId: chat.articleId });
    if (
      !(await persistState(chat, nextState, {
        articleId: chat.articleId,
        readerChatState: nextState,
      }))
    ) {
      submittingRef.current = undefined;
      dispatch({ type: 'submissionSettled', articleId: chat.articleId });
      return;
    }
    await deliverChatQuestion(
      {
        articleId: chat.articleId,
        assistantId: assistant.id,
        sessionId: nextState.activeSessionId,
      },
      userMessage.id,
    );
  }

  async function retry() {
    if (!retryTarget || sending || submittingRef.current) return;
    if (retryTarget.articleId !== article.id) return;
    const assistantId = selectedAssistantId || retryTarget.assistantId;
    const target: ChatRetryTarget = {
      ...retryTarget,
      assistantId,
    };
    submittingRef.current = target.articleId;
    dispatch({ type: 'retryStarted', articleId: target.articleId });
    await deliverChatQuestion(target, makeId('retry'));
  }

  return {
    actions: {
      onClearDraftContext: () => dispatch({ type: 'draftContextCleared' }),
      onClearSession: clearSession,
      onClose: () => dispatch({ type: 'closed' }),
      onNewSession: createSession,
      onOpen: () => dispatch({ type: 'opened' }),
      onRetry: retry,
      onSelectAssistant: selectAssistant,
      onSelectSession: selectSession,
      onStop: pendingRuns.some((run) => run.status === 'running') ? stop : undefined,
      onSubmit: submit,
    },
    askSelection,
    model: {
      draftContext,
      error,
      errorCanRetry,
      errorOpenSettings,
      open,
      selectedAssistantId,
      sending,
      state: viewState,
    },
  };
}

// A finished run keeps its placeholder until the saved reply reaches the chat state.
function unsavedAssistantRuns(state: ReaderChatState | undefined, runs: AssistantRunView[]) {
  if (runs.length === 0) return runs;
  const session = state?.sessions.find((item) => item.id === state.activeSessionId);
  const saved = new Set(session?.messages.map((message) => message.id));
  const pending = runs.filter((run) => !run.commentId || !saved.has(run.commentId));
  return pending.length === runs.length ? runs : pending;
}

function stateWithAssistantRuns(
  state: ReaderChatState | undefined,
  runs: AssistantRunView[],
): ReaderChatState | undefined {
  if (!state || runs.length === 0) return state;
  const pending = runs.map((run): ReaderChatMessage => ({
    id: `assistant-run:${run.runKey}`,
    role: 'assistant',
    content: run.text,
    assistantId: run.agentId,
    assistantProgress: run.steps?.length ? { steps: run.steps } : undefined,
    createdAt: run.startedAt,
  }));
  if (pending.length === 0) return state;
  return {
    ...state,
    sessions: state.sessions.map((item) =>
      item.id === state.activeSessionId
        ? { ...item, messages: [...item.messages, ...pending] }
        : item,
    ),
  };
}

function ensureState(chat: ArticleChatState, assistantId: string) {
  return (
    chat.state ?? createReaderChatState(chat.articleId, makeId('reader_chat_session'), assistantId)
  );
}
