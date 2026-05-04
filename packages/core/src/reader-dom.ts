export type HighlightBox = {
  id: string;
  annotationId: string;
  color: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

export type TocItem = {
  index: number;
  text: string;
  depth: number;
  start: number;
  end: number;
};

export type ExtractTocOptions = {
  headingSelector?: string;
  inferredSelector?: string;
  rejectNestedSelector?: string;
  maxInferredHeadings?: number;
  getHeadingDepth?: (element: HTMLElement) => number;
};

type TocEntry = Omit<TocItem, 'start' | 'end'> & {
  target: HTMLElement;
};

const defaultChapterPattern =
  /^((第?[一二三四五六七八九十百]+|\d+)[、.．]|[一二三四五六七八九十]+、)/;

export function isRangeInsideArticle(range: Range, article: HTMLElement) {
  const start =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentNode;
  const end =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer
      : range.endContainer.parentNode;
  return Boolean(start && end && article.contains(start) && article.contains(end));
}

export function extractTocItems(article: HTMLElement, options: ExtractTocOptions = {}) {
  const entries = getTocEntries(article, options)
    .map((entry) => ({
      index: entry.index,
      target: entry.target,
      text: entry.text,
      depth: entry.depth,
      start: offsetFromArticleStart(article, entry.target, 0),
    }))
    .toSorted((left, right) => left.start - right.start);
  const textLength = article.textContent?.length || 0;

  return entries.map((entry, index) => {
    const isRootIntro = index === 0 && entries[1] && entry.depth < entries[1].depth;
    const nextEntry = entries
      .slice(index + 1)
      .find((item) => (isRootIntro ? true : item.depth <= entry.depth));
    return {
      index: entry.index,
      text: entry.text,
      depth: entry.depth,
      start: entry.start,
      end: nextEntry?.start || textLength,
    };
  });
}

export function findCurrentTocTarget(
  article: HTMLElement,
  item: TocItem,
  options: ExtractTocOptions = {},
) {
  const entries = getTocEntries(article, options);
  const indexed = entries[item.index];
  if (indexed?.text === item.text) return indexed.target;
  return entries.find((entry) => entry.text === item.text)?.target || null;
}

export function offsetFromArticleStart(article: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(article);
  range.setEnd(node, offset);
  return range.toString().length;
}

export function getArticleSelection(article: HTMLElement) {
  const rootNode = article.getRootNode();
  if (rootNode instanceof ShadowRoot) {
    const getSelection = (rootNode as ShadowRoot & { getSelection?: () => Selection | null })
      .getSelection;
    if (getSelection) return getSelection.call(rootNode);
  }
  return article.ownerDocument.getSelection();
}

export function selectionActionPosition(lastRect: DOMRect, canvasRect: DOMRect) {
  const maxX = Math.max(4, canvasRect.width - 124);
  return {
    x: Math.min(maxX, Math.max(4, lastRect.right - canvasRect.left + 2)),
    y: Math.max(4, lastRect.bottom - canvasRect.top - 6),
  };
}

export function scrollReaderSurfaceToElement(
  surface: HTMLElement,
  element: HTMLElement,
  offset: number,
) {
  scrollReaderSurfaceToRect(surface, element.getBoundingClientRect(), offset);
}

export function scrollReaderSurfaceToRect(surface: HTMLElement, rect: DOMRect, offset: number) {
  const surfaceRect = surface.getBoundingClientRect();
  surface.scrollTo({
    top: Math.max(0, surface.scrollTop + rect.top - surfaceRect.top - offset),
    behavior: 'smooth',
  });
}

export function cursorPositionFromOffset(
  article: HTMLElement,
  surface: HTMLElement,
  offset: number,
) {
  const text = article.textContent || '';
  const surfaceRect = surface.getBoundingClientRect();
  const start = Math.max(0, Math.min(offset, text.length - 1));

  for (let cursor = start; cursor < Math.min(text.length - 1, start + 120); cursor += 1) {
    if (!text[cursor]?.trim()) continue;

    const range = rangeFromOffsets(article, cursor, cursor + 1);
    const rect = range?.getClientRects()[0];
    if (!rect || rect.width < 1 || rect.height < 1) continue;

    const offscreen =
      rect.bottom < surfaceRect.top ? 'above' : rect.top > surfaceRect.bottom ? 'below' : null;
    return {
      offset: cursor,
      x: offscreen ? surfaceRect.left + surfaceRect.width / 2 : rect.left + rect.width,
      y:
        offscreen === 'above'
          ? surfaceRect.top + 20
          : offscreen === 'below'
            ? surfaceRect.bottom - 20
            : rect.top + rect.height / 2,
      offscreen: offscreen as 'above' | 'below' | null,
    };
  }

  return null;
}

export function rangeHighlightBoxes(
  range: Range,
  canvasRect: DOMRect,
  idPrefix: string,
): HighlightBox[] {
  const rects: DOMRect[] = [];
  const collectNodeRects = (node: Text) => {
    const nodeRange = document.createRange();
    nodeRange.setStart(node, node === range.startContainer ? range.startOffset : 0);
    nodeRange.setEnd(node, node === range.endContainer ? range.endOffset : node.data.length);
    rects.push(...Array.from(nodeRange.getClientRects()));
  };

  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    const node = range.commonAncestorContainer as Text;
    if (node.textContent?.trim()) collectNodeRects(node);
  } else {
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    while (walker.nextNode()) {
      collectNodeRects(walker.currentNode as Text);
    }
  }

  return mergeLineRects(rects)
    .filter((rect) => rect.width >= 2 && rect.height >= 2)
    .map((rect, index) => ({
      id: `${idPrefix}_${index}`,
      annotationId: '',
      color: '#f4c95d',
      top: rect.top - canvasRect.top,
      left: rect.left - canvasRect.left,
      width: rect.width,
      height: rect.height,
    }));
}

