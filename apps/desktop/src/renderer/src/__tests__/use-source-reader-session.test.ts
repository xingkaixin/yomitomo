// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import { useSourceReaderSession } from '../source/bookcase/use-source-reader-session';

const now = '2026-05-25T00:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const agent: PublicAgent = {
  id: 'agent_lin',
  kind: 'annotation',
  presetId: 'lin',
  enabled: true,
  nickname: 'lin',
  username: 'lin',
  avatar: '',
  annotationColor: '#8a8f4f',
  annotationDensity: 'medium',
  temperature: 0.4,
  personalityName: 'Lin',
};

const storedAgent: Agent = {
  ...agent,
  providerId: 'provider_1',
  soul: 'soul',
  createdAt: now,
  updatedAt: now,
};

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

const articleText = '第一段内容。第二段内容。';

function articleRecord(annotations: Annotation[] = [annotationFor(articleText, 0, 2)]) {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '文章',
    contentHtml: '<p>第一段内容。第二段内容。</p>',
    contentHash: 'hash_1',
    annotations,
    createdAt: now,
    updatedAt: now,
  } satisfies ArticleRecord;
}

type SourceSession = ReturnType<typeof useSourceReaderSession>;

function renderSession({
  article = articleRecord(),
  onBeforeDeleteAnnotation = vi.fn(),
  onDeleteArticleAnnotation = vi.fn(),
}: {
  article?: ArticleRecord;
  onBeforeDeleteAnnotation?: (annotationId: string) => void;
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
}) {
  let session: SourceSession | null = null;

  function Harness({ currentArticle }: { currentArticle: ArticleRecord }) {
    const nextSession = useSourceReaderSession({
      agents: [storedAgent],
      annotations: currentArticle.annotations,
      article: currentArticle,
      clearPendingOnArticleChange: true,
      clearPendingOnDeleteAnnotation: true,
      onArticleChange: vi.fn(),
      onBeforeDeleteAnnotation,
      onDeleteArticleAnnotation,
      userProfile,
    });
    useEffect(() => {
      session = nextSession;
    });
    return null;
  }

  const view = render(React.createElement(Harness, { currentArticle: article }));
  return {
    rerenderArticle: (currentArticle: ArticleRecord) =>
      view.rerender(React.createElement(Harness, { currentArticle })),
    session: () => {
      if (!session) throw new Error('session not ready');
      return session;
    },
  };
}

describe('useSourceReaderSession pending agents', () => {
  it('applies each declared pending-state cleanup policy', async () => {
    const onBeforeDeleteAnnotation = vi.fn();
    const onDeleteArticleAnnotation = vi.fn();
    const { rerenderArticle, session } = renderSession({
      onBeforeDeleteAnnotation,
      onDeleteArticleAnnotation,
    });

    await act(async () => session().addPendingAnnotationAgent('annotation-1', agent));
    await act(async () => session().deleteAnnotation('annotation-1'));

    await waitFor(() => expect(session().pendingAnnotationAgents['annotation-1']).toBeUndefined());
    expect(onBeforeDeleteAnnotation).toHaveBeenCalledWith('annotation-1');
    expect(onDeleteArticleAnnotation).toHaveBeenCalledWith('article_1', 'annotation-1');

    await act(async () => session().addPendingAnnotationAgent('annotation-2', agent));
    rerenderArticle({ ...articleRecord(), id: 'article_2' });

    await waitFor(() => expect(session().pendingAnnotationAgents).toEqual({}));
  });
});

function annotationFor(text: string, start: number, end: number): Annotation {
  return {
    id: 'annotation-1',
    anchor: createTextAnchor(text, start, end),
    author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
    color: 'yellow',
    comments: [
      {
        id: 'comment-1',
        author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
        content: 'comment',
        createdAt: '2026-05-25T00:00:00.000Z',
      },
    ],
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
  };
}
