// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  articleHtmlWithBilingualTranslation,
  createTranslationTextAnchor,
  extractWebArticleTranslationBlocks,
  rangeForTranslationTextAnchor,
  sourceTextContent,
  translationElementForRange,
} from './article-translation';
import type { ArticleTranslation } from '@yomitomo/shared';

function translationForBlock(
  block: ReturnType<typeof extractWebArticleTranslationBlocks>[number],
  patch: Partial<ArticleTranslation['segments'][number]>,
): ArticleTranslation {
  return {
    id: 'translation_1',
    articleId: 'article_1',
    sourceContentHash: 'hash',
    targetLanguage: '简体中文',
    promptVersion: 1,
    status: 'translating',
    segments: [
      {
        id: 'segment_1',
        translationId: 'translation_1',
        sourceBlockId: block.id,
        sourceTextHash: block.textHash,
        sourceText: block.text,
        translatedText: undefined,
        status: 'translating',
        order: block.order,
        createdAt: '2026-06-14T00:00:00.000Z',
        updatedAt: '2026-06-14T00:00:00.000Z',
        ...patch,
      },
    ],
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  };
}

describe('article bilingual translation', () => {
  it('extracts stable paragraph blocks and skips code-like content', () => {
    const blocks = extractWebArticleTranslationBlocks(
      document,
      `
        <h2>Intro</h2>
        <p>Hello world, this paragraph should be translated.</p>
        <pre>const value = 1</pre>
        <p><code>npm install</code></p>
        <p>https://example.com/article</p>
      `,
    );

    expect(blocks.map((block) => block.text)).toEqual([
      'Intro',
      'Hello world, this paragraph should be translated.',
    ]);
    expect(blocks[0]?.id).toMatch(/^block_1_/);
    expect(blocks[1]?.id).toMatch(/^block_2_/);
  });

  it('inserts translated paragraphs without changing source text content', () => {
    const html = '<p>Hello world, this paragraph should be translated.</p><p>Short</p>';
    const [block] = extractWebArticleTranslationBlocks(document, html);
    const translation = translationForBlock(block, {
      status: 'ready',
      translatedText: '你好世界，这一段应该被翻译。',
    });

    const rendered = articleHtmlWithBilingualTranslation(document, html, translation);
    const container = document.createElement('article');
    container.innerHTML = rendered;

    expect(container.querySelector('[data-reader-translation]')?.textContent).toBe(
      '你好世界，这一段应该被翻译。',
    );
    expect(sourceTextContent(container)).toBe(
      'Hello world, this paragraph should be translated.Short',
    );
  });

  it('creates and resolves anchors inside translated paragraphs', () => {
    const html = '<p>Hello world, this paragraph should be translated.</p>';
    const [block] = extractWebArticleTranslationBlocks(document, html);
    const translation = translationForBlock(block, {
      status: 'ready',
      translatedText: '你好世界，这一段应该被翻译。',
    });
    const rendered = articleHtmlWithBilingualTranslation(document, html, translation);
    const container = document.createElement('article');
    container.innerHTML = rendered;
    const translationElement = container.querySelector<HTMLElement>('[data-reader-translation]');
    const textNode = translationElement?.firstChild;
    expect(translationElement).toBeTruthy();
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

    const selectionRange = document.createRange();
    selectionRange.setStart(textNode as Text, 5);
    selectionRange.setEnd(textNode as Text, 12);

    expect(translationElementForRange(selectionRange)).toBe(translationElement);
    const anchor = createTranslationTextAnchor(selectionRange, translationElement as HTMLElement);
    expect(anchor).toMatchObject({
      exact: '这一段应该被翻',
      segmentId: block.id,
      start: 5,
      end: 12,
    });

    const resolvedRange = rangeForTranslationTextAnchor(container, anchor!);
    expect(resolvedRange?.toString()).toBe('这一段应该被翻');
  });

  it('renders translating segments with source-end spinner and translation skeleton', () => {
    const html = '<p>Hello world, this paragraph should be translated.</p>';
    const [block] = extractWebArticleTranslationBlocks(document, html);
    const rendered = articleHtmlWithBilingualTranslation(
      document,
      html,
      translationForBlock(block, { status: 'translating' }),
    );
    const container = document.createElement('article');
    container.innerHTML = rendered;

    const source = container.querySelector<HTMLElement>('[data-reader-source-block-id]');
    const indicator = source?.querySelector<HTMLElement>(
      '.reader-bilingual-translation-indicator.is-translating',
    );
    const translation = container.querySelector<HTMLElement>('[data-reader-translation]');
    expect(source).toBeTruthy();
    expect(indicator?.querySelector('.reader-bilingual-translation-spinner')).toBeTruthy();
    expect(translation?.querySelector('.reader-bilingual-translation-skeleton-line')).toBeTruthy();
    expect(translation?.querySelector('.reader-bilingual-translation-spinner')).toBeNull();
  });

  it('renders failed segments as source-end retry without translation block', () => {
    const html = '<p>Hello world, this paragraph should be translated.</p>';
    const [block] = extractWebArticleTranslationBlocks(document, html);
    const rendered = articleHtmlWithBilingualTranslation(
      document,
      html,
      translationForBlock(block, { status: 'failed' }),
      { retryLabel: '重试这一段' },
    );
    const container = document.createElement('article');
    container.innerHTML = rendered;

    const retry = container.querySelector<HTMLButtonElement>(
      '.reader-bilingual-translation-indicator.is-failed',
    );
    expect(container.querySelector('[data-reader-translation]')).toBeNull();
    expect(retry?.getAttribute('data-reader-translation-action')).toBe('failed');
    expect(retry?.getAttribute('aria-label')).toBe('重试这一段');
    expect(sourceTextContent(container)).toBe('Hello world, this paragraph should be translated.');
  });

  it('renders success feedback at the source block without changing translated text', () => {
    const html = '<p>Hello world, this paragraph should be translated.</p>';
    const [block] = extractWebArticleTranslationBlocks(document, html);
    const rendered = articleHtmlWithBilingualTranslation(
      document,
      html,
      translationForBlock(block, {
        status: 'ready',
        translatedText: '你好世界，这一段应该被翻译。',
      }),
      { successBlockIds: new Set([block.id]) },
    );
    const container = document.createElement('article');
    container.innerHTML = rendered;

    expect(
      container.querySelector('.reader-bilingual-translation-indicator.is-success'),
    ).toBeTruthy();
    expect(container.querySelector('[data-reader-translation]')?.textContent).toBe(
      '你好世界，这一段应该被翻译。',
    );
  });

  it('does not let local success feedback override failed segments', () => {
    const html = '<p>Hello world, this paragraph should be translated.</p>';
    const [block] = extractWebArticleTranslationBlocks(document, html);
    const rendered = articleHtmlWithBilingualTranslation(
      document,
      html,
      translationForBlock(block, { status: 'failed' }),
      { successBlockIds: new Set([block.id]) },
    );
    const container = document.createElement('article');
    container.innerHTML = rendered;

    expect(
      container.querySelector('.reader-bilingual-translation-indicator.is-success'),
    ).toBeNull();
    expect(
      container.querySelector('.reader-bilingual-translation-indicator.is-failed'),
    ).toBeTruthy();
  });
});
