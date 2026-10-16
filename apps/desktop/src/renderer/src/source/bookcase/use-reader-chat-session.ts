import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReaderChatState | undefined>(() => article.readerChatState);
  const [draftContext, setDraftContext] = useState<ReaderQuestionContext | undefined>();
  const [submittingArticleId, setSubmittingArticleId] = useState<string>();
  const [error, setError] = useState('');
  const articleChatRef = useRef<ArticleChatState>({ articleId: article.id, state });
  const submittingRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    articleChatRef.current = { articleId: article.id, state: article.readerChatState };
    setState(article.readerChatState);
  }, [article.id, article.readerChatState]);

  useEffect(() => {
    setDraftContext(undefined);
    setError('');
  }, [article.id]);

  const activeSessionId = state?.activeSessionId;
  const { runs, settle } = useAssistantRuns(
    article.id,
    activeSessionId ? assistantRunScope({ kind: 'chat', sessionId: activeSessionId }) : '',
  );

  useEffect(() => {
    const session = state?.sessions.find((item) => item.id === state.activeSessionId);
    const ids = new Set(session?.messages.map((message) => message.id));
    for (const run of runs) if (run.commentId && ids.has(run.commentId)) settle(run.runKey);
  }, [runs, settle, state]);

  const viewState = useMemo(() => stateWithAssistantRuns(state, runs), [runs, state]);
  // The assistant reply is appended by the main process, so a new question waits for it to
  // land instead of rewriting the chat state underneath the run.
  const sending = submittingArticleId === article.id || runs.length > 0;

  const selectedAssistantId = useMemo(
    () => state?.selectedAssistantId || agents[0]?.id,
    [agents, state?.selectedAssistantId],
  );

  function replaceState(chat: ArticleChatState, nextState: ReaderChatState | undefined) {
    chat.state = nextState;
    if (articleChatRef.current === chat) setState(nextState);
  }

  async function persistState(
    chat: ArticleChatState,
    nextState: ReaderChatState,
    previousState: ReaderChatState | undefined,
  ) {
    replaceState(chat, nextState);
    if (!onSaveArticleReaderChatState) return true;
    try {
      await onSaveArticleReaderChatState(chat.articleId, nextState);
      return true;
    } catch (persistError) {
      console.warn('[reader-chat] state persistence failed', {
        articleId: chat.articleId,
        error: persistError instanceof Error ? persistError.message : String(persistError),
      });
      replaceState(chat, previousState);
      if (articleChatRef.current === chat) setError(i18next.t('common.saveFailed'));
      return false;
    }
  }

  function askSelection(context: ReaderQuestionContext) {
    setDraftContext(context);
    setOpen(true);
    setError('');
  }

  async function selectAssistant(assistantId: string) {
    const chat = articleChatRef.current;
    const previousState = chat.state;
    const nextState = { ...ensureState(chat, assistantId), selectedAssistantId: assistantId };
    setError('');
    await persistState(chat, nextState, previousState);
  }

  async function submit(content: string) {
    const question = content.trim();
    const assistant = agents.find((agent) => agent.id === selectedAssistantId) || agents[0];
    if (!question || !assistant || sending || submittingRef.current) return;

    const chat = articleChatRef.current;
    const userMessage: ReaderChatMessage = {
      id: makeId('reader_chat_message'),
      role: 'user',
      content: question,
      context: draftContext,
      createdAt: new Date().toISOString(),
    };
    const previousState = chat.state;
    const nextState = updateActiveSession(ensureState(chat, assistant.id), (messages) => [
      ...messages,
      userMessage,
    ]);

    setDraftContext(undefined);
    setError('');
    submittingRef.current = chat.articleId;
    setSubmittingArticleId(chat.articleId);
    const showError = (message: string) => {
      if (articleChatRef.current.articleId === chat.articleId) setError(message);
    };
    try {
      if (!(await persistState(chat, nextState, previousState))) return;
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
      setSubmittingArticleId((current) => (current === chat.articleId ? undefined : current));
    }
  }

  return {
    actions: {
      onClearDraftContext: () => setDraftContext(undefined),
      onClose: () => setOpen(false),
      onOpen: () => setOpen(true),
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

function stateWithAssistantRuns(
  state: ReaderChatState | undefined,
  runs: AssistantRunView[],
): ReaderChatState | undefined {
  if (!state || runs.length === 0) return state;
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  const saved = new Set(session?.messages.map((message) => message.id));
  const pending = runs
    .filter((run) => !run.commentId || !saved.has(run.commentId))
    .map((run): ReaderChatMessage => ({
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
