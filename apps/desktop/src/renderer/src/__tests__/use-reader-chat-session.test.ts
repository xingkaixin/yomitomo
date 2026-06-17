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

function renderReaderChatSession() {
  let session: ReaderChatSession | null = null;
  let updateArticle: React.Dispatch<React.SetStateAction<ArticleRecord>> | null = null;

  function Harness() {
    const [article, setArticle] = useState<ArticleRecord>(() => articleRecord());
    updateArticle = setArticle;
    const nextSession = useReaderChatSession({
      agents,
      article,
      getArticleText: () => '这是一段可以提问的正文。',
      onSaveArticleReaderChatState: (_articleId, readerChatState?: ReaderChatState) => {
        setArticle((current) => ({
          ...current,
          readerChatState,
          updatedAt: now,
        }));
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

    act(() => {
      session().actions.onSelectAssistant?.('agent_2');
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

  it('resets sending and keeps a failed assistant message when the request rejects', async () => {
    mockDesktop({
      requestAgentCommentStream: vi.fn(() => Promise.reject(new Error('network failed'))),
    });
    const { session } = renderReaderChatSession();

    await act(async () => {
      await session().actions.onSubmit('会失败吗？');
    });

    await waitFor(() => expect(session().model.sending).toBe(false));
    expect(session().model.state?.sessions[0]?.messages).toEqual([
      expect.objectContaining({ role: 'user', content: '会失败吗？' }),
      expect.objectContaining({ role: 'assistant', content: expect.stringContaining('请求失败') }),
    ]);
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
});

function mockDesktop({
  requestAgentCommentStream,
}: {
  requestAgentCommentStream: ReturnType<typeof vi.fn>;
}) {
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: { requestAgentCommentStream },
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
