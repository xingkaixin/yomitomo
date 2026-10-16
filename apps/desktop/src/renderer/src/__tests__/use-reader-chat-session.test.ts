// @vitest-environment jsdom

import React, { useEffect, useState } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ArticleRecord,
  AssistantDeliveryRequest,
  AssistantRunEvent,
  PublicAgent,
  ReaderChatState,
} from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import { useReaderChatSession } from '../source/bookcase/use-reader-chat-session';

const now = '2026-06-06T00:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const agents: PublicAgent[] = [agent('agent_1', '林知微'), agent('agent_2', '周砚')];

type ReaderChatSession = ReturnType<typeof useReaderChatSession>;

function renderReaderChatSession(
  onSaveArticleReaderChatState: (
    articleId: string,
    readerChatState?: ReaderChatState,
  ) => void | Promise<void> = () => undefined,
) {
  let session: ReaderChatSession | null = null;
  let updateArticle: React.Dispatch<React.SetStateAction<ArticleRecord>> | null = null;
  let savedReaderChatState: ReaderChatState | undefined;

  function Harness() {
    const [article, setArticle] = useState<ArticleRecord>(() => articleRecord());
    updateArticle = setArticle;
    const nextSession = useReaderChatSession({
      agents,
      article,
      onSaveArticleReaderChatState: async (articleId, readerChatState) => {
        await onSaveArticleReaderChatState(articleId, readerChatState);
        savedReaderChatState = readerChatState;
        setArticle((current) =>
          current.id === articleId ? { ...current, readerChatState, updatedAt: now } : current,
        );
      },
    });

    useEffect(() => {
      session = nextSession;
    });

    return null;
  }

  render(React.createElement(Harness));

  return {
    session: () => {
      if (!session) throw new Error('session not ready');
      return session;
    },
    updateArticle: (update: React.SetStateAction<ArticleRecord>) => {
      if (!updateArticle) throw new Error('article updater not ready');
      updateArticle(update);
    },
    savedReaderChatState: () => savedReaderChatState,
  };
}

