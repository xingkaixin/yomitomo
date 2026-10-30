import { useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import type {
  ArticleRecord,
  PublicAgent,
  ReaderChatMessage,
  ReaderChatState,
  ReaderQuestionContext,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import i18next from 'i18next';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import {
  type AssistantRunView,
  assistantRunScope,
  deliverAssistantMessage,
  useAssistantRuns,
} from '../../shell/app-assistant-runs';

type UseReaderChatSessionInput = {
  agents: PublicAgent[];
  article: ArticleRecord;
  onSaveArticleReaderChatState?: (
    articleId: string,
    readerChatState?: ReaderChatState,
  ) => Promise<unknown>;
};

type ArticleChatState = {
  articleId: string;
  state: ReaderChatState | undefined;
};

type ArticleChatScope = {
  articleId: string;
  base: ReaderChatState | undefined;
};

type ReaderChatSessionState = {
  articleId: string;
  draftContext: ReaderQuestionContext | undefined;
  error: string;
  open: boolean;
  // A local chat state stays visible until the article's saved chat state changes.
  override: (ArticleChatScope & { value: ReaderChatState | undefined }) | null;
  submittingArticleId: string | undefined;
};

type ReaderChatSessionEvent =
  | { type: 'articleOpened'; articleId: string }
  | { type: 'closed' }
  | { type: 'draftContextCleared' }
  | { type: 'errorCleared' }
  | { type: 'failed'; articleId: string; message: string }
  | { type: 'opened' }
  | { type: 'questionSubmitted'; articleId: string }
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
      return { ...state, articleId: event.articleId, draftContext: undefined, error: '' };
    case 'closed':
      return { ...state, open: false };
    case 'draftContextCleared':
      return { ...state, draftContext: undefined };
    case 'errorCleared':
      return { ...state, error: '' };
    case 'failed':
      return event.articleId === state.articleId ? { ...state, error: event.message } : state;
    case 'opened':
      return { ...state, open: true };
    case 'questionSubmitted':
      return {
        ...state,
        draftContext: undefined,
        error: '',
        submittingArticleId: event.articleId,
      };
    case 'saveFailed':
      if (event.scope.articleId !== state.articleId) return state;
      return {
        ...state,
        error: event.message,
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
      return { ...state, draftContext: event.context, error: '', open: true };
    case 'submissionSettled':
      return state.submittingArticleId === event.articleId
        ? { ...state, submittingArticleId: undefined }
        : state;
  }
}

function updateActiveSession(
  current: ReaderChatState,
  update: (messages: ReaderChatMessage[]) => ReaderChatMessage[],
) {
  const now = new Date().toISOString();
  return {
    ...current,
    updatedAt: now,
    sessions: current.sessions.map((session) =>
      session.id === current.activeSessionId
        ? { ...session, messages: update(session.messages), updatedAt: now }
        : session,
    ),
  };
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
    open: false,
    override: null,
    submittingArticleId: undefined,
  });
  // Ebook and PDF readers stay mounted across articles, so the draft resets while rendering.
  if (session.articleId !== article.id) dispatch({ type: 'articleOpened', articleId: article.id });
  const { draftContext, error, open, override } = session;
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
    scope: ArticleChatScope,
    nextState: ReaderChatState,
    previousState: ReaderChatState | undefined,
  ) {
    dispatch({ type: 'saveStarted', scope, value: nextState });
    if (!onSaveArticleReaderChatState) return true;
    try {
      await onSaveArticleReaderChatState(scope.articleId, nextState);
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
        previous: previousState,
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
    dispatch({ type: 'errorCleared' });
    await persistState(chat, nextState, chat.state);
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
    const nextState = updateActiveSession(ensureState(chat, assistant.id), (messages) => [
      ...messages,
      userMessage,
    ]);

    submittingRef.current = chat.articleId;
    dispatch({ type: 'questionSubmitted', articleId: chat.articleId });
    const showError = (message: string) =>
      dispatch({ type: 'failed', articleId: chat.articleId, message });
    try {
      if (!(await persistState(chat, nextState, chat.state))) return;
      const delivery = await deliverAssistantMessage({
        articleId: chat.articleId,
        channel: { kind: 'chat', sessionId: nextState.activeSessionId },
        agentId: assistant.id,
        triggerId: userMessage.id,
      });
      const settled = await delivery?.settled;
      if (settled?.status !== 'done' || !settled.commentId) {
        console.warn('[reader-chat] assistant run failed', settled?.error ?? 'not_started');
        showError(i18next.t('source.readerChatFailed'));
      }
    } catch (requestError) {
      showError(assistantRuntimeErrorMessage(requestError, 'source.readerChatFailed'));
    } finally {
      submittingRef.current = undefined;
      dispatch({ type: 'submissionSettled', articleId: chat.articleId });
    }
  }

  return {
    actions: {
      onClearDraftContext: () => dispatch({ type: 'draftContextCleared' }),
      onClose: () => dispatch({ type: 'closed' }),
      onOpen: () => dispatch({ type: 'opened' }),
      onSelectAssistant: selectAssistant,
      onSubmit: submit,
    },
    askSelection,
    model: {
      draftContext,
      error,
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
  const current = chat.state;
  if (current) return current;

  const now = new Date().toISOString();
  const sessionId = makeId('reader_chat_session');
  return {
    articleId: chat.articleId,
    activeSessionId: sessionId,
    selectedAssistantId: assistantId,
    sessions: [
      {
        id: sessionId,
        articleId: chat.articleId,
        createdAt: now,
        updatedAt: now,
        messages: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
