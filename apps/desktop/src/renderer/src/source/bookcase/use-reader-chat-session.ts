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
import { promptArticle } from './source-prompt-article';
import { readerChatHistoryComments } from './reader-chat-history';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { getDesktopApi } from '../../shell/app-desktop-api';

type UseReaderChatSessionInput = {
  agents: PublicAgent[];
  article: ArticleRecord;
  getArticleText: () => string | Promise<string>;
  uiLanguage?: UiLanguage;
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
  getArticleText,
  uiLanguage,
  onSaveArticleReaderChatState,
}: UseReaderChatSessionInput) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReaderChatState | undefined>(() => article.readerChatState);
  const [draftContext, setDraftContext] = useState<ReaderQuestionContext | undefined>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const articleChatRef = useRef<ArticleChatState>({ articleId: article.id, state });
  const requestChatRef = useRef<ArticleChatState | undefined>(undefined);

  useEffect(() => {
    const requestChat = requestChatRef.current;
    if (requestChat?.articleId === article.id) {
      if (articleChatRef.current === requestChat) return;
      articleChatRef.current = requestChat;
    } else {
      articleChatRef.current = { articleId: article.id, state: article.readerChatState };
    }
    setState(articleChatRef.current.state);
    setError('');
  }, [article.id, article.readerChatState]);

  useEffect(() => {
    setDraftContext(undefined);
  }, [article.id]);

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
    if (!question || !assistant || requestChatRef.current) return;

    const chat = articleChatRef.current;
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
    requestChatRef.current = chat;
    setSending(true);
    setError('');

    const pendingState = updateActiveSession(ensureState(chat, assistant.id), (messages) => [
      ...messages,
      userMessage,
      assistantMessage,
    ]);
    const previousState = chat.state;
    replaceState(chat, pendingState);

    try {
      const articleText = await getArticleText();
      if (!(await persistState(chat, chat.state || pendingState, previousState))) return;
      const finalComment = await getDesktopApi().agent.requestCommentStream(
        readerChatPayload({
          agent: assistant,
          article,
          articleText,
          context,
          question,
          uiLanguage,
          userMessageId: userMessage.id,
          history: readerChatHistoryComments(previousState, agents),
        }),
        (event) => {
          if (event.type !== 'delta') return;
          const nextState = updateActiveSession(chat.state || pendingState, (messages) =>
            messages.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${event.delta}` }
                : message,
            ),
          );
          replaceState(chat, nextState);
        },
      );
      const completedState = updateActiveSession(chat.state || pendingState, (messages) =>
        messages.map((message) =>
          message.id === assistantMessage.id
            ? { ...message, content: finalComment.content || message.content }
            : message,
        ),
      );
      await persistState(chat, completedState, pendingState);
    } catch (requestError) {
      const message = assistantRuntimeErrorMessage(requestError, 'source.readerChatFailed');
      if (articleChatRef.current === chat) setError(message);
      const failedState = updateActiveSession(chat.state || pendingState, (messages) =>
        messages.map((item) =>
          item.id === assistantMessage.id
            ? { ...item, content: i18next.t('source.requestFailedWithMessage', { message }) }
            : item,
        ),
      );
      await persistState(chat, failedState, pendingState);
    } finally {
      requestChatRef.current = undefined;
      setSending(false);
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

function readerChatPayload({
  agent,
  article,
  articleText,
  context,
  question,
  uiLanguage,
  userMessageId,
  history,
}: {
  agent: PublicAgent;
  article: ArticleRecord;
  articleText: string;
  context?: ReaderQuestionContext;
  question: string;
  uiLanguage?: UiLanguage;
  userMessageId: string;
  history: Comment[];
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
    author: { kind: 'user', username: 'reader' },
    content: question,
    createdAt: new Date().toISOString(),
  };
  const annotation: Annotation = {
    id: makeId('reader_chat_anchor'),
    anchor,
    author: { kind: 'user', username: 'reader' },
    color: '#d7b35a',
    comments: [...history, userComment],
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
