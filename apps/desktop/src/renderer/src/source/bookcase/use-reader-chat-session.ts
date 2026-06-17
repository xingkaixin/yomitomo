import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentMessagePayload,
  Annotation,
  ArticleRecord,
  Comment,
  PublicAgent,
  ReaderChatMessage,
  ReaderChatState,
  ReaderQuestionContext,
  UiLanguage,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import i18next from 'i18next';
import { promptArticle } from './app-source-bookcase-shared';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';

type UseReaderChatSessionInput = {
  agents: PublicAgent[];
  article: ArticleRecord;
  getArticleText: () => string | Promise<string>;
  uiLanguage?: UiLanguage;
  onSaveArticleReaderChatState?: (articleId: string, readerChatState?: ReaderChatState) => unknown;
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
  getArticleText,
  uiLanguage,
  onSaveArticleReaderChatState,
}: UseReaderChatSessionInput) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReaderChatState | undefined>(() => article.readerChatState);
  const [draftContext, setDraftContext] = useState<ReaderQuestionContext | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const stateRef = useRef<ReaderChatState | undefined>(state);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (sendingRef.current && stateRef.current?.articleId === article.id) return;
    setState(article.readerChatState);
    stateRef.current = article.readerChatState;
    setError('');
  }, [article.id, article.readerChatState]);

  useEffect(() => {
    setDraftContext(undefined);
  }, [article.id]);

  const selectedAssistantId = useMemo(
    () => state?.selectedAssistantId || agents[0]?.id,
    [agents, state?.selectedAssistantId],
  );

  function replaceState(nextState: ReaderChatState, persist = false) {
    stateRef.current = nextState;
    setState(nextState);
    if (persist) void onSaveArticleReaderChatState?.(article.id, nextState);
  }

  function setSendingState(nextSending: boolean) {
    sendingRef.current = nextSending;
    setSending(nextSending);
  }

  function ensureState(assistantId = selectedAssistantId) {
    const current = stateRef.current;
    if (current) return current;

    const now = new Date().toISOString();
    const sessionId = makeId('reader_chat_session');
    return {
      articleId: article.id,
      activeSessionId: sessionId,
      selectedAssistantId: assistantId,
      sessions: [
        {
          id: sessionId,
          articleId: article.id,
          createdAt: now,
          updatedAt: now,
          messages: [],
        },
      ],
      createdAt: now,
      updatedAt: now,
    };
  }

  function askSelection(context: ReaderQuestionContext) {
    setDraftContext(context);
    setOpen(true);
    setError('');
  }

  function selectAssistant(assistantId: string) {
    const nextState = { ...ensureState(assistantId), selectedAssistantId: assistantId };
    replaceState(nextState, true);
  }

  async function submit(content: string) {
    const question = content.trim();
    const assistant = agents.find((agent) => agent.id === selectedAssistantId) || agents[0];
    if (!question || !assistant) return;

    const context = draftContext;
    const userMessage: ReaderChatMessage = {
      id: makeId('reader_chat_message'),
      role: 'user',
      content: question,
      context,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: ReaderChatMessage = {
      id: makeId('reader_chat_message'),
      role: 'assistant',
      content: '',
      assistantId: assistant.id,
      createdAt: new Date().toISOString(),
    };

    setDraftContext(undefined);
    setSendingState(true);
    setError('');

    const pendingState = updateActiveSession(ensureState(assistant.id), (messages) => [
      ...messages,
      userMessage,
      assistantMessage,
    ]);
    replaceState(pendingState, true);

    try {
      const finalComment = await window.yomitomoDesktop.requestAgentCommentStream(
        readerChatPayload({
          agent: assistant,
          article,
          articleText: await getArticleText(),
          context,
          question,
          uiLanguage,
          userMessageId: userMessage.id,
        }),
        (event) => {
          if (event.type !== 'delta') return;
          const nextState = updateActiveSession(stateRef.current || pendingState, (messages) =>
            messages.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${event.delta}` }
                : message,
            ),
          );
          replaceState(nextState);
        },
      );
      const completedState = updateActiveSession(stateRef.current || pendingState, (messages) =>
        messages.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: finalComment.content || message.content }
            : message,
        ),
      );
      replaceState(completedState, true);
    } catch (requestError) {
      const message = assistantRuntimeErrorMessage(requestError, 'source.readerChatFailed');
      setError(message);
      const failedState = updateActiveSession(stateRef.current || pendingState, (messages) =>
        messages.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: i18next.t('source.requestFailedWithMessage', { message }) }
            : item,
        ),
      );
      replaceState(failedState, true);
    } finally {
      setSendingState(false);
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
      state,
    },
  };
}

function readerChatPayload({
  agent,
  article,
  articleText,
  context,
  question,
  uiLanguage,
  userMessageId,
}: {
  agent: PublicAgent;
  article: ArticleRecord;
  articleText: string;
  context?: ReaderQuestionContext;
  question: string;
  uiLanguage?: UiLanguage;
  userMessageId: string;
}): AgentMessagePayload {
  const anchor = context?.anchor || {
    exact: article.title || i18next.t('source.currentArticle'),
    prefix: '',
    suffix: '',
    start: 0,
    end: Math.max(1, Math.min(articleText.length, article.title.length || 1)),
  };
  const userComment: Comment = {
    id: userMessageId,
    author: 'user',
    content: question,
    createdAt: new Date().toISOString(),
  };
  const annotation: Annotation = {
    id: makeId('reader_chat_anchor'),
    anchor,
    author: 'user',
    color: '#d7b35a',
    comments: [userComment],
    createdAt: userComment.createdAt,
    updatedAt: userComment.createdAt,
  };

  return {
    agentId: agent.id,
    agentUsername: agent.username,
    uiLanguage,
    article: promptArticle(article, articleText),
    annotation,
    instruction: context
      ? i18next.t('source.readerChatSelectionInstruction')
      : i18next.t('source.readerChatArticleInstruction'),
    userComment,
  };
}
