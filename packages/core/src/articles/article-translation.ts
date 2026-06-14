import type { ArticleTranslation } from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';

export type WebArticleTranslationBlock = {
  id: string;
  order: number;
  text: string;
  textHash: string;
};

export type ArticleBilingualTranslationRenderOptions = {
  style?: string;
};

const translatableBlockSelector = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';
const codeBlockSelector = 'pre, code, kbd, samp';

export function extractWebArticleTranslationBlocks(
  articleDocument: Document,
  html: string,
): WebArticleTranslationBlock[] {
  const container = articleDocument.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll<HTMLElement>(translatableBlockSelector))
    .filter(isTopLevelTranslationBlock)
    .flatMap((element, index) => {
      const text = normalizeTranslationBlockText(element.textContent || '');
      if (!shouldTranslateBlock(element, text)) return [];
      const textHash = hashText(text);
      return [
        {
          id: `block_${index + 1}_${textHash.slice(0, 10)}`,
          order: index,
          text,
          textHash,
        },
      ];
    });
}

export function articleHtmlWithBilingualTranslation(
  articleDocument: Document,
  html: string,
  translation: ArticleTranslation | null,
  options: ArticleBilingualTranslationRenderOptions = {},
): string {
  if (!translation) return html;

  const container = articleDocument.createElement('div');
  container.innerHTML = html;
  const segmentsByBlockId = new Map(
    translation.segments.map((segment) => [segment.sourceBlockId, segment]),
  );

  Array.from(container.querySelectorAll<HTMLElement>(translatableBlockSelector))
    .filter(isTopLevelTranslationBlock)
    .forEach((element, index) => {
      const text = normalizeTranslationBlockText(element.textContent || '');
      if (!shouldTranslateBlock(element, text)) return;
      const textHash = hashText(text);
      const blockId = `block_${index + 1}_${textHash.slice(0, 10)}`;
      const segment = segmentsByBlockId.get(blockId);
      if (!segment) return;
      element.setAttribute('data-reader-source-block-id', blockId);
      element.insertAdjacentElement(
        'afterend',
        createTranslationElement(articleDocument, segment, options.style || 'dashedLine'),
      );
    });

  return container.innerHTML;
}

export function sourceTextContent(
  root: HTMLElement,
  ignoredSelector = '[data-reader-translation]',
) {
  const clone = root.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return root.textContent || '';
  clone.querySelectorAll(ignoredSelector).forEach((element) => element.remove());
  return clone.textContent || '';
}

function isTopLevelTranslationBlock(element: HTMLElement) {
  return !element.parentElement?.closest(translatableBlockSelector);
}

function shouldTranslateBlock(element: HTMLElement, text: string) {
  if (!text) return false;
  if (element.matches(codeBlockSelector) || element.querySelector(codeBlockSelector)) return false;
  if (/^https?:\/\/\S+$/.test(text)) return false;
  if (element.tagName.toLowerCase().startsWith('h')) return text.length >= 2;
  return text.length >= 12 || /[\u3400-\u9fff]/.test(text);
}

function normalizeTranslationBlockText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function createTranslationElement(
  articleDocument: Document,
  segment: ArticleTranslation['segments'][number],
  style: string,
) {
  const element = articleDocument.createElement('div');
  element.className = `reader-bilingual-translation is-${segment.status}`;
  element.setAttribute('data-reader-translation', 'true');
  element.setAttribute('data-reader-translation-style', style);
  element.setAttribute('data-reader-translation-status', segment.status);
  element.setAttribute('data-reader-translation-block-id', segment.sourceBlockId);
  if (segment.status === 'ready' && segment.translatedText?.trim()) {
    element.textContent = segment.translatedText.trim();
    return element;
  }

  const indicator = articleDocument.createElement(segment.status === 'failed' ? 'button' : 'span');
  indicator.className =
    segment.status === 'failed'
      ? 'reader-bilingual-translation-retry'
      : 'reader-bilingual-translation-loading';
  indicator.setAttribute('data-reader-translation-action', segment.status);
  indicator.setAttribute('data-reader-translation-block-id', segment.sourceBlockId);
  indicator.setAttribute('aria-label', segment.status);
  const icon = articleDocument.createElement('span');
  icon.className = 'reader-bilingual-translation-spinner';
  indicator.append(icon);
  element.append(indicator);
  return element;
}
