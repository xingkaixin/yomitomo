import type { Annotation, ArticleRecord, PublicAgent, UserProfile } from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';
import { annotationColor, type TocItem } from '@yomitomo/core';
import type { ReaderReadingSection, ReaderSettings } from '@yomitomo/reader-ui';

export type FoliateTocSourceItem = {
  label?: unknown;
  href?: string;
  subitems?: FoliateTocSourceItem[];
};

export type FoliateTocItem = {
  label: string;
  href: string;
  depth: number;
};

export type FoliateSectionSource = {
  id?: string;
  linear?: string;
};

export type FoliatePageInfo = {
  sectionIndex: number;
  pageIndex: number;
  pageCount: number;
};

export type FoliateContent = {
  doc?: Document;
  index?: number;
};

export type FoliateRelocateDetail = {
  fraction?: number;
  reason?: string;
  location?: {
    current?: number;
    total?: number;
  };
  section?: {
    current?: number;
  };
  tocItem?: {
    label?: unknown;
    href?: string;
  };
};

export type EbookPageTurnTrace = {
  turnId: string;
  startedAt: number;
  source: 'control' | 'foliate';
  direction: 'left' | 'right' | number;
  articleId: string;
};

export type FoliateViewElement = HTMLElement & {
  book?: {
    toc?: FoliateTocSourceItem[];
    dir?: string;
    sections?: FoliateSectionSource[];
  };
  renderer?:
    | (HTMLElement & {
        getContents?: () => FoliateContent[];
        goTo?: (target: { index: number; anchor?: number }) => Promise<void>;
        scrollToAnchor?: (anchor: Range | Element | number, select?: boolean) => Promise<void>;
        setStyles?: (styles: string | string[]) => void;
      })
    | null;
  close?: () => void;
  getPageInfo?: () => FoliatePageInfo | null;
  getSectionFractions?: () => number[];
  goLeft: () => Promise<void>;
  goRight: () => Promise<void>;
  goTo: (target: string | number) => Promise<unknown>;
  goToFraction: (fraction: number) => Promise<void>;
  next: () => Promise<void>;
  open: (file: File | Blob | string) => Promise<void>;
  prev: () => Promise<void>;
};

function rendererPerformanceElapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

export function recordEbookPageTurnTrace(
  trace: EbookPageTurnTrace | null,
  phase: string,
  data: Record<string, unknown> = {},
) {
  if (!trace) return;
  void window.yomitomoDesktop?.recordPerformanceTiming?.({
    event: 'ebook_page_turn',
    data: {
      articleId: trace.articleId,
      direction: trace.direction,
      elapsedMs: rendererPerformanceElapsedMs(trace.startedAt),
      phase,
      source: trace.source,
      turnId: trace.turnId,
      ...data,
    },
  });
}

export function configureFoliateView(view: FoliateViewElement | null, settings: ReaderSettings) {
  if (!view?.renderer) return;
  view.renderer.removeAttribute('animated');
  view.renderer.setAttribute('flow', 'paginated');
  view.renderer.setAttribute('gap', '8%');
  view.renderer.setAttribute('margin', '44px');
  view.renderer.setAttribute('max-inline-size', `${settings.contentWidth}px`);
  view.renderer.setAttribute('max-block-size', '1200px');
  view.renderer.setAttribute('max-column-count', '1');
  view.renderer.setStyles?.(foliateReaderCss(settings));
}

export function closeFoliateView(view: FoliateViewElement | null) {
  try {
    view?.close?.();
  } catch (error) {
    console.warn(error);
  }
}

function foliateReaderCss(settings: ReaderSettings) {
  return `
    @namespace epub "http://www.idpf.org/2007/ops";

    html {
      color-scheme: light;
      font-size: ${settings.fontSize}px;
    }

    body {
      overflow-wrap: break-word;
    }

    p, li, blockquote, dd {
      line-height: 1.4;
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }

    img, svg, video {
      max-width: 100%;
      height: auto;
    }

    pre {
      white-space: pre-wrap !important;
    }

    a {
      color: inherit;
      text-decoration-color: rgba(40, 35, 29, .36);
      text-underline-offset: .16em;
    }

    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `;
}

export function updateKnownSectionPageCount(
  counts: Array<number | null>,
  pageInfo: FoliatePageInfo,
): Array<number | null> {
  if (counts.length <= pageInfo.sectionIndex) return counts;
  const pageCount = Math.max(1, pageInfo.pageCount);
  if (counts[pageInfo.sectionIndex] === pageCount) return counts;

  const nextCounts = [...counts];
  nextCounts[pageInfo.sectionIndex] = pageCount;
  return nextCounts;
}

export function isEbookPaginationReady(
  pageInfo: FoliatePageInfo | null,
  counts: Array<number | null>,
): pageInfo is FoliatePageInfo {
  return Boolean(
    pageInfo && counts.length > pageInfo.sectionIndex && counts.every((count) => count !== null),
  );
}

