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

  function Harness() {
    const [article, setArticle] = useState<ArticleRecord>(() => articleRecord());
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
});

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
