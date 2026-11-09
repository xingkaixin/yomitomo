// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleTranslation, ArticleTranslationRequest } from '@yomitomo/shared';
import { extractBilingualTranslationBlocks } from '@yomitomo/core';
import { initializeAppI18n } from '../i18n/app-i18n';
import type { EbookArticleRecord } from '../source/bookcase/app-source-bookcase';
import type { FoliateViewElement } from '../source/ebook/ebook-foliate-view';
import { useEbookBilingualTranslation } from '../source/ebook/use-ebook-bilingual-translation';

const toastMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  complete: vi.fn(),
  progress: vi.fn(() => 1),
  success: vi.fn(),
  updateProgress: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('../shell/app-toast', () => ({ appToast: toastMocks }));

const now = '2026-07-15T12:00:00.000Z';

beforeEach(() => initializeAppI18n('zh-CN'));

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function ebookArticle(): EbookArticleRecord {
  return {
    id: 'ebook-1',
    url: 'file://book.epub',
    canonicalUrl: 'file://book.epub',
    sourceType: 'ebook',
    title: '双语测试',
    byline: '',
    siteName: '',
    contentHtml: '',
    contentHash: 'ebook-hash',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ebook: {
      metadata: { format: 'epub', fileName: 'book.epub', fileSize: 1024 },
      chapters: [
        {
          id: 'chapter-1',
          title: '第一章',
          html: '',
          textLength: 64,
        },
      ],
      index: {
        version: 1,
        articleId: 'ebook-1',
        textLength: 64,
        chapters: [
          {
            id: 'chapter-1',
            title: '第一章',
            indexInBook: 0,
            textStart: 0,
            textEnd: 64,
            textLength: 64,
            previewStart: '',
            previewEnd: '',
            segmentIds: [],
            paragraphIds: [],
          },
        ],
        segments: [],
        paragraphs: [],
      },
    },
  };
}

function foliateView() {
  document.body.innerHTML = '<p>The current chapter keeps its original source text intact.</p>';
  const view = {
    book: { sections: [{ id: 'chapter-1' }] },
    getPageInfo: () => ({ sectionIndex: 0, pageIndex: 0, pageCount: 1 }),
    renderer: { getContents: () => [{ doc: document, index: 0 }] },
  } as unknown as FoliateViewElement;
  return { doc: document, view };
}

function translationFor(
  doc: Document,
  translatedText = '当前章节会保留完整的原文。',
): ArticleTranslation {
  const block = extractBilingualTranslationBlocks(doc.body)[0];
  if (!block) throw new Error('translation source block missing');
  return {
    id: 'translation-1',
    articleId: 'ebook-1',
    sourceId: 'chapter-1',
    sourceContentHash: 'ebook-hash',
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

function installDesktopApi(
  current: ArticleTranslation | null,
  requestedTranslation = translationFor(document, '请求生成的章节译文。'),
) {
  const callbacks: Array<(translation: ArticleTranslation) => void> = [];
  const deleteCurrentArticleTranslation = vi.fn(async () => null);
  const getCurrentArticleTranslation = vi.fn(async () => current);
  const translateArticle = vi.fn(async (_input: ArticleTranslationRequest) => {
    callbacks.forEach((callback) => callback(requestedTranslation));
    return requestedTranslation;
  });
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

type EbookTranslationState = ReturnType<typeof useEbookBilingualTranslation>;

function renderTranslationHook(onLayoutChange = vi.fn()) {
  const result = { current: null as unknown as EbookTranslationState };
  function TranslationProbe({ targetLanguage }: { targetLanguage: string }) {
    result.current = useEbookBilingualTranslation({
      article: ebookArticle(),
      style: 'dashedLine',
      targetLanguage,
      onLayoutChange,
    });
    return result.current.marker;
  }
  // The probe renders outside document.body so the chapter body only holds source text.
  const view = render(<TranslationProbe targetLanguage="zh-CN" />, {
    container: document.createElement('div'),
  });
  return {
    result,
    rerender: ({ targetLanguage }: { targetLanguage: string }) =>
      view.rerender(<TranslationProbe targetLanguage={targetLanguage} />),
  };
}

describe('useEbookBilingualTranslation', () => {
  it('keeps the current chapter language when old translation events arrive', async () => {
    const { doc, view } = foliateView();
    const cached = translationFor(doc);
    const api = installDesktopApi(cached);
    const { result, rerender } = renderTranslationHook();
    act(() => result.current.attachFoliateDocument(view));
    await waitFor(() =>
      expect(doc.querySelector('[data-reader-translation]')?.textContent).toBe(
        '当前章节会保留完整的原文。',
      ),
    );
    api.getCurrentArticleTranslation.mockResolvedValue({
      ...translationFor(doc, 'English chapter'),
      targetLanguage: 'English',
    });
    rerender({ targetLanguage: 'en' });
    await waitFor(() =>
      expect(doc.querySelector('[data-reader-translation]')?.textContent).toBe('English chapter'),
    );
    act(() => api.callbacks.forEach((receive) => receive(cached)));
    expect(doc.querySelector('[data-reader-translation]')?.textContent).toBe('English chapter');
  });

  it('restores the cached translation for the visible EPUB chapter', async () => {
    const { doc, view } = foliateView();
    const cached = translationFor(doc);
    const api = installDesktopApi(cached);
    const { result } = renderTranslationHook();

    act(() => result.current.attachFoliateDocument(view));

    await waitFor(() => {
      expect(doc.querySelector('[data-reader-translation]')?.textContent).toBe(
        '当前章节会保留完整的原文。',
      );
    });
    expect(api.getCurrentArticleTranslation).toHaveBeenCalledWith({
      articleId: 'ebook-1',
      sourceId: 'chapter-1',
      targetLanguage: 'zh-CN',
    });
    expect(doc.querySelector('p')?.textContent).toBe(
      'The current chapter keeps its original source text intact.',
    );
  });
});
