// @vitest-environment jsdom

import React, { useEffect, useLayoutEffect, useState } from 'react';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { useSourceAnnotations } from '../source/bookcase/use-source-annotations';

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function article(overrides: Partial<WebArticleRecord> = {}): WebArticleRecord {
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
    author: {
      kind: 'user',
      userId: userProfile.id,
      username: userProfile.username,
      nickname: userProfile.nickname,
    },
    color: userProfile.annotationColor,
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function HookProbe({
  annotationAgents = [],
  articleRecord,
  onApi,
  onArticleChange,
  onBeforeDeleteAnnotation,
  onCommentSaved,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotation,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onAnnotationsApplied,
  onAnnotationsSaved,
}: {
  annotationAgents?: PublicAgent[];
  articleRecord: ArticleRecord;
  onApi: (api: SourceAnnotationsApi) => void;
  onArticleChange?: (article: ArticleRecord) => void;
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
  onSaveArticleAnnotation?: Parameters<typeof useSourceAnnotations>[0]['onSaveArticleAnnotation'];
  onSaveArticleComment?: Parameters<typeof useSourceAnnotations>[0]['onSaveArticleComment'];
  onAnnotationsApplied?: Parameters<typeof useSourceAnnotations>[0]['onAnnotationsApplied'];
  onAnnotationsSaved?: Parameters<typeof useSourceAnnotations>[0]['onAnnotationsSaved'];
}) {
  const [ownedArticle, setOwnedArticle] = useState(articleRecord);
  useLayoutEffect(() => setOwnedArticle(articleRecord), [articleRecord]);
  const api = useSourceAnnotations({
    annotationAgents,
    annotations: ownedArticle.annotations,
    article: ownedArticle,
    onArticleChange: (nextArticle) => {
      setOwnedArticle(nextArticle);
      onArticleChange?.(nextArticle);
    },
    onBeforeDeleteAnnotation,
    onCommentSaved,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onOpenAnnotation,
    onSaveArticleAnnotation,
    onSaveArticleComment,
    onAnnotationsApplied,
    onAnnotationsSaved,
    userProfile,
  });

  useEffect(() => {
    onApi(api);
  });

  return (
    <>
      <output data-testid="annotations">{api.annotations.map((item) => item.id).join(',')}</output>
      <output data-testid="comment-count">
        {api.annotations.reduce((count, item) => count + item.comments.length, 0)}
      </output>
    </>
  );
}

describe('useSourceAnnotations', () => {
  it.each(['navigation', 'unmount'] as const)(
    'does not apply a saved annotation after %s',
    async (exit) => {
      let completeSave!: () => void;
      const pending = new Promise<void>((resolve) => {
        completeSave = resolve;
      });
      const onArticleChange = vi.fn();
      const onAnnotationsSaved = vi.fn();
      const onSaveArticleAnnotation = vi.fn(() => pending);
      const { result, rerender, unmount } = renderHook(
        ({ record }) =>
          useSourceAnnotations({
            article: record,
            annotations: record.annotations,
            userProfile,
            onArticleChange,
            onAnnotationsSaved,
            onSaveArticleAnnotation,
          }),
        { initialProps: { record: article() } },
      );
      let saving!: Promise<void>;
      act(() => {
        saving = result.current.saveAnnotation(annotation('annotation_a'));
      });
      if (exit === 'navigation') rerender({ record: article({ id: 'article_2' }) });
      else unmount();
      await act(async () => {
        completeSave();
        await saving;
      });
      expect(onSaveArticleAnnotation).toHaveBeenCalledWith(
        'article_1',
        expect.anything(),
        expect.any(String),
      );
      expect(onArticleChange).not.toHaveBeenCalled();
      expect(onAnnotationsSaved).not.toHaveBeenCalled();
    },
  );

  it('merges completion into the latest article after returning to its owner', async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const onArticleChange = vi.fn();
    const saved = annotation('saved');
    const external = annotation('external');
    const { result, rerender } = renderHook(
      ({ record }) =>
        useSourceAnnotations({
          article: record,
          annotations: record.annotations,
          userProfile,
          onArticleChange,
          onSaveArticleAnnotation: () => pending,
        }),
      { initialProps: { record: article() } },
    );
    let saving!: Promise<void>;
    act(() => {
      saving = result.current.saveAnnotation(saved);
    });
    rerender({ record: article({ id: 'article_2' }) });
    rerender({ record: article({ title: 'Latest title', annotations: [external] }) });
    await act(async () => {
      complete();
      await saving;
    });
    expect(onArticleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'article_1',
        title: 'Latest title',
        annotations: expect.arrayContaining([external, saved]),
      }),
    );
  });

  it('does not apply an annotation when persistence fails', async () => {
    let api: SourceAnnotationsApi | null = null;
    const onSaveArticleAnnotation = vi.fn(() => Promise.reject(new Error('save failed')));
    const target = annotation('question_1');

    render(
      <HookProbe
        articleRecord={article()}
        onApi={(nextApi) => {
          api = nextApi;
        }}
        onSaveArticleAnnotation={onSaveArticleAnnotation}
      />,
    );

    await act(async () => {
      await expect(api?.saveAnnotation(target)).rejects.toThrow('save failed');
    });

    expect(screen.getByTestId('annotations').textContent).toBe('');
  });
});
