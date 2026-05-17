export type HighlightBox = {
  id: string;
  annotationId: string;
  contributorId?: string;
  color: string;
  top: number;
  left: number;
  width: number;
  height: number;
};

export type HighlightSegment = {
  id: string;
  annotationIds: string[];
  colors: string[];
  top: number;
  left: number;
  width: number;
  height: number;
};

export type HighlightPoint = {
  x: number;
  y: number;
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

type HighlightLineGroup = {
  boxes: HighlightBox[];
  topSum: number;
  heightSum: number;
};

type HighlightEdgeEvent = {
  edge: number;
  kind: 'start' | 'end';
  box: HighlightBox;
  order: number;
};

type ActiveHighlightContributor = {
  box: HighlightBox;
  order: number;
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

export function articleTitleTocItems(article: HTMLElement, title: string): TocItem[] {
  const text = title.trim();
  return text
    ? [{ index: -1, text, depth: 0, start: 0, end: article.textContent?.length || 0 }]
    : [];
}

export function findCurrentTocTarget(
  article: HTMLElement,
  item: TocItem,
  options: ExtractTocOptions = {},
) {
  if (item.index < 0) return article;
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
  endOffset?: number,
) {
  const text = article.textContent || '';
  const surfaceRect = surface.getBoundingClientRect();
  const start = Math.max(0, Math.min(offset, text.length - 1));
  const end = Math.min(text.length - 1, endOffset ?? text.length - 1, start + 120);

  for (let cursor = start; cursor < end; cursor += 1) {
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

export function buildHighlightSegments(boxes: HighlightBox[]): HighlightSegment[] {
  const lineGroups = groupHighlightBoxesByLine(boxes);

  return lineGroups.flatMap((line, lineIndex) => buildLineHighlightSegments(line, lineIndex));
}

function buildLineHighlightSegments(line: HighlightBox[], lineIndex: number): HighlightSegment[] {
  const events = line
    .filter((box) => box.width >= 1)
    .flatMap((box, order): HighlightEdgeEvent[] => [
      { edge: box.left, kind: 'start', box, order },
      { edge: box.left + box.width, kind: 'end', box, order },
    ])
    .toSorted((left, right) => left.edge - right.edge);

  const active: ActiveHighlightContributor[] = [];
  const segments: HighlightSegment[] = [];
  let index = 0;

  while (index < events.length) {
    const left = events[index]!.edge;
    const edgeEvents: HighlightEdgeEvent[] = [];
    while (index < events.length && events[index]!.edge === left) {
      edgeEvents.push(events[index]!);
      index += 1;
    }

    for (const event of edgeEvents) {
      if (event.kind === 'end') removeActiveHighlightContributor(active, event.box);
    }
    for (const event of edgeEvents) {
      if (event.kind === 'start') insertActiveHighlightContributor(active, event);
    }

    const right = events[index]?.edge;
    if (right === undefined || right - left < 1 || active.length === 0) continue;

    const contributors = active.map((item) => item.box);
    const annotationIds = uniqueStrings(contributors.map((box) => box.annotationId));
    const colors = uniqueContributors(contributors).map((box) => box.color || '#f4c95d');
    const previous = segments.at(-1);
    if (
      previous &&
      previous.left + previous.width === left &&
      sameStrings(previous.annotationIds, annotationIds) &&
      sameStrings(previous.colors, colors)
    ) {
      previous.width = right - previous.left;
      continue;
    }

    segments.push({
      id: `${lineIndex}_${segments.length}_${annotationIds.join('_')}`,
      annotationIds,
      colors,
      top: Math.min(...contributors.map((box) => box.top)),
      left,
      width: right - left,
      height: Math.max(...contributors.map((box) => box.height)),
    });
  }

  return segments;
}

export function highlightSegmentStyle(segment: HighlightSegment, active: boolean) {
  const underlineOffset = highlightUnderlineOffset(segment.height);
  const dotWidth = highlightDotWidth(segment.colors.length);
  return {
    top: segment.top,
    left: segment.left,
    width: segment.width,
    height: segment.height,
    '--highlight-edge-size': dotWidth ? `${dotWidth + 3}px` : '0px',
    '--highlight-fill': alphaColor(segment.colors[0] || '#f4c95d', active ? 0.16 : 0),
    '--highlight-line': highlightLinePaint(segment.colors),
    '--highlight-opacity': active ? 0.95 : 0.78,
    '--highlight-offset': `${underlineOffset}px`,
    '--highlight-dot-offset': `${underlineOffset - 1}px`,
    '--highlight-thickness': active ? '4px' : '3px',
  };
}

export function annotationIdsAtHighlightPoint(
  boxes: HighlightBox[],
  point: HighlightPoint,
  padding = 0,
) {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const box of boxes) {
    if (
      point.x < box.left - padding ||
      point.x > box.left + box.width + padding ||
      point.y < box.top - padding ||
      point.y > box.top + box.height + padding
    ) {
      continue;
    }

    if (seen.has(box.annotationId)) continue;
    seen.add(box.annotationId);
    ids.push(box.annotationId);
  }

  return ids;
}

export function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function groupHighlightBoxesByLine(boxes: HighlightBox[]) {
  const sorted = [...boxes].toSorted(
    (left, right) => left.top - right.top || left.left - right.left,
  );
  const groups: HighlightLineGroup[] = [];
  let firstActiveIndex = 0;

  for (const box of sorted) {
    while (
      firstActiveIndex < groups.length &&
      box.top - highlightLineAverageTop(groups[firstActiveIndex]!) > 3
    ) {
      firstActiveIndex += 1;
    }

    const group = findHighlightLineGroup(groups, firstActiveIndex, box);

    if (group) {
      group.boxes.push(box);
      group.topSum += box.top;
      group.heightSum += box.height;
    } else {
      groups.push({ boxes: [box], topSum: box.top, heightSum: box.height });
    }
  }

  return groups.map((group) => group.boxes);
}

function highlightLineAverageTop(group: HighlightLineGroup) {
  return group.topSum / group.boxes.length;
}

function highlightLineAverageHeight(group: HighlightLineGroup) {
  return group.heightSum / group.boxes.length;
}

function findHighlightLineGroup(
  groups: HighlightLineGroup[],
  firstActiveIndex: number,
  box: HighlightBox,
) {
  for (let index = firstActiveIndex; index < groups.length; index += 1) {
    const group = groups[index]!;
    if (
      Math.abs(box.top - highlightLineAverageTop(group)) <= 3 &&
      Math.abs(box.height - highlightLineAverageHeight(group)) <= 4
    ) {
      return group;
    }
  }
  return undefined;
}

function insertActiveHighlightContributor(
  active: ActiveHighlightContributor[],
  contributor: ActiveHighlightContributor,
) {
  const index = active.findIndex((item) => item.order > contributor.order);
  if (index < 0) {
    active.push(contributor);
  } else {
    active.splice(index, 0, contributor);
  }
}

function removeActiveHighlightContributor(active: ActiveHighlightContributor[], box: HighlightBox) {
  const index = active.findIndex((item) => item.box === box);
  if (index >= 0) active.splice(index, 1);
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function uniqueContributors(boxes: HighlightBox[]) {
  const seen = new Set<string>();
  return boxes.filter((box) => {
    const contributorId = box.contributorId || box.annotationId;
    if (seen.has(contributorId)) return false;
    seen.add(contributorId);
    return true;
  });
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function highlightLinePaint(colors: string[]) {
  const safeColors = colors.length > 0 ? colors : ['#f4c95d'];
  if (safeColors.length === 1) return safeColors[0]!;
  const step = 100 / Math.max(1, safeColors.length - 1);
  return `linear-gradient(90deg, ${safeColors
    .map((color, index) => `${color} ${Math.round(index * step)}%`)
    .join(', ')})`;
}

function highlightUnderlineOffset(height: number) {
  return -Math.round(Math.min(6, Math.max(2, height * 0.12)));
}

function highlightDotWidth(count: number) {
  if (count <= 1) return 0;
  return count * 5 + (count - 1) * 2;
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