export function rangeFromOffsets(rootElement: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nextOffset = currentOffset + node.data.length;
    if (!startNode && start >= currentOffset && start <= nextOffset) {
      startNode = node;
      startOffset = start - currentOffset;
    }
    if (!endNode && end >= currentOffset && end <= nextOffset) {
      endNode = node;
      endOffset = end - currentOffset;
      break;
    }
    currentOffset = nextOffset;
  }

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function isPrimaryTocItem(item: TocItem) {
  return item.depth <= 1;
}

export function highlightStyle(box: HighlightBox, active: boolean, fallbackColor = '#f4c95d') {
  const color = box.color || fallbackColor;
  return {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    backgroundColor: alphaColor(color, active ? 0.45 : 0.28),
    boxShadow: `0 0 0 ${active ? 2 : 1}px ${alphaColor(color, active ? 0.72 : 0.36)}`,
  };
}

export function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function getTocEntries(article: HTMLElement, options: ExtractTocOptions): TocEntry[] {
  const headingSelector = options.headingSelector || 'h1, h2, h3, h4';
  const semanticHeadings = collectTocCandidates(
    Array.from(article.querySelectorAll<HTMLElement>(headingSelector)),
    options.getHeadingDepth || defaultHeadingDepth,
  );
  if (semanticHeadings.length > 0) return semanticHeadings;

  const inferredSelector = options.inferredSelector || 'p, div, section';
  const rejectNestedSelector = options.rejectNestedSelector || 'p, div, section, h1, h2, h3, h4';
  const inferredHeadings = Array.from(article.querySelectorAll<HTMLElement>(inferredSelector))
    .filter((element) => {
      const text = element.textContent?.trim() || '';
      return text.length >= 3 && text.length <= 80 && defaultChapterPattern.test(text);
    })
    .filter((element) => !element.querySelector(rejectNestedSelector))
    .slice(0, options.maxInferredHeadings ?? 24);

  return collectTocCandidates(inferredHeadings, () => 1);
}

function collectTocCandidates(
  elements: HTMLElement[],
  getDepth: (element: HTMLElement) => number,
): TocEntry[] {
  return elements
    .map((element, index) => {
      const text = element.textContent?.trim().replace(/\s+/g, ' ') || '';
      if (!text) return null;
      return { index, target: element, text, depth: getDepth(element) };
    })
    .filter((item): item is TocEntry => Boolean(item));
}

function defaultHeadingDepth(element: HTMLElement) {
  return Number(element.tagName.slice(1)) - 1;
}

function mergeLineRects(rects: DOMRect[]) {
  const lines: Array<{ top: number; left: number; right: number; bottom: number }> = [];
  for (const rect of rects) {
    if (rect.width < 2 || rect.height < 2) continue;
    const line = lines.find(
      (item) => Math.abs(item.top - rect.top) < 3 && Math.abs(item.bottom - rect.bottom) < 3,
    );
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else {
      lines.push({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom });
    }
  }

  return lines.map((line) => ({
    top: line.top,
    left: line.left,
    right: line.right,
    bottom: line.bottom,
    width: line.right - line.left,
    height: line.bottom - line.top,
  }));
}
