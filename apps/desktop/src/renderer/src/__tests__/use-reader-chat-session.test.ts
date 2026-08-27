// @vitest-environment jsdom

import React, { useEffect, useState } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, PublicAgent, ReaderChatState } from '@yomitomo/shared';
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
  getArticleText: () => string | Promise<string> = () => '这是一段可以提问的正文。',
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
      getArticleText,
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
  it('keeps the quoted selection when switching the selected assistant', async () => {
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

  it('saves the assistant reply and resets sending after a reader chat request', async () => {
    const requestAgentCommentStream = vi.fn((_payload, onEvent) => {
      onEvent({ type: 'delta', delta: '流式' });
      return Promise.resolve({
        id: 'comment_1',
        author: 'ai' as const,
        content: '流式回答',
        createdAt: now,
      });
    });
    mockDesktop({ requestAgentCommentStream });
    const { session } = renderReaderChatSession();

    act(() => {
      session().askSelection({
        sourceType: 'web',
        quote: '可以提问的正文',
        title: '文章',
      });
    });

    await act(async () => {
      await session().actions.onSubmit('这是什么意思？');
    });

    await waitFor(() => expect(session().model.sending).toBe(false));
    const messages = session().model.state?.sessions[0]?.messages;
    expect(messages).toMatchObject([
      { role: 'user', content: '这是什么意思？', context: { quote: '可以提问的正文' } },
      { role: 'assistant', content: '流式回答', assistantId: 'agent_1' },
    ]);
    expect(messages?.[1]).not.toHaveProperty('context');
    expect(requestAgentCommentStream).toHaveBeenCalledOnce();
  });

  it.each(['request', 'article text'] as const)(
    'resets sending and keeps a failed assistant message when %s rejects',
    async (failure) => {
      mockDesktop({
        requestAgentCommentStream: vi.fn(() => Promise.reject(new Error('network failed'))),
      });
      const { session } = renderReaderChatSession(
        undefined,
        failure === 'article text' ? () => Promise.reject(new Error('text failed')) : undefined,
      );

      await act(async () => {
        await session().actions.onSubmit('会失败吗？');
      });

      await waitFor(() => expect(session().model.sending).toBe(false));
      expect(session().model.state?.sessions[0]?.messages).toEqual([
        expect.objectContaining({ role: 'user', content: '会失败吗？' }),
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('请求失败'),
        }),
      ]);
    },
  );

  it('restores the last saved chat state when persistence fails', async () => {
    const requestAgentCommentStream = vi.fn();
    mockDesktop({ requestAgentCommentStream });
    const saveReaderChatState = vi.fn(() => Promise.reject(new Error('save failed')));
    const { savedReaderChatState, session } = renderReaderChatSession(saveReaderChatState);

    await act(async () => {
      await session().actions.onSubmit('无法保存的问题');
    });

    expect(saveReaderChatState).toHaveBeenCalledOnce();
    expect(requestAgentCommentStream).not.toHaveBeenCalled();
    expect(savedReaderChatState()).toBeUndefined();
    expect(session().model.state).toBeUndefined();
    expect(session().model.error).toBe('保存失败。');
    expect(session().model.sending).toBe(false);
  });

  it('keeps the streaming reader chat state when stale article props arrive mid-request', async () => {
    let resolveRequest:
      | ((value: { author: 'ai'; content: string; createdAt: string }) => void)
      | null = null;
    const requestAgentCommentStream = vi.fn((_payload, onEvent) => {
      onEvent({ type: 'delta', delta: '正在回答' });
      return new Promise<{ author: 'ai'; content: string; createdAt: string }>((resolve) => {
        resolveRequest = resolve;
      });
    });
    mockDesktop({ requestAgentCommentStream });
    const { session, updateArticle } = renderReaderChatSession();

    let pendingSubmit: Promise<void> | undefined;
    act(() => {
      pendingSubmit = Promise.resolve(session().actions.onSubmit('这个问题是什么？'));
    });
    await waitFor(() => expect(session().model.sending).toBe(true));
    expect(session().model.state?.sessions[0]?.messages).toHaveLength(2);

    act(() => {
      updateArticle((current) => ({
        ...current,
        readerChatState: undefined,
        updatedAt: '2026-06-06T00:00:01.000Z',
      }));
    });

    expect(session().model.state?.sessions[0]?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '这个问题是什么？' }),
      expect.objectContaining({ role: 'assistant', content: '正在回答' }),
    ]);

    await act(async () => {
      resolveRequest?.({ author: 'ai', content: '最终回答', createdAt: now });
      await pendingSubmit;
    });
    await waitFor(() => expect(session().model.sending).toBe(false));
    expect(session().model.state?.sessions[0]?.messages[1]).toMatchObject({
      role: 'assistant',
      content: '最终回答',
    });
  });

  it.each(['success', 'failure'] as const)(
    'keeps the original article as owner after navigation and request %s',
    async (outcome) => {
      const reply = deferred<{ author: 'ai'; content: string; createdAt: string }>();
      const requestAgentCommentStream = vi.fn((_payload, _onEvent) => reply.promise);
      mockDesktop({ requestAgentCommentStream });
      const save = vi.fn();
      const { session, updateArticle } = renderReaderChatSession(save);
      let submit: Promise<void> | undefined;
      act(() => {
        submit = session().actions.onSubmit('文章一的问题');
      });
      await waitFor(() => expect(requestAgentCommentStream).toHaveBeenCalledOnce());
      act(() => {
        updateArticle({ ...articleRecord(), id: 'article_2', title: '文章二' });
      });
      await act(async () => {
        await session().actions.onSelectAssistant?.('agent_2');
      });
      const secondArticleState = session().model.state;
      act(() => {
        requestAgentCommentStream.mock.calls[0][1]({ type: 'delta', delta: '文章一的回答' });
      });
      await act(async () => {
        if (outcome === 'success') {
          reply.resolve({ author: 'ai', content: '文章一的完整回答', createdAt: now });
        } else {
          reply.reject(new Error('article one failed'));
        }
        await submit;
      });

      const [savedArticleId, savedState] = save.mock.calls.at(-1)!;
      expect(savedArticleId).toBe('article_1');
      expect(savedState).toMatchObject({
        articleId: 'article_1',
        sessions: [
          {
            articleId: 'article_1',
            messages: [
              { role: 'user', content: '文章一的问题' },
              {
                role: 'assistant',
                content:
                  outcome === 'success' ? '文章一的完整回答' : expect.stringContaining('请求失败'),
              },
            ],
          },
        ],
      });
      expect(session().model.state).toEqual(secondArticleState);
      expect(session().model.error).toBe('');
      expect(session().model.sending).toBe(false);
    },
  );

  it('does not roll back another article when a pending save fails', async () => {
    const pendingSave = deferred<void>();
    const save = vi.fn().mockImplementationOnce(() => pendingSave.promise);
    const requestAgentCommentStream = vi.fn();
    mockDesktop({ requestAgentCommentStream });
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
    expect(requestAgentCommentStream).not.toHaveBeenCalled();
    expect(session().model.state).toEqual(secondArticleState);
    expect(session().model.error).toBe('');
    expect(session().model.sending).toBe(false);
  });

  it('resumes the same in-flight state when returning to its article', async () => {
    const reply = deferred<{ author: 'ai'; content: string; createdAt: string }>();
    const requestAgentCommentStream = vi.fn((_payload, _onEvent) => reply.promise);
    mockDesktop({ requestAgentCommentStream });
    const { session, updateArticle, savedReaderChatState } = renderReaderChatSession();
    let submit: Promise<void> | undefined;
    act(() => {
      submit = session().actions.onSubmit('文章一的问题');
    });
    await waitFor(() => expect(requestAgentCommentStream).toHaveBeenCalledOnce());
    const savedState = savedReaderChatState();
    act(() => {
      updateArticle({ ...articleRecord(), id: 'article_2' });
    });
    act(() => {
      requestAgentCommentStream.mock.calls[0][1]({ type: 'delta', delta: '尚未持久化的回答' });
    });
    act(() => {
      updateArticle({ ...articleRecord(), readerChatState: savedState });
    });
    expect(session().model.state?.sessions[0]?.messages[1]?.content).toBe('尚未持久化的回答');
    await act(async () => {
      await session().actions.onSelectAssistant?.('agent_2');
      const duplicateSubmit = session().actions.onSubmit('不应重复发送');
      reply.resolve({ author: 'ai', content: '完整回答', createdAt: now });
      await Promise.all([submit, duplicateSubmit]);
    });
    expect(requestAgentCommentStream).toHaveBeenCalledOnce();
    expect(session().model.selectedAssistantId).toBe('agent_2');
    expect(savedReaderChatState()?.sessions[0]?.messages[1]?.content).toBe('完整回答');
  });

  it('captures article text before saving can yield to navigation', async () => {
    let articleText = '文章一的正文';
    const pendingSave = deferred<void>();
    const save = vi.fn().mockImplementationOnce(() => pendingSave.promise);
    const requestAgentCommentStream = vi.fn().mockResolvedValue({ content: '回答' });
    mockDesktop({ requestAgentCommentStream });
    const { session, updateArticle } = renderReaderChatSession(save, () => articleText);
    let submit: Promise<void> | undefined;
    act(() => {
      submit = session().actions.onSubmit('文章一的问题');
    });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    act(() => {
      articleText = '文章二的正文';
      updateArticle({ ...articleRecord(), id: 'article_2' });
    });
    await act(async () => {
      pendingSave.resolve();
      await submit;
    });
    expect(requestAgentCommentStream.mock.calls[0][0].article).toMatchObject({
      id: 'article_1',
      text: '文章一的正文',
    });
  });

  it('keeps assistant selection changes made while article text is loading', async () => {
    const articleText = deferred<string>();
    mockDesktop({ requestAgentCommentStream: vi.fn().mockResolvedValue({ content: '回答' }) });
    const { session, savedReaderChatState } = renderReaderChatSession(
      undefined,
      () => articleText.promise,
    );
    let submit: Promise<void> | undefined;
    act(() => {
      submit = session().actions.onSubmit('文章一的问题');
    });
    await act(async () => {
      await session().actions.onSelectAssistant?.('agent_2');
      articleText.resolve('文章一的正文');
      await submit;
    });
    expect(savedReaderChatState()?.selectedAssistantId).toBe('agent_2');
    expect(savedReaderChatState()?.sessions[0]?.messages[1]).toMatchObject({
      assistantId: 'agent_1',
      content: '回答',
    });
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

function mockDesktop({
  requestAgentCommentStream,
}: {
  requestAgentCommentStream: ReturnType<typeof vi.fn>;
}) {
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: { agent: { requestCommentStream: requestAgentCommentStream } },
  });
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
