// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, ArticleTranslation } from '@yomitomo/shared';
import { extractWebArticleTranslationBlocks } from '@yomitomo/core';
import { initializeAppI18n } from '../i18n/app-i18n';
import { useWebBilingualTranslation } from '../source/web/use-web-bilingual-translation';

const toastMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  info: vi.fn(() => 'translation-toast'),
  update: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../shell/app-toast', () => ({ appToast: toastMocks }));

const now = '2026-07-18T12:00:00.000Z';
const contentHtml = '<p>Hello world, this paragraph should be translated.</p>';

beforeEach(() => initializeAppI18n('zh-CN'));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
  vi.useRealTimers();
});

function webArticle(): ArticleRecord {
  return {
    id: 'article-1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    sourceType: 'web',
    title: 'Translation test',
    byline: '',
    siteName: 'Example',
    contentHtml,
    contentHash: 'article-hash',
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

function translationFor(translatedText = '你好世界，这一段应该被翻译。') {
  const block = extractWebArticleTranslationBlocks(document, contentHtml)[0];
  if (!block) throw new Error('translation source block missing');
  return {
    id: 'translation-1',
    articleId: 'article-1',
    sourceId: 'article',
    sourceContentHash: 'article-hash',
    targetLanguage: '简体中文',
    promptVersion: 1,
    providerId: 'provider-1',
    providerName: 'Provider',
    modelName: 'model',
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    segments: [
      {
        id: 'segment-1',
        translationId: 'translation-1',
        sourceBlockId: block.id,
        sourceTextHash: block.textHash,
        sourceText: block.text,
        translatedText,
        status: 'ready',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  } satisfies ArticleTranslation;
}

function installDesktopApi(current: ArticleTranslation | null) {
  const callbacks: Array<(translation: ArticleTranslation) => void> = [];
  const getCurrentArticleTranslation = vi.fn(async () => current);
  const translateArticle = vi.fn(async () => translationFor('请求生成的文章译文。'));
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      deleteCurrentArticleTranslation: vi.fn(async () => null),
      getCurrentArticleTranslation,
      onArticleTranslationUpdated: (callback: (translation: ArticleTranslation) => void) => {
        callbacks.push(callback);
        return () => callbacks.splice(callbacks.indexOf(callback), 1);
      },
      translateArticle,
    } as Partial<typeof window.yomitomoDesktop>,
  });
  return { callbacks, getCurrentArticleTranslation, translateArticle };
}

function renderTranslationHook({
  annotations = [],
  deleteAnnotation = vi.fn(async () => {}),
}: {
  annotations?: Annotation[];
  deleteAnnotation?: (annotationId: string) => Promise<void>;
} = {}) {
  const articleElement = document.createElement('article');
  articleElement.innerHTML = `<div class="reader-article-body">${contentHtml}</div>`;
  const scrollElement = document.createElement('div');
  const articleRef = { current: articleElement };
  const scrollRef = { current: scrollElement };
  document.body.append(scrollElement, articleElement);
  return renderHook(() =>
    useWebBilingualTranslation({
      annotations,
      article: webArticle(),
      articleRef,
      contentHtml,
      deleteAnnotation,
      scrollRef,
      style: 'dashedLine',
      targetLanguage: 'zh-CN',
    }),
  );
}

function renderedTranslationText(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.querySelector('[data-reader-translation]')?.textContent;
}

describe('useWebBilingualTranslation', () => {
  it('restores and renders the cached article translation', async () => {
    const cached = translationFor();
    const api = installDesktopApi(cached);
    const { result } = renderTranslationHook();

    await waitFor(() => {
      expect(renderedTranslationText(result.current.renderedHtml)).toBe(
        '你好世界，这一段应该被翻译。',
      );
    });
    expect(api.getCurrentArticleTranslation).toHaveBeenCalledWith({
      articleId: 'article-1',
      targetLanguage: 'zh-CN',
    });
  });

  it('defers subscription updates until the selection gesture finishes', async () => {
    vi.useFakeTimers();
    const api = installDesktopApi(null);
    const { result } = renderTranslationHook();
    await act(async () => Promise.resolve());

    act(() => {
      result.current.selection.start('pointerdown');
      api.callbacks[0]?.(translationFor());
    });
    expect(renderedTranslationText(result.current.renderedHtml)).toBeUndefined();

    act(() => {
      result.current.selection.finish('pointerup');
      vi.runOnlyPendingTimers();
    });
    expect(renderedTranslationText(result.current.renderedHtml)).toBe(
      '你好世界，这一段应该被翻译。',
    );
  });

  it('requests translation through the confirmation interface', async () => {
    const api = installDesktopApi(null);
    const { result } = renderTranslationHook();
    await waitFor(() => expect(api.getCurrentArticleTranslation).toHaveBeenCalledOnce());

    const toolbar = result.current.toolbar as React.ReactElement<{
      onConfirm: (action: 'translate') => void;
    }>;
    act(() => toolbar.props.onConfirm('translate'));
    const dialog = result.current.dialog as React.ReactElement<{
      onConfirm: (action: 'translate') => Promise<void>;
    }>;
    await act(() => dialog.props.onConfirm('translate'));

    expect(api.translateArticle).toHaveBeenCalledWith({
      articleId: 'article-1',
      force: false,
      sourceBlockIds: undefined,
      targetLanguage: 'zh-CN',
    });
    expect(renderedTranslationText(result.current.renderedHtml)).toBe('请求生成的文章译文。');
  });
});
