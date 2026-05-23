import type { PdfRect, PdfTextAnchor, TextAnchor } from './types';

import { hashText } from './ids';

export function textAnchorQuoteHash(text: string): string {
  return hashText(normalizeAnchorQuote(text));
}

export function createTextAnchor(text: string, start: number, end: number): TextAnchor {
  const safeStart = Math.max(0, Math.min(start, text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, text.length));
  const exact = text.slice(safeStart, safeEnd);

  return {
    exact,
    prefix: text.slice(Math.max(0, safeStart - 48), safeStart),
    suffix: text.slice(safeEnd, Math.min(text.length, safeEnd + 48)),
    start: safeStart,
    end: safeEnd,
    quoteHash: exact ? textAnchorQuoteHash(exact) : undefined,
  };
}

export function createPdfTextAnchor({
  pageText,
  pageIndex,
  start,
  end,
  pageWidth,
  pageHeight,
  rects,
}: {
  pageText: string;
  pageIndex: number;
  start: number;
  end: number;
  pageWidth: number;
  pageHeight: number;
  rects: PdfRect[];
}): PdfTextAnchor {
  const anchor = createTextAnchor(pageText, start, end);
  return {
    ...anchor,
    kind: 'pdf-text',
    pageIndex,
    pageWidth,
    pageHeight,
    rects,
  };
}

export function isPdfTextAnchor(anchor: TextAnchor): anchor is PdfTextAnchor {
  return 'kind' in anchor && anchor.kind === 'pdf-text';
}

export function resolveTextAnchor(
  text: string,
  anchor: TextAnchor,
): { start: number; end: number } | null {
  if (!anchor.exact) return null;

  const direct = text.slice(anchor.start, anchor.end);
  if (textAnchorQuoteMatches(anchor, direct)) {
    return { start: anchor.start, end: anchor.end };
  }

  const exactMatches = findAll(text, anchor.exact);
  const exactPosition = selectTextAnchorMatch(
    text,
    exactMatches.map((start) => ({ start, end: start + anchor.exact.length })),
    anchor,
  );
  if (exactPosition) return exactPosition;

  return selectTextAnchorMatch(text, findWhitespaceNormalizedMatches(text, anchor.exact), anchor);
}

function selectTextAnchorMatch(
  text: string,
  matches: Array<{ start: number; end: number }>,
  anchor: TextAnchor,
) {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  let bestMatch = matches[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const match of matches) {
    const { start, end } = match;
    const before = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const after = text.slice(end, end + anchor.suffix.length);
    const score =
      commonSuffixLength(before, anchor.prefix) +
      commonPrefixLength(after, anchor.suffix) -
      Math.abs(start - anchor.start) / 100;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }

  return bestMatch;
}

function findAll(text: string, exact: string): number[] {
  const starts: number[] = [];
  let cursor = text.indexOf(exact);
  while (cursor >= 0) {
    starts.push(cursor);
    cursor = text.indexOf(exact, cursor + Math.max(1, exact.length));
  }
  return starts;
}

function findWhitespaceNormalizedMatches(text: string, exact: string) {
  const normalizedText = normalizeTextWithMap(text);
  const normalizedExact = normalizeAnchorQuote(exact);
  if (!normalizedExact) return [];

  const matches: Array<{ start: number; end: number }> = [];
  let cursor = normalizedText.text.indexOf(normalizedExact);
  while (cursor >= 0) {
    const start = normalizedText.map[cursor];
    const end = normalizedText.map[cursor + normalizedExact.length - 1] + 1;
    matches.push({ start, end });
    cursor = normalizedText.text.indexOf(normalizedExact, cursor + normalizedExact.length);
  }
  return matches;
}

function normalizeTextWithMap(text: string) {
  let normalized = '';
  const map: number[] = [];
  let pendingSpaceIndex = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      if (normalized.length > 0) pendingSpaceIndex = index;
      continue;
    }

    if (pendingSpaceIndex >= 0) {
      normalized += ' ';
      map.push(pendingSpaceIndex);
      pendingSpaceIndex = -1;
    }
    normalized += char;
    map.push(index);
  }

  return { text: normalized.trim(), map };
}

function textAnchorQuoteMatches(anchor: TextAnchor, text: string) {
  if (text === anchor.exact) return true;
  if (normalizeAnchorQuote(text) === normalizeAnchorQuote(anchor.exact)) return true;
  return Boolean(anchor.quoteHash && textAnchorQuoteHash(text) === anchor.quoteHash);
}

function normalizeAnchorQuote(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function commonPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return limit;
}

function commonSuffixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    if (left[left.length - 1 - index] !== right[right.length - 1 - index]) return index;
  }
  return limit;
}
