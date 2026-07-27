import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { bilingualTranslationSelector } from '@yomitomo/core';
import { rendererPerformanceElapsedMs } from '../../shell/app-renderer-performance';

const EBOOK_TEXT_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,th';

type DomTextPosition = {
  node: Text;
  offset: number;
  virtual: boolean;
};

type NormalizedDomTextIndex = {
  text: string;
  positions: DomTextPosition[];
};

export type DomTextIndexTiming = {
  buildCount: number;
  buildMs: number;
  textChars: number;
};

export function ebookArticleText(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
) {
  const chapters = article.ebook.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    href: chapter.href,
    paragraphs: ebookChapterParagraphs(chapter.html),
  }));
  return chapters
    .map((chapter) => chapter.paragraphs.map(normalizeRenderedText).filter(Boolean).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

function ebookChapterParagraphs(html: string) {
  const container = document.createElement('article');
  container.innerHTML = html;
  const blockElements = Array.from(
    container.querySelectorAll<HTMLElement>(EBOOK_TEXT_BLOCK_SELECTOR),
  ).filter(
    (element) =>
      !Array.from(element.children).some((child) => child.matches(EBOOK_TEXT_BLOCK_SELECTOR)),
  );
  const paragraphs = blockElements.flatMap((element) => {
    const text = normalizeRenderedText(element.textContent || '');
    return text ? [text] : [];
  });
  if (paragraphs.length > 0) return paragraphs;
  const fallback = normalizeRenderedText(container.textContent || '');
  return fallback ? [fallback] : [];
}

export function isRangeInsideDocumentBody(doc: Document, range: Range) {
  const body = doc.body;
  const start =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentNode;
  const end =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer
      : range.endContainer.parentNode;
  return Boolean(body && start && end && body.contains(start) && body.contains(end));
}

export function selectionContextForRange(doc: Document, range: Range) {
  const body = doc.body;
  if (!body) return { prefix: '', suffix: '' };

  const before = doc.createRange();
  before.selectNodeContents(body);
  before.setEnd(range.startContainer, range.startOffset);

  const after = doc.createRange();
  after.selectNodeContents(body);
  after.setStart(range.endContainer, range.endOffset);

  return {
    prefix: normalizeRenderedText(selectionTextForRange(before)).slice(-96),
    suffix: normalizeRenderedText(selectionTextForRange(after)).slice(0, 96),
  };
}

export function selectionTextForRange(range: Range) {
  return renderedTextForNode(range.cloneContents()) || range.toString();
}

export function rangeForEbookAnchorInDocument(
  doc: Document,
  anchor: Annotation['anchor'],
  timing?: DomTextIndexTiming,
) {
  return createEbookAnchorResolver(doc, timing).rangeForAnchor(anchor);
}

export function rangeForEbookAnchorCursorInDocument(
  doc: Document,
  anchor: Annotation['anchor'],
  progressOffset: number,
) {
  const matched = createEbookAnchorResolver(doc).match(anchor);
  if (!matched) return null;

  const length = Math.max(1, matched.match.end - matched.match.start);
  const cursor = matched.match.start + (Math.max(0, progressOffset) % length);
  return rangeFromNormalizedDomTextPoint(doc, matched.index.positions, cursor, matched.match.end);
}

export function createEbookAnchorResolver(doc: Document, timing?: DomTextIndexTiming) {
  let index: NormalizedDomTextIndex | null | undefined;

  const resolveIndex = () => {
    if (index !== undefined) return index;
    index = doc.body ? buildNormalizedDomTextIndex(doc.body, timing) : null;
    return index;
  };

  const match = (anchor: Annotation['anchor']) => {
    const query = normalizeRenderedText(anchor.exact);
    const resolvedIndex = query ? resolveIndex() : null;
    if (!resolvedIndex) return null;
    return ebookAnchorMatchInIndex(resolvedIndex, anchor, query);
  };

  return {
    match,
    rangeForAnchor: (anchor: Annotation['anchor']) => {
      const matched = match(anchor);
      return matched
        ? rangeFromNormalizedDomText(doc, matched.index.positions, matched.match)
        : null;
    },
  };
}

function ebookAnchorMatchInIndex(
  index: NormalizedDomTextIndex,
  anchor: Annotation['anchor'],
  query: string,
) {
  let bestMatch: { start: number; end: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let cursor = index.text.indexOf(query);

  while (cursor >= 0) {
    const end = cursor + query.length;
    const score = domAnchorMatchScore(index.text, cursor, end, anchor);
    if (score > bestScore) {
      bestMatch = { start: cursor, end };
      bestScore = score;
    }
    cursor = index.text.indexOf(query, cursor + Math.max(1, query.length));
  }

  return bestMatch ? { index, match: bestMatch } : null;
}

function buildNormalizedDomTextIndex(
  root: HTMLElement,
  timing?: DomTextIndexTiming,
): NormalizedDomTextIndex {
  const startedAt = performance.now();
  let text = '';
  const positions: DomTextPosition[] = [];
  let pendingWhitespace = false;

  const appendTextNode = (node: Text) => {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const char = node.data[offset];
      if (/\s/.test(char)) {
        pendingWhitespace = text.length > 0;
        continue;
      }
      if (pendingWhitespace && !text.endsWith(' ')) {
        text += ' ';
        positions.push({ node, offset, virtual: true });
      }
      pendingWhitespace = false;
      text += char;
      positions.push({ node, offset, virtual: false });
    }
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendTextNode(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as Element;
    if (element.matches(bilingualTranslationSelector)) return;
    if (element.localName === 'br') {
      pendingWhitespace = text.length > 0;
      return;
    }

    const isBlock = element !== root && element.matches(EBOOK_TEXT_BLOCK_SELECTOR);
    if (isBlock && text.length > 0) pendingWhitespace = true;
    element.childNodes.forEach(visit);
    if (isBlock && text.length > 0) pendingWhitespace = true;
  };

  visit(root);

  if (timing) {
    timing.buildCount += 1;
    timing.buildMs += rendererPerformanceElapsedMs(startedAt);
    timing.textChars = Math.max(timing.textChars, text.length);
  }

  return { text, positions };
}

function rangeFromNormalizedDomText(
  doc: Document,
  positions: DomTextPosition[],
  match: { start: number; end: number },
) {
  const start = positions[match.start];
  const end = positions[match.end - 1];
  if (!start || !end) return null;
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + (end.virtual ? 0 : 1));
  return range;
}

function rangeFromNormalizedDomTextPoint(
  doc: Document,
  positions: DomTextPosition[],
  offset: number,
  limitEnd: number,
) {
  let cursor = Math.min(offset, Math.max(0, limitEnd - 1));
  while (cursor < limitEnd && positions[cursor]?.virtual) cursor += 1;
  if (!positions[cursor] || cursor >= limitEnd) {
    cursor = Math.min(Math.max(0, limitEnd - 1), positions.length - 1);
    while (cursor > 0 && positions[cursor]?.virtual) cursor -= 1;
  }
  if (!positions[cursor] || positions[cursor]?.virtual) return null;
  return rangeFromNormalizedDomText(doc, positions, {
    start: cursor,
    end: Math.min(limitEnd, cursor + 1),
  });
}

function domAnchorMatchScore(
  text: string,
  start: number,
  end: number,
  anchor: Annotation['anchor'],
) {
  const prefix = normalizeRenderedText(anchor.prefix || '');
  const suffix = normalizeRenderedText(anchor.suffix || '');
  const before = text.slice(Math.max(0, start - Math.max(120, prefix.length * 3)), start);
  const after = text.slice(end, Math.min(text.length, end + Math.max(120, suffix.length * 3)));
  return commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
}

export function normalizeRenderedText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function renderedTextForNode(root: Node) {
  let text = '';
  let pendingWhitespace = false;

  const appendText = (value: string) => {
    for (const char of value) {
      if (/\s/.test(char)) {
        pendingWhitespace = text.length > 0;
        continue;
      }
      if (pendingWhitespace && !text.endsWith(' ')) text += ' ';
      pendingWhitespace = false;
      text += char;
    }
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
      return;

    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    if (element?.matches(bilingualTranslationSelector)) return;
    if (element?.localName === 'br') {
      pendingWhitespace = text.length > 0;
      return;
    }

    const isBlock = Boolean(element?.matches(EBOOK_TEXT_BLOCK_SELECTOR));
    if (isBlock && text.length > 0) pendingWhitespace = true;
    node.childNodes.forEach(visit);
    if (isBlock && text.length > 0) pendingWhitespace = true;
  };

  visit(root);
  return text.trim();
}

function commonPrefixLength(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }
  return length;
}

function commonSuffixLength(left: string, right: string) {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}