export function formatEbookPageLabel(pageInfo: FoliatePageInfo, counts: Array<number | null>) {
  if (counts.length <= pageInfo.sectionIndex) return '';

  const precedingCounts = counts.slice(0, pageInfo.sectionIndex);
  if (precedingCounts.some((count) => count === null)) return '';

  const currentSectionPageCount = counts[pageInfo.sectionIndex] ?? pageInfo.pageCount;
  const currentPage =
    sumKnownPageCounts(precedingCounts) +
    Math.min(pageInfo.pageIndex, Math.max(0, currentSectionPageCount - 1)) +
    1;
  if (counts.some((count) => count === null)) return '';

  return `${currentPage} / ${sumKnownPageCounts(counts)}`;
}

function sumKnownPageCounts(counts: Array<number | null>) {
  return counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
}

export function waitForFoliateIdle() {
  return new Promise<void>((resolve) => {
    const idleWindow = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(() => resolve(), { timeout: 250 });
      return;
    }

    window.setTimeout(resolve, 16);
  });
}

export function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function waitForTimeout(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function waitForFoliatePageInfo(view: FoliateViewElement, sectionIndex?: number) {
  await waitForFoliateAssets(view);

  let pageInfo: FoliatePageInfo | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForAnimationFrame();
    pageInfo = view.getPageInfo?.() ?? null;
    if (pageInfo && (sectionIndex === undefined || pageInfo.sectionIndex === sectionIndex)) {
      return pageInfo;
    }
  }
  return sectionIndex === undefined || pageInfo?.sectionIndex === sectionIndex ? pageInfo : null;
}

async function waitForFoliateAssets(view: FoliateViewElement) {
  const doc = view.renderer?.getContents?.()[0]?.doc;
  if (!doc) return;

  await Promise.race([doc.fonts.ready.then(() => undefined), waitForTimeout(800)]).catch(() => {
    return undefined;
  });

  const pendingImages = Array.from(doc.images).filter((image) => !image.complete);
  if (pendingImages.length === 0) return;

  await Promise.race([
    Promise.allSettled(pendingImages.map(waitForImage)).then(() => undefined),
    waitForTimeout(800),
  ]);
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();
  return image.decode().catch(() => undefined);
}

export function flattenFoliateToc(items: FoliateTocSourceItem[], depth = 1): FoliateTocItem[] {
  return items.flatMap((item) => {
    const label = foliateLabelText(item.label);
    const current =
      item.href && label
        ? [
            {
              label,
              href: item.href,
              depth,
            },
          ]
        : [];
    return [...current, ...flattenFoliateToc(item.subitems ?? [], depth + 1)];
  });
}

function foliateLabelText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const first = Object.values(value as Record<string, unknown>)[0];
  return typeof first === 'string' ? first : '';
}

const EBOOK_TEXT_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,td,th';

type DomTextPosition = {
  node: Text;
  offset: number;
  virtual: boolean;
};

export type DomTextIndexTiming = {
  buildCount: number;
  buildMs: number;
  textChars: number;
};

export type EbookBoxUpdateReason =
  | 'annotation_navigation'
  | 'annotations_applied'
  | 'annotations_saved'
  | 'layout_effect'
  | 'layout_measure'
  | 'open_ebook'
  | 'page_turn'
  | 'reader_settings'
  | 'relocate'
  | 'resize_observer';

export type EbookBoxScheduleState = {
  count: number;
  cancelledFrameCount: number;
  reasons: EbookBoxUpdateReason[];
  firstScheduledAt: number;
};

export type EbookBoxScheduleSnapshot = {
  count: number;
  cancelledFrameCount: number;
  reasons: EbookBoxUpdateReason[];
  delayMs: number;
};

export function ebookHighlightAnnotationsSignature(
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return hashText(
    annotations
      .map((annotation) => {
        const anchor = annotation.anchor;
        return [
          annotation.id,
          anchor.chapterId || '',
          anchor.segmentId || '',
          anchor.paragraphId || '',
          anchor.textStartInBook ?? '',
          anchor.textEndInBook ?? '',
          anchor.textStartInParagraph ?? '',
          anchor.textEndInParagraph ?? '',
          anchor.start,
          anchor.end,
          hashText(normalizeRenderedText(anchor.exact)),
          hashText(normalizeRenderedText(anchor.prefix || '')),
          hashText(normalizeRenderedText(anchor.suffix || '')),
          annotation.agentId ||
            annotation.agentUsername ||
            annotation.userId ||
            annotation.userUsername ||
            annotation.author,
          annotationColor(annotation, userProfile, agents),
        ].join(':');
      })
      .toSorted()
      .join('|'),
  );
}

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

export function ebookReaderReadingSections(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  text: string,
): ReaderReadingSection[] {
  const index = article.ebook.index;
  if (!index?.chapters.length) {
    return text ? [{ id: 'ebook', title: article.title, start: 0, end: text.length }] : [];
  }
  return index.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title || `第 ${chapter.indexInBook + 1} 章`,
    start: chapter.textStart,
    end: chapter.textEnd,
  }));
}

