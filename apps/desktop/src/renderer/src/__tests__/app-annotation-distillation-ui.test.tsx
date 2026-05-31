// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Annotation, ArticleRecord } from '@yomitomo/shared';
import { AnnotationDiscussionWindowApp } from '../app-annotation-discussion-window';
import { AnnotationSedimentationWindowApp } from '../app-annotation-sedimentation-window';

const now = '2026-05-31T06:00:00.000Z';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.history.replaceState({}, '', '/');
  vi.clearAllMocks();
});

describe('annotation distillation UI', () => {
  it('uses the explicit distillation entry copy before publishing', async () => {
    installDesktopApi(article(annotation()));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationDiscussionWindowApp />);

    expect(await screen.findByRole('button', { name: /把这些想法沉淀下来/ })).toBeTruthy();
    expect(screen.queryByText('开始沉淀')).toBeNull();
  });

  it('labels an unpublished distillation draft as draft', async () => {
    installDesktopApi(article(annotation()));
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    expect(await screen.findByText('沉淀稿')).toBeTruthy();
    expect(screen.getByText('草稿')).toBeTruthy();
    expect(screen.queryByText('已发布')).toBeNull();
  });

  it('labels a published distillation as published', async () => {
    installDesktopApi(
      article(
        annotation({
          distillation: {
            status: 'published',
            content: '已经发布的沉淀',
            publishedAt: now,
          },
        }),
      ),
    );
    window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');

    render(<AnnotationSedimentationWindowApp />);

    expect(await screen.findByText('已发布')).toBeTruthy();
    expect(screen.queryByText('草稿')).toBeNull();
  });
});

function installDesktopApi(sourceArticle: ArticleRecord) {
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      getArticle: vi.fn().mockResolvedValue(sourceArticle),
      getState: vi.fn().mockResolvedValue({ agents: agents() }),
    },
  });
}

function article(sourceAnnotation: Annotation): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '测试文章',
    byline: '作者',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [sourceAnnotation],
    createdAt: now,
    updatedAt: now,
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '值得讨论的一段划线',
      prefix: '',
      suffix: '',
      start: 0,
      end: 8,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function agents(): Agent[] {
  return [
    {
      id: 'agent_1',
      kind: 'annotation',
      providerId: 'provider_1',
      nickname: '周现',
      username: 'zhou',
      avatar: '',
      annotationColor: '#f4c95d',
      annotationDensity: 'medium',
      temperature: 0.5,
      soul: '',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
