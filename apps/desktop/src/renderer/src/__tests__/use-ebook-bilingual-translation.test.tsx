// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleTranslation, ArticleTranslationRequest } from '@yomitomo/shared';
import { extractBilingualTranslationBlocks } from '@yomitomo/core';
import { initializeAppI18n } from '../i18n/app-i18n';
import type { EbookArticleRecord } from '../source/bookcase/app-source-bookcase-shared';
import type { FoliateViewElement } from '../source/ebook/app-ebook-reader-utils';
import {
  runWhenEbookSelectionSettles,
  useEbookBilingualTranslation,
} from '../source/ebook/use-ebook-bilingual-translation';

const toastMocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  error: vi.fn(),
  info: vi.fn(() => 'translation-toast'),
  success: vi.fn(),
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

function translationFor(doc: Document, translatedText = '当前章节会保留完整的原文。') {
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

function installDesktopApi(current: ArticleTranslation | null) {
  const callbacks: Array<(translation: ArticleTranslation) => void> = [];
  const getCurrentArticleTranslation = vi.fn(async () => current);
  const translateArticle = vi.fn(async (_input: ArticleTranslationRequest) => {
    const result = translationFor(document, '请求生成的章节译文。');
    callbacks.forEach((callback) => callback(result));
    return result;
  });
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
  return { getCurrentArticleTranslation, translateArticle };
}

function renderTranslationHook(onLayoutChange = vi.fn()) {
  return renderHook(() =>
    useEbookBilingualTranslation({
      article: ebookArticle(),
      style: 'dashedLine',
      targetLanguage: 'zh-CN',
      onLayoutChange,
    }),
  );
}

describe('useEbookBilingualTranslation', () => {
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

  it('sends only current-chapter source blocks when translation is confirmed', async () => {
    const { doc, view } = foliateView();
    const api = installDesktopApi(null);
    const { result } = renderTranslationHook();
    act(() => result.current.attachFoliateDocument(view));
    await waitFor(() => expect(result.current.toolbar).not.toBeNull());

    const dialog = result.current.dialog as React.ReactElement<{
      onConfirm: (action: 'translate') => Promise<void>;
    }>;
    await act(() => dialog.props.onConfirm('translate'));

    expect(api.translateArticle).toHaveBeenCalledWith({
      articleId: 'ebook-1',
      force: false,
      sourceBlockIds: undefined,
      sourceBlocks: [
        {
          id: expect.stringMatching(/^block_1_/),
          text: 'The current chapter keeps its original source text intact.',
        },
      ],
      sourceId: 'chapter-1',
      targetLanguage: 'zh-CN',
    });
    expect(doc.querySelector('[data-reader-translation]')?.textContent).toBe(
      '请求生成的章节译文。',
    );
  });

  it('defers DOM mutation until the source selection collapses', () => {
    const { doc } = foliateView();
    const text = doc.querySelector('p')?.firstChild;
    if (!text) throw new Error('source text missing');
    const range = doc.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    doc.getSelection()?.addRange(range);
    const mutation = vi.fn();

    const cleanupSelectionListener = runWhenEbookSelectionSettles(doc, mutation);
    expect(mutation).not.toHaveBeenCalled();

    doc.getSelection()?.removeAllRanges();
    doc.dispatchEvent(new Event('selectionchange'));
    expect(mutation).toHaveBeenCalledOnce();
    cleanupSelectionListener();
  });
});