export function ebookTocItemsForReader(
  tocItems: FoliateTocItem[],
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
): TocItem[] {
  const textLength = article.ebook.index?.textLength || 0;
  return tocItems.map((item, index) => {
    const chapter = ebookChapterForHref(article, item.href) || article.ebook.index?.chapters[index];
    return {
      index,
      text: item.label,
      depth: item.depth,
      start: chapter?.textStart ?? 0,
      end: chapter?.textEnd ?? textLength,
    };
  });
}

export function ebookChapterForHref(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  href: string | undefined,
) {
  const normalizedHref = normalizeEbookHref(href);
  if (!normalizedHref) return null;
  return (
    article.ebook.index?.chapters.find((chapter) =>
      ebookHrefMatches(normalizeEbookHref(chapter.href), normalizedHref),
    ) || null
  );
}

export function ebookChapterForFoliateSection(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  view: FoliateViewElement | null,
  sectionIndex: number,
) {
  const section = view?.book?.sections?.[sectionIndex];
  const byHref = ebookChapterForHref(article, section?.id);
  if (byHref) return byHref;
  return article.ebook.index?.chapters[sectionIndex] || null;
}

export function ebookSectionIndexForChapter(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  view: FoliateViewElement,
  chapter: NonNullable<NonNullable<ArticleRecord['ebook']>['index']>['chapters'][number],
) {
  const sections = view.book?.sections || [];
  const chapterHref = normalizeEbookHref(chapter.href);
  const matchedIndex = sections.findIndex((section) =>
    ebookHrefMatches(normalizeEbookHref(section.id), chapterHref),
  );
  if (matchedIndex >= 0) return matchedIndex;
  return chapter.indexInBook < sections.length ? chapter.indexInBook : -1;
}

function normalizeEbookHref(value: string | undefined) {
  return (value || '').split('#')[0]?.replace(/^\/+/, '') || '';
}

function ebookHrefMatches(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}

export function currentFoliateContent(view: FoliateViewElement | null) {
  return view?.renderer?.getContents?.()[0] || null;
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
    prefix: normalizeRenderedText(before.toString()).slice(-96),
    suffix: normalizeRenderedText(after.toString()).slice(0, 96),
  };
}

export function rangeForEbookAnchorInDocument(
  doc: Document,
  anchor: Annotation['anchor'],
  timing?: DomTextIndexTiming,
) {
  const match = ebookAnchorMatchInDocument(doc, anchor, timing);
  return match ? rangeFromNormalizedDomText(doc, match.index.positions, match.match) : null;
}

export function rangeForEbookAnchorCursorInDocument(
  doc: Document,
  anchor: Annotation['anchor'],
  progressOffset: number,
) {
  const matched = ebookAnchorMatchInDocument(doc, anchor);
  if (!matched) return null;

  const length = Math.max(1, matched.match.end - matched.match.start);
  const cursor = matched.match.start + (Math.max(0, progressOffset) % length);
  return rangeFromNormalizedDomTextPoint(doc, matched.index.positions, cursor, matched.match.end);
}

function ebookAnchorMatchInDocument(
  doc: Document,
  anchor: Annotation['anchor'],
  timing?: DomTextIndexTiming,
) {
  const body = doc.body;
  const query = normalizeRenderedText(anchor.exact);
  if (!body || !query) return null;

  const index = buildNormalizedDomTextIndex(body, timing);
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

function buildNormalizedDomTextIndex(root: HTMLElement, timing?: DomTextIndexTiming) {
  const startedAt = performance.now();
  let text = '';
  const positions: DomTextPosition[] = [];
  let pendingWhitespace = false;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const char = node.data[offset]!;
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
  }

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

export function foliateRangeHighlightBoxes(range: Range, canvasRect: DOMRect, idPrefix: string) {
  return mappedFoliateRangeRects(range, canvasRect).map((rect, index) => ({
    id: `${idPrefix}_${index}`,
    annotationId: '',
    color: '#f4c95d',
    top: rect.top - canvasRect.top,
    left: rect.left - canvasRect.left,
    width: rect.width,
    height: rect.height,
  }));
}

export function lastFoliateRangeViewportRect(range: Range, canvasRect: DOMRect) {
  return mappedFoliateRangeRects(range, canvasRect).at(-1) || null;
}

export function mappedFoliateRangeRects(range: Range, canvasRect: DOMRect) {
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement;
  if (!(frame instanceof HTMLIFrameElement)) return [];

  const frameRect = frame.getBoundingClientRect();
  return Array.from(range.getClientRects()).flatMap((rect) => {
    const left = frameRect.left + rect.left;
    const top = frameRect.top + rect.top;
    const right = left + rect.width;
    const bottom = top + rect.height;
    const visibleLeft = Math.max(left, frameRect.left, canvasRect.left);
    const visibleTop = Math.max(top, frameRect.top, canvasRect.top);
    const visibleRight = Math.min(right, frameRect.right, canvasRect.right);
    const visibleBottom = Math.min(bottom, frameRect.bottom, canvasRect.bottom);
    const width = visibleRight - visibleLeft;
    const height = visibleBottom - visibleTop;
    return width >= 2 && height >= 2 ? [new DOMRect(visibleLeft, visibleTop, width, height)] : [];
  });
}

export function normalizeRenderedText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
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
