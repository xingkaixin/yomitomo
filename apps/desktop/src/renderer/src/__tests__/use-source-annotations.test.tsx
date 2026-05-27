// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { useSourceAnnotations } from '../use-source-annotations';

type SourceAnnotationsApi = ReturnType<typeof useSourceAnnotations>;

const now = '2026-05-16T08:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

const lin: PublicAgent = {
  id: 'agent_lin',
  kind: 'annotation',
  enabled: true,
  nickname: 'lin',
  username: 'lin',
  avatar: '',
  annotationColor: '#8a8f4f',
  annotationDensity: 'medium',
  personalityName: 'Lin',
  temperature: 0.4,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '网页文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function comment(overrides: Partial<AnnotationComment> = {}): AnnotationComment {
  return {
    id: 'comment_1',
    author: 'user',
    content: '为什么?',
    createdAt: now,
    userId: userProfile.id,
    userUsername: userProfile.username,
    userNickname: userProfile.nickname,
    userAvatar: userProfile.avatar,
    userAnnotationColor: userProfile.annotationColor,
    ...overrides,
  };
}

function annotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    anchor: {
      exact: `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 8,
    },
    author: 'user',
    color: userProfile.annotationColor,
    comments: [],
    createdAt: now,
    updatedAt: now,
    userId: userProfile.id,
    userUsername: userProfile.username,
    userNickname: userProfile.nickname,
    ...overrides,
  };
}

function HookProbe({
  annotationAgents = [],
  articleRecord,
  ignoreStaleArticleUpdates = false,
  onApi,
  onBeforeDeleteAnnotation,
  onCommentSaved,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotation,
  onSaveArticle = vi.fn(),
  onAnnotationsApplied,
  onAnnotationsSaved,
}: {
  annotationAgents?: PublicAgent[];
  articleRecord: ArticleRecord;
  ignoreStaleArticleUpdates?: boolean;
  onApi: (api: SourceAnnotationsApi) => void;
  onBeforeDeleteAnnotation?: (annotationId: string) => void;
  onCommentSaved?: (result: {
    annotation: Annotation;
    comment: AnnotationComment;
    mentionedAgents: PublicAgent[];
  }) => void;
  onDeleteArticleAnnotation?: Parameters<
    typeof useSourceAnnotations
  >[0]['onDeleteArticleAnnotation'];
  onDeleteArticleComment?: Parameters<typeof useSourceAnnotations>[0]['onDeleteArticleComment'];
  onOpenAnnotation?: (annotationId: string) => void;
  onSaveArticle?: (article: ArticleRecord) => Promise<void> | void;
  onAnnotationsApplied?: Parameters<typeof useSourceAnnotations>[0]['onAnnotationsApplied'];
  onAnnotationsSaved?: Parameters<typeof useSourceAnnotations>[0]['onAnnotationsSaved'];
}) {
  const api = useSourceAnnotations({
    annotationAgents,
    annotations: articleRecord.annotations,
    article: articleRecord,
    ignoreStaleArticleUpdates,
    onBeforeDeleteAnnotation,
    onCommentSaved,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onOpenAnnotation,
    onSaveArticle,
    onAnnotationsApplied,
    onAnnotationsSaved,
    userProfile,
  });

  useEffect(() => {
    onApi(api);
  });

  return (
    <output data-testid="annotations">{api.annotations.map((item) => item.id).join(',')}</output>
  );
}

describe('useSourceAnnotations', () => {
  it('saves and applies sorted annotations through the shared refs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'));

    let api: SourceAnnotationsApi | null = null;
    const onSaveArticle = vi.fn();
    const onAnnotationsApplied = vi.fn();
    const onAnnotationsSaved = vi.fn();
    const later = annotation('later', {
      anchor: { exact: 'later', prefix: '', suffix: '', start: 20, end: 25 },
    });
    const earlier = annotation('earlier', {
      anchor: { exact: 'earlier', prefix: '', suffix: '', start: 2, end: 9 },
    });

    render(
      <HookProbe
        articleRecord={article()}
        onApi={(nextApi) => {
          api = nextApi;
        }}
        onSaveArticle={onSaveArticle}
        onAnnotationsApplied={onAnnotationsApplied}
        onAnnotationsSaved={onAnnotationsSaved}
      />,
    );

    await act(async () => {
      await api?.saveAnnotations([later, earlier]);
    });

    expect(screen.getByTestId('annotations').textContent).toBe('earlier,later');
    expect(onSaveArticle).toHaveBeenCalledWith(
      expect.objectContaining({ annotations: [earlier, later] }),
    );
    expect(onAnnotationsSaved).toHaveBeenCalledWith(
      expect.objectContaining({ previousAnnotations: [], nextAnnotations: [earlier, later] }),
    );

    act(() => {
      api?.applyAnnotations([later]);
    });

    expect(screen.getByTestId('annotations').textContent).toBe('later');
    expect(onSaveArticle).toHaveBeenCalledTimes(1);
    expect(onAnnotationsApplied).toHaveBeenCalledWith(
      expect.objectContaining({ previousAnnotations: [earlier, later], nextAnnotations: [later] }),
    );
  });

  it('adds comments while preserving mention callbacks', async () => {
    let api: SourceAnnotationsApi | null = null;
    const onCommentSaved = vi.fn();
    const onOpenAnnotation = vi.fn();
    const onSaveArticle = vi.fn();
    const question = annotation('question_1', {
      annotationType: 'question',
      comments: [comment()],
    });

    render(
      <HookProbe
        annotationAgents={[lin]}
        articleRecord={article({ annotations: [question] })}
        onApi={(nextApi) => {
          api = nextApi;
        }}
        onCommentSaved={onCommentSaved}
        onOpenAnnotation={onOpenAnnotation}
        onSaveArticle={onSaveArticle}
      />,
    );

    await act(async () => {
      await api?.addComment('question_1', '回答 @lin');
    });

    const savedArticle = onSaveArticle.mock.calls[0][0] as ArticleRecord;
    const savedAnnotation = savedArticle.annotations[0];
    expect(savedAnnotation.comments.at(-1)?.content).toBe('回答 @lin');
    expect(onOpenAnnotation).toHaveBeenCalledWith('question_1');
    expect(onCommentSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        annotation: expect.objectContaining({ id: 'question_1' }),
        comment: expect.objectContaining({ content: '回答 @lin' }),
        mentionedAgents: [lin],
      }),
    );
  });

  it('delegates delete cleanup', async () => {
    let api: SourceAnnotationsApi | null = null;
    const onBeforeDeleteAnnotation = vi.fn();
    const onDeleteArticleAnnotation = vi.fn();
    const onSaveArticle = vi.fn();
    const target = annotation('question_1', {
      comments: [comment({ id: 'comment_1' })],
    });

    render(
      <HookProbe
        articleRecord={article({ annotations: [target] })}
        onApi={(nextApi) => {
          api = nextApi;
        }}
        onBeforeDeleteAnnotation={onBeforeDeleteAnnotation}
        onDeleteArticleAnnotation={onDeleteArticleAnnotation}
        onSaveArticle={onSaveArticle}
      />,
    );

    await act(async () => {
      await api?.deleteAnnotation('question_1');
    });

    expect(onBeforeDeleteAnnotation).toHaveBeenCalledWith('question_1');
    expect(onDeleteArticleAnnotation).toHaveBeenCalledWith('article_1', 'question_1');
    expect(onSaveArticle).not.toHaveBeenCalled();
    expect(screen.getByTestId('annotations').textContent).toBe('');
  });

  it('deletes a comment thread while keeping the annotation', async () => {
    let api: SourceAnnotationsApi | null = null;
    const onDeleteArticleComment = vi.fn();
    const onOpenAnnotation = vi.fn();
    const onSaveArticle = vi.fn();
    const target = annotation('question_1', {
      comments: [
        comment({ id: 'thought_1', content: '第一条想法' }),
        comment({ id: 'reply_1', content: '回复', replyTo: 'thought_1' }),
        comment({ id: 'thought_2', content: '第二条想法' }),
      ],
    });

    render(
      <HookProbe
        articleRecord={article({ annotations: [target] })}
        onApi={(nextApi) => {
          api = nextApi;
        }}
        onDeleteArticleComment={onDeleteArticleComment}
        onOpenAnnotation={onOpenAnnotation}
        onSaveArticle={onSaveArticle}
      />,
    );

    await act(async () => {
      await api?.deleteComment('question_1', 'thought_1');
    });

    expect(onDeleteArticleComment).toHaveBeenCalledWith('article_1', 'question_1', 'thought_1');
    expect(onSaveArticle).not.toHaveBeenCalled();
    expect(screen.getByTestId('annotations').textContent).toBe('question_1');
    expect(onOpenAnnotation).toHaveBeenCalledWith('question_1');
  });

  it('can ignore stale incoming article annotations after local apply', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'));

    let api: SourceAnnotationsApi | null = null;
    const initialArticle = article({ updatedAt: '2026-05-16T10:00:00.000Z' });
    const localAnnotation = annotation('local');
    const { rerender } = render(
      <HookProbe
        articleRecord={initialArticle}
        ignoreStaleArticleUpdates
        onApi={(nextApi) => {
          api = nextApi;
        }}
      />,
    );

    act(() => {
      api?.applyAnnotations([localAnnotation]);
    });

    rerender(
      <HookProbe
        articleRecord={article({ updatedAt: '2026-05-16T10:30:00.000Z', annotations: [] })}
        ignoreStaleArticleUpdates
        onApi={(nextApi) => {
          api = nextApi;
        }}
      />,
    );

    expect(screen.getByTestId('annotations').textContent).toBe('local');
  });

  it('does not replace local annotations with equal timestamp incoming article updates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-16T12:00:00.000Z'));

    let api: SourceAnnotationsApi | null = null;
    const initialArticle = article({ updatedAt: '2026-05-16T10:00:00.000Z' });
    const localAnnotation = annotation('local');
    const { rerender } = render(
      <HookProbe
        articleRecord={initialArticle}
        ignoreStaleArticleUpdates
        onApi={(nextApi) => {
          api = nextApi;
        }}
      />,
    );

    act(() => {
      api?.applyAnnotations([localAnnotation]);
    });

    rerender(
      <HookProbe
        articleRecord={article({ updatedAt: '2026-05-16T12:00:00.000Z', annotations: [] })}
        ignoreStaleArticleUpdates
        onApi={(nextApi) => {
          api = nextApi;
        }}
      />,
    );

    expect(screen.getByTestId('annotations').textContent).toBe('local');
  });
});
