export type ReaderSearchMatch = {
  id: string;
  start: number;
  end: number;
  preview: string;
};

export type ReaderSearchResult = {
  limited: boolean;
  matches: ReaderSearchMatch[];
};

export type ReaderSearchOptions = {
  caseSensitive?: boolean;
  limit?: number;
  previewRadius?: number;
};

const DEFAULT_LIMIT = 500;
const DEFAULT_PREVIEW_RADIUS = 32;

export function findReaderSearchMatches(
  text: string,
  query: string,
  options: ReaderSearchOptions = {},
): ReaderSearchResult {
  return createReaderSearch(text, options.caseSensitive)(query, options);
}

export function createReaderSearch(text: string, caseSensitive = false) {
  let normalizedText: ReturnType<typeof normalizeSearchText> | undefined;
  return (query: string, options: Omit<ReaderSearchOptions, 'caseSensitive'> = {}) => {
    const normalizedQuery = normalizeSearchText(query, caseSensitive);
    if (!text || !normalizedQuery.text) return { limited: false, matches: [] };

    normalizedText ??= normalizeSearchText(text, caseSensitive);
    return searchMatches(text, normalizedText, normalizedQuery.text, options);
  };
}

function searchMatches(
  text: string,
  normalizedText: ReturnType<typeof normalizeSearchText>,
  query: string,
  options: Omit<ReaderSearchOptions, 'caseSensitive'>,
): ReaderSearchResult {
  const limit = positiveLimit(options.limit);
  const previewRadius = positiveInteger(options.previewRadius, DEFAULT_PREVIEW_RADIUS);
  const matches: ReaderSearchMatch[] = [];
  let cursor = normalizedText.text.indexOf(query);

  while (cursor >= 0) {
    const endCursor = cursor + query.length;
    const start = normalizedText.map[cursor] ?? 0;
    const end = (normalizedText.map[endCursor - 1] ?? start) + 1;

    matches.push({
      id: `search-${start}-${end}-${matches.length}`,
      start,
      end,
      preview: searchPreview(text, start, end, previewRadius),
    });

    if (matches.length >= limit) {
      const nextCursor = normalizedText.text.indexOf(query, cursor + Math.max(1, query.length));
      return { limited: nextCursor >= 0, matches };
    }

    cursor = normalizedText.text.indexOf(query, cursor + Math.max(1, query.length));
  }

  return { limited: false, matches };
}

function normalizeSearchText(text: string, caseSensitive = false) {
  const normalized: string[] = [];
  const map: number[] = [];
  let pendingWhitespace = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (/\s/.test(char)) {
      pendingWhitespace = normalized.length > 0;
      continue;
    }
    if (pendingWhitespace && normalized[normalized.length - 1] !== ' ') {
      normalized.push(' ');
      map.push(index);
    }
    pendingWhitespace = false;
    normalized.push(caseSensitive ? char : char.toLocaleLowerCase());
    map.push(index);
  }

  return { text: trimTrailingSearchWhitespace(normalized).join(''), map };
}

function trimTrailingSearchWhitespace(text: string[]) {
  while (text[text.length - 1] === ' ') {
    text.pop();
  }
  return text;
}

function searchPreview(text: string, start: number, end: number, radius: number) {
  const previewStart = Math.max(0, start - radius);
  const previewEnd = Math.min(text.length, end + radius);
  const prefix = previewStart > 0 ? '...' : '';
  const suffix = previewEnd < text.length ? '...' : '';
  return `${prefix}${text.slice(previewStart, previewEnd).replace(/\s+/g, ' ').trim()}${suffix}`;
}

function positiveLimit(value: number | undefined) {
  return positiveInteger(value, DEFAULT_LIMIT);
}

function positiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}
