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
  const deleteCurrentArticleTranslation = vi.fn(async () => null);
  const getCurrentArticleTranslation = vi.fn(async () => current);
  const translateArticle = vi.fn(async () => translationFor('请求生成的文章译文。'));
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      article: {
        translation: {
          deleteCurrent: deleteCurrentArticleTranslation,
          getCurrent: getCurrentArticleTranslation,
          onUpdated: (callback: (translation: ArticleTranslation) => void) => {
            callbacks.push(callback);
            return () => callbacks.splice(callbacks.indexOf(callback), 1);
          },
          translate: translateArticle,
        },
      },
    },
  });
  return {
    callbacks,
    deleteCurrentArticleTranslation,
    getCurrentArticleTranslation,
    translateArticle,
  };
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
  const hook = renderHook(
    ({ targetLanguage }) =>
      useWebBilingualTranslation({
        annotations,
        article: webArticle(),
        articleRef,
        contentHtml,
        deleteAnnotation,
        scrollRef,
        style: 'dashedLine',
        targetLanguage,
      }),
    { initialProps: { targetLanguage: 'zh-CN' } },
  );
  return { ...hook, articleElement };
}

function renderedTranslationText(html: string) {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.querySelector('[data-reader-translation]')?.textContent;
}

describe('useWebBilingualTranslation', () => {
  it.each([
    ['keeps', 'before', 0],
    ['removes', 'after', 1],
  ] as const)(
    '%s translation annotations when retranslation fails %s it starts',
    async (_outcome, failurePoint, deletedCount) => {
      const cached = translationFor();
      const api = installDesktopApi(cached);
      const blockId = cached.segments[0]?.sourceBlockId;
      const annotation: Annotation = {
        id: 'annotation-1',
        anchor: { exact: '你好', prefix: '', suffix: '', start: 0, end: 2, segmentId: blockId },
        author: { kind: 'user', username: 'reader' },
        color: 'yellow',
        comments: [],
        createdAt: now,
        updatedAt: now,
      };
      const deleteAnnotation = vi.fn(async () => {});
      api.translateArticle.mockImplementationOnce(async () => {
        if (failurePoint === 'after') {
          api.callbacks.forEach((receive) => receive({ ...cached, status: 'translating' }));
        }
        throw new Error('TRANSLATION_FAILED');
      });
      const { result } = renderTranslationHook({ annotations: [annotation], deleteAnnotation });
      await waitFor(() =>
        expect(renderedTranslationText(result.current.renderedHtml)).toBeDefined(),
      );

      const dialog = result.current.dialog as React.ReactElement<{
        onConfirm: (action: 'retranslate') => Promise<void>;
      }>;
      await act(() => dialog.props.onConfirm('retranslate'));

      expect(deleteAnnotation).toHaveBeenCalledTimes(deletedCount);
    },
  );

  it.each([
    ['en', 'English'],
    ['ja', '日本語'],
  ])(
    'ignores old-language events after switching to %s',
    async (targetLanguage, canonicalLanguage) => {
      const api = installDesktopApi(translationFor());
      const { result, rerender } = renderTranslationHook();
      await waitFor(() =>
        expect(renderedTranslationText(result.current.renderedHtml)).toBe(
          '你好世界，这一段应该被翻译。',
        ),
      );
      const current = {
        ...translationFor('Current translation'),
        targetLanguage: canonicalLanguage,
      };
      api.getCurrentArticleTranslation.mockResolvedValue(current);
      rerender({ targetLanguage });
      await waitFor(() =>
        expect(renderedTranslationText(result.current.renderedHtml)).toBe('Current translation'),
      );
      act(() => api.callbacks.forEach((receive) => receive(translationFor('迟到的中文译文'))));
      expect(renderedTranslationText(result.current.renderedHtml)).toBe('Current translation');
      act(() =>
        api.callbacks.forEach((receive) =>
          receive({
            ...translationFor('Updated current translation'),
            targetLanguage: canonicalLanguage,
          }),
        ),
      );
      expect(renderedTranslationText(result.current.renderedHtml)).toBe(
        'Updated current translation',
      );
    },
  );
});
