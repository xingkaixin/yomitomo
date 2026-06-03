// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentReadingPlanItem,
  Agent,
  Annotation,
  ArticleRecord,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { createTextAnchor } from '@yomitomo/shared';
import type { PromptArticle } from '../shell/app-reading-types';
import {
  constrainSourceAgentPlanAnnotation,
  type SourceAgentAnnotationAdapter,
  useSourceReaderSession,
} from '../source/bookcase/use-source-reader-session';

const now = '2026-05-25T00:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

const promptArticle: PromptArticle = {
  title: '文章',
  url: 'https://example.com/post',
  text: '第一段内容。第二段内容。',
};

function articleRecord(annotations: Annotation[] = [annotationFor(promptArticle.text, 0, 2)]) {
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
    focusCoReadingPlan: {
      id: 'plan_1',
      articleId: 'article_1',
      selectedAgentIds: [agent.id],
      sections: [],
      readingMemory: {
        textSummaries: [],
        readingTraces: [],
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  } satisfies ArticleRecord;
}

type SourceSession = ReturnType<typeof useSourceReaderSession>;

function renderSession({
  adapter,
  article = articleRecord(),
}: {
  adapter: SourceAgentAnnotationAdapter;
  article?: ArticleRecord;
}) {
  let session: SourceSession | null = null;
  const onSaveArticle = vi.fn();

  function Harness() {
    const nextSession = useSourceReaderSession({
      agents: [storedAgent],
      agentAnnotationAdapter: adapter,
      annotations: article.annotations,
      article,
      onSaveArticle,
      userProfile,
    });
    useEffect(() => {
      session = nextSession;
    });
    return null;
  }

  render(React.createElement(Harness));
  return {
    onSaveArticle,
    session: () => {
      if (!session) throw new Error('session not ready');
      return session;
    },
  };
}

function stubAnnotationStream(
  requestAgentAnnotationsStream: NonNullable<
    typeof window.yomitomoDesktop
  >['requestAgentAnnotationsStream'],
) {
  window.yomitomoDesktop = {
    requestAgentAnnotationsStream,
  } as NonNullable<typeof window.yomitomoDesktop>;
}

function sourceContext() {
  return {
    article: promptArticle,
    articleId: 'article_1',
    articleText: promptArticle.text,
    visibleArticle: true,
  };
}

describe('constrainSourceAgentPlanAnnotation', () => {
  it('keeps annotations inside their reading plan section and applies section intent', () => {
    const articleText = '第一段内容。第二段内容。';
    const annotation = annotationFor(articleText, 6, 10, 'explain');
    const readingPlan: AgentReadingPlanItem[] = [
      {
        sectionId: 'section-1',
        sectionTitle: '第一段',
        sectionStart: 0,
        sectionEnd: 5,
      },
      {
        sectionId: 'section-2',
        sectionTitle: '第二段',
        sectionStart: 6,
        sectionEnd: articleText.length,
        readingIntent: 'challenge',
      },
    ];

    const constrained = constrainSourceAgentPlanAnnotation(annotation, readingPlan, articleText);

    expect(constrained).toMatchObject({
      id: 'annotation-1',
      readingIntent: 'challenge',
      comments: [{ id: 'comment-1', readingIntent: 'challenge' }],
    });
  });

  it('drops annotations outside the reading plan', () => {
    const articleText = '第一段内容。第二段内容。';
    const annotation = annotationFor(articleText, 6, 10);
    const readingPlan: AgentReadingPlanItem[] = [
      {
        sectionId: 'section-1',
        sectionTitle: '第一段',
        sectionStart: 0,
        sectionEnd: 5,
      },
    ];

    expect(constrainSourceAgentPlanAnnotation(annotation, readingPlan, articleText)).toBeNull();
  });
});

describe('useSourceReaderSession agent annotations', () => {
  it('removes the pending agent marker when the source cannot build context', async () => {
    const { session } = renderSession({
      adapter: {
        getContext: () => null,
        onAnnotation: () => true,
      },
    });

    await act(async () => session().addPendingAnnotationAgent('annotation_1', agent));
    await waitFor(() => expect(session().pendingAnnotationAgents.annotation_1).toHaveLength(1));

    await act(async () => {
      await session().requestAgentAnnotations(agent, { pendingAnnotationId: 'annotation_1' });
    });

    await waitFor(() => expect(session().pendingAnnotationAgents.annotation_1).toBeUndefined());
  });

  it('clears a temporary target annotation when the stream fails', async () => {
    stubAnnotationStream(
      vi.fn(async () => {
        throw new Error('stream failed');
      }),
    );
    const { session } = renderSession({
      adapter: {
        getContext: sourceContext,
        onAnnotation: () => true,
      },
    });

    await expect(
      act(async () => {
        await session().requestAgentAnnotations(agent, {
          targetAnchor: createTextAnchor(promptArticle.text, 0, 2),
        });
      }),
    ).rejects.toThrow('stream failed');

    await waitFor(() => {
      expect(session().annotations).toHaveLength(1);
      expect(
        session().annotations.some((annotation) =>
          annotation.comments.some((comment) => comment.pending),
        ),
      ).toBe(false);
    });
  });

  it('saves reading memory only when the request input requires it', async () => {
    const readingMemory = {
      textSummaries: [],
      readingTraces: [],
      updatedAt: now,
    };
    stubAnnotationStream(vi.fn(async () => ({ annotations: [], readingMemory })));
    const onReadingMemory = vi.fn();
    const { session } = renderSession({
      adapter: {
        getContext: sourceContext,
        onAnnotation: () => true,
        onReadingMemory,
      },
    });

    await act(async () => {
      await session().requestAgentAnnotations(agent);
      await session().requestAgentAnnotations(agent, {
        readingPlan: [
          {
            sectionId: 'section_1',
            sectionTitle: '第一段',
            sectionStart: 0,
            sectionEnd: 6,
          },
        ],
      });
    });

    expect(onReadingMemory).toHaveBeenCalledTimes(1);
    expect(onReadingMemory.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ readingMemory }));
  });

  it('notifies the source adapter when the stream returns no accepted annotations', async () => {
    stubAnnotationStream(vi.fn(async () => ({ annotations: [], readingMemory: undefined })));
    const onEmpty = vi.fn();
    const { session } = renderSession({
      adapter: {
        getContext: sourceContext,
        onAnnotation: () => true,
        onEmpty,
      },
    });

    await act(async () => {
      await session().requestAgentAnnotations(agent);
    });

    expect(onEmpty).toHaveBeenCalledWith(
      expect.objectContaining({
        agent,
        context: expect.objectContaining({ articleId: 'article_1' }),
      }),
    );
  });
});

function annotationFor(
  articleText: string,
  start: number,
  end: number,
  readingIntent?: Annotation['readingIntent'],
): Annotation {
  return {
    id: 'annotation-1',
    anchor: createTextAnchor(articleText, start, end),
    author: 'ai',
    color: 'yellow',
    comments: [
      {
        id: 'comment-1',
        author: 'ai',
        content: 'comment',
        createdAt: '2026-05-25T00:00:00.000Z',
      },
    ],
    createdAt: '2026-05-25T00:00:00.000Z',
    readingIntent,
    updatedAt: '2026-05-25T00:00:00.000Z',
  };
}
