import type { ArticleTranslation } from '@yomitomo/shared';
import type { TextAnchor } from '@yomitomo/shared';
import { createTextAnchor, hashText, resolveTextAnchor } from '@yomitomo/shared';
import { offsetFromArticleStart, rangeFromOffsets } from '../reader/reader-dom';

export type BilingualTranslationSourceBlock = {
  id: string;
  order: number;
  text: string;
  textHash: string;
};

export type WebArticleTranslationBlock = BilingualTranslationSourceBlock;

export type ArticleBilingualTranslationRenderOptions = {
  retryLabel?: string;
  style?: string;
  successBlockIds?: ReadonlySet<string>;
};

const translatableBlockSelector = 'p, li, blockquote, h1, h2, h3, h4, h5, h6';
const codeBlockSelector = 'pre, code, kbd, samp';
export const bilingualTranslationSelector = '[data-reader-translation]';

export function extractWebArticleTranslationBlocks(
  articleDocument: Document,
  html: string,
): WebArticleTranslationBlock[] {
  const container = articleDocument.createElement('div');
  container.innerHTML = html;
  return extractBilingualTranslationBlocks(container);
}

export function extractBilingualTranslationBlocks(
  root: ParentNode,
): BilingualTranslationSourceBlock[] {
  return translationBlockEntries(root).map(({ block }) => block);
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
  const changed = applyBilingualTranslation(container, translation, options);
  return changed ? container.innerHTML : html;
}

export function applyBilingualTranslation(
  root: HTMLElement,
  translation: ArticleTranslation | null,
  options: ArticleBilingualTranslationRenderOptions = {},
) {
  let changed = clearBilingualTranslation(root);
  if (!translation) return changed;

  const segmentsByBlockId = new Map(
    translation.segments.map((segment) => [segment.sourceBlockId, segment]),
  );
  const articleDocument = root.ownerDocument;

  translationBlockEntries(root).forEach(({ block, element }) => {
    const segment = segmentsByBlockId.get(block.id);
    if (!segment) return;
    const indicator = createTranslationIndicator(articleDocument, segment, {
      retryLabel: options.retryLabel,
      status:
        segment.status === 'ready' && options.successBlockIds?.has(block.id)
          ? 'success'
          : segment.status,
    });
    const translationElement = createTranslationElement(
      articleDocument,
      segment,
      options.style || 'dashedLine',
    );
    if (!indicator && !translationElement) return;
    element.setAttribute('data-reader-source-block-id', block.id);
    if (indicator) element.append(indicator);
    if (translationElement) element.insertAdjacentElement('afterend', translationElement);
    changed = true;
  });

  return changed;
}

export function clearBilingualTranslation(root: ParentNode) {
  const translationElements = Array.from(
    root.querySelectorAll<HTMLElement>(bilingualTranslationSelector),
  );
  const indicators = Array.from(
    root.querySelectorAll<HTMLElement>('.reader-bilingual-translation-indicator'),
  );
  const sourceElements = Array.from(
    root.querySelectorAll<HTMLElement>('[data-reader-source-block-id]'),
  );
  translationElements.forEach((element) => element.remove());
  indicators.forEach((element) => element.remove());
  sourceElements.forEach((element) => element.removeAttribute('data-reader-source-block-id'));
  return translationElements.length > 0 || indicators.length > 0 || sourceElements.length > 0;
}

export function sourceTextContent(
  root: HTMLElement,
  ignoredSelector = bilingualTranslationSelector,
) {
  const clone = root.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return root.textContent || '';
  clone.querySelectorAll(ignoredSelector).forEach((element) => element.remove());
  return clone.textContent || '';
}

export function translationElementForRange(range: Range) {
  const start = translationElementForNode(range.startContainer);
  const end = translationElementForNode(range.endContainer);
  return start && start === end ? start : null;
}

export function translationElementForAnchor(root: HTMLElement, anchor: TextAnchor) {
  if (!anchor.segmentId) return null;
  return Array.from(root.querySelectorAll<HTMLElement>(bilingualTranslationSelector)).find(
    (element) => element.getAttribute('data-reader-translation-block-id') === anchor.segmentId,
  );
}

export function rangeIntersectsBilingualTranslation(range: Range) {
  const nodes = [range.startContainer, range.endContainer];
  if (nodes.some((node) => Boolean(elementForNode(node)?.closest(bilingualTranslationSelector)))) {
    return true;
  }

  const articleDocument = range.commonAncestorContainer.ownerDocument;
  if (!articleDocument) return false;
  const container = articleDocument.createElement('div');
  container.append(range.cloneContents());
  return Boolean(container.querySelector(bilingualTranslationSelector));
}