describe('useReaderChatSession', () => {
  it('delivers the question to its chat channel and shows the reply the main process saves', async () => {
    const desktop = mockDesktop();
    const { session, updateArticle } = renderReaderChatSession();
    act(() => {
      session().askSelection({ sourceType: 'web', quote: '可以提问的正文', title: '文章' });
    });

    let submit: Promise<void> | undefined;
    act(() => {
      submit = session().actions.onSubmit('这是什么意思？');
    });
    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    const request = desktop.deliver.mock.calls[0][0];
    const saved = session().model.state!;
    const userMessage = saved.sessions[0].messages[0];
    expect(userMessage).toMatchObject({ role: 'user', context: { quote: '可以提问的正文' } });
    expect(request).toMatchObject({
      articleId: 'article_1',
      agentId: 'agent_1',
      channel: { kind: 'chat', sessionId: saved.activeSessionId },
      triggerId: userMessage.id,
    });

    act(() => desktop.emit(runEvent(request, { status: 'running', text: '正在回答' })));
    expect(session().model.sending).toBe(true);
    expect(session().model.state?.sessions[0].messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '正在回答',
    });

    const reply = { id: 'reader_chat_message_reply', role: 'assistant' as const };
    act(() => {
      updateArticle((current) => ({
        ...current,
        readerChatState: {
          ...saved,
          sessions: [
            {
              ...saved.sessions[0],
              messages: [
                userMessage,
                { ...reply, content: '完整回答', assistantId: 'agent_1', createdAt: now },
              ],
            },
          ],
        },
      }));
      desktop.emit(runEvent(request, { status: 'done', text: '完整回答', commentId: reply.id }));
    });
    await act(async () => {
      await submit;
    });

    await waitFor(() => expect(session().model.sending).toBe(false));
    expect(session().model.state?.sessions[0].messages).toMatchObject([
      { role: 'user', content: '这是什么意思？' },
      { id: reply.id, content: '完整回答' },
    ]);
    expect(session().model.error).toBe('');
  });

  it('keeps the quoted selection when switching the selected assistant', async () => {
    mockDesktop();
    const { session } = renderReaderChatSession();

    act(() => {
      session().askSelection({
        sourceType: 'web',
        quote: '可以提问的正文',
        title: '文章',
      });
    });

    expect(session().model.draftContext?.quote).toBe('可以提问的正文');

    await act(async () => {
      await session().actions.onSelectAssistant?.('agent_2');
    });

    await waitFor(() => expect(session().model.selectedAssistantId).toBe('agent_2'));
    expect(session().model.draftContext?.quote).toBe('可以提问的正文');
  });

  it.each(['delivery', 'run'] as const)(
    'reports a failed %s and keeps the question',
    async (failure) => {
      const desktop = mockDesktop(
        failure === 'delivery' ? () => Promise.reject(new Error('network failed')) : undefined,
      );
      const { session } = renderReaderChatSession();
      let submit: Promise<void> | undefined;
      act(() => {
        submit = session().actions.onSubmit('会失败吗？');
      });
      await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
      await act(async () => {
        if (failure === 'run') {
          desktop.emit(
            runEvent(desktop.deliver.mock.calls[0][0], { status: 'failed', error: 'empty_answer' }),
          );
        }
        await submit;
      });

      expect(session().model.sending).toBe(false);
      expect(session().model.error).toBe(
        failure === 'delivery' ? 'network failed' : '问答请求失败，请稍后重试',
      );
      expect(session().model.state?.sessions[0].messages).toEqual([
        expect.objectContaining({ role: 'user', content: '会失败吗？' }),
      ]);
    },
  );

  it('restores the last saved chat state when persistence fails', async () => {
    const desktop = mockDesktop();
    const saveReaderChatState = vi.fn(() => Promise.reject(new Error('save failed')));
    const { savedReaderChatState, session } = renderReaderChatSession(saveReaderChatState);

    await act(async () => {
      await session().actions.onSubmit('无法保存的问题');
    });

    expect(saveReaderChatState).toHaveBeenCalledOnce();
    expect(desktop.deliver).not.toHaveBeenCalled();
    expect(savedReaderChatState()).toBeUndefined();
    expect(session().model.state).toBeUndefined();
    expect(session().model.error).toBe('保存失败。');
    expect(session().model.sending).toBe(false);
  });

  it('does not send another question while a reply is still running', async () => {
    const desktop = mockDesktop();
    const save = vi.fn();
    const { session } = renderReaderChatSession(save);
    act(() => {
      void session().actions.onSubmit('第一个问题');
    });
    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    act(() => desktop.emit(runEvent(desktop.deliver.mock.calls[0][0], { status: 'running' })));

    await act(async () => {
      await session().actions.onSubmit('第二个问题');
    });

    expect(desktop.deliver).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not roll back another article when a pending save fails', async () => {
    const pendingSave = deferred<void>();
    const save = vi.fn().mockImplementationOnce(() => pendingSave.promise);
    const desktop = mockDesktop();
    const { session, updateArticle } = renderReaderChatSession(save);
    let submit: Promise<void> | undefined;
    act(() => {
      submit = session().actions.onSubmit('文章一的问题');
    });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    act(() => {
      updateArticle({ ...articleRecord(), id: 'article_2' });
    });
    await act(async () => {
      await session().actions.onSelectAssistant?.('agent_2');
    });
    const secondArticleState = session().model.state;
    await act(async () => {
      pendingSave.reject(new Error('article one save failed'));
      await submit;
    });
    expect(desktop.deliver).not.toHaveBeenCalled();
    expect(session().model.state).toEqual(secondArticleState);
    expect(session().model.error).toBe('');
    expect(session().model.sending).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockDesktop(
  deliver: (request: AssistantDeliveryRequest) => Promise<{ runKey: string | null }> = async (
    request,
  ) => ({ runKey: runKeyFor(request) }),
) {
  const listeners = new Set<(event: AssistantRunEvent) => void>();
  const desktop = {
    deliver: vi.fn(deliver),
    emit: (event: AssistantRunEvent) => {
      for (const listener of listeners) listener(event);
    },
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      assistant: {
        deliver: desktop.deliver,
        runs: async () => [],
        onRun: (listener: (event: AssistantRunEvent) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
  });
  return desktop;
}

function runKeyFor(request: AssistantDeliveryRequest) {
  return `run_${request.triggerId}`;
}

function runEvent(
  request: AssistantDeliveryRequest,
  event: Partial<AssistantRunEvent> & Pick<AssistantRunEvent, 'status'>,
): AssistantRunEvent {
  return {
    runKey: runKeyFor(request),
    articleId: request.articleId,
    agentId: request.agentId,
    channel: request.channel,
    text: '',
    ...event,
  };
}

function agent(id: string, nickname: string): PublicAgent {
  return {
    id,
    kind: 'annotation',
    enabled: true,
    nickname,
    username: id,
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: nickname,
    temperature: 0.3,
  };
}

function articleRecord(): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '文章',
    contentHtml: '<p>这是一段可以提问的正文。</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}