function translationBlockEntries(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(translatableBlockSelector))
    .filter(isTopLevelTranslationBlock)
    .flatMap((element, index) => {
      const text = normalizeTranslationBlockText(element.textContent || '');
      if (!shouldTranslateBlock(element, text)) return [];
      const textHash = hashText(text);
      return [
        {
          block: {
            id: `block_${index + 1}_${textHash.slice(0, 10)}`,
            order: index,
            text,
            textHash,
          },
          element,
        },
      ];
    });
}

export function createTranslationTextAnchor(range: Range, element: HTMLElement) {
  const blockId = element.getAttribute('data-reader-translation-block-id');
  if (!blockId) return null;

  const text = element.textContent || '';
  const start = offsetFromArticleStart(element, range.startContainer, range.startOffset);
  const end = offsetFromArticleStart(element, range.endContainer, range.endOffset);
  const anchor = createTextAnchor(text, start, end);
  if (!anchor.exact.trim()) return null;

  return { ...anchor, segmentId: blockId };
}

export function rangeForTranslationTextAnchor(root: HTMLElement, anchor: TextAnchor) {
  const element = translationElementForAnchor(root, anchor);
  if (!element) return null;

  const position = resolveTextAnchor(element.textContent || '', anchor);
  if (!position) return null;
  return rangeFromOffsets(element, position.start, position.end);
}

export function textForTranslationAnchor(root: HTMLElement, anchor: TextAnchor) {
  return translationElementForAnchor(root, anchor)?.textContent || '';
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

function translationElementForNode(node: Node) {
  return elementForNode(node)?.closest<HTMLElement>(bilingualTranslationSelector) || null;
}

function elementForNode(node: Node) {
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function createTranslationElement(
  articleDocument: Document,
  segment: ArticleTranslation['segments'][number],
  style: string,
) {
  if (segment.status === 'failed') return null;

  const element = articleDocument.createElement('div');
  element.className = `reader-bilingual-translation is-${segment.status}`;
  element.setAttribute('data-reader-translation', 'true');
  element.setAttribute('data-reader-translation-style', style);
  element.setAttribute('data-reader-translation-status', segment.status);
  element.setAttribute('data-reader-translation-block-id', segment.sourceBlockId);
  const translatedText = segment.translatedText?.trim();
  if (segment.status === 'ready' && translatedText) {
    element.textContent = translatedText;
    return element;
  }

  element.append(createTranslationSkeleton(articleDocument, segment.sourceText));
  return element;
}

function createTranslationIndicator(
  articleDocument: Document,
  segment: ArticleTranslation['segments'][number],
  options: {
    retryLabel?: string;
    status: ArticleTranslation['segments'][number]['status'] | 'success';
  },
) {
  if (options.status === 'ready') return null;

  const indicator = articleDocument.createElement(options.status === 'failed' ? 'button' : 'span');
  indicator.className = `reader-bilingual-translation-indicator is-${options.status}`;
  indicator.setAttribute('data-reader-translation-status', options.status);
  indicator.setAttribute('data-reader-translation-block-id', segment.sourceBlockId);
  if (options.status === 'failed') {
    const label = options.retryLabel || 'Retry translation';
    indicator.setAttribute('type', 'button');
    indicator.setAttribute('data-reader-translation-action', 'failed');
    indicator.setAttribute('aria-label', label);
    indicator.setAttribute('title', label);
  } else {
    indicator.setAttribute('aria-hidden', 'true');
  }

  const icon = articleDocument.createElement('span');
  icon.className =
    options.status === 'success'
      ? 'reader-bilingual-translation-check'
      : 'reader-bilingual-translation-spinner';
  indicator.append(icon);
  return indicator;
}

function createTranslationSkeleton(articleDocument: Document, sourceText: string) {
  const skeleton = articleDocument.createElement('span');
  skeleton.className = 'reader-bilingual-translation-skeleton';
  skeleton.setAttribute('aria-hidden', 'true');
  const lineCount = Math.min(
    4,
    Math.max(1, Math.ceil(normalizeTranslationBlockText(sourceText).length / 48)),
  );
  for (let index = 0; index < lineCount; index += 1) {
    const line = articleDocument.createElement('span');
    line.className = 'reader-bilingual-translation-skeleton-line';
    if (index === lineCount - 1) line.classList.add('is-last');
    skeleton.append(line);
  }
  return skeleton;
}
