import type { FoliateSectionSource } from './ebook-foliate-view';

export const EBOOK_PAGINATION_PAGE_COUNT_CACHE_LIMIT = 48;

export class EbookPaginationPageCountCache {
  private readonly entries = new Map<string, Array<number | null>>();

  constructor(private readonly maxEntries = EBOOK_PAGINATION_PAGE_COUNT_CACHE_LIMIT) {}

  get size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }

  get(key: string) {
    const counts = this.entries.get(key);
    if (!counts) return undefined;
    this.entries.delete(key);
    this.entries.set(key, counts);
    return [...counts];
  }

  set(key: string, counts: Array<number | null>) {
    if (this.maxEntries <= 0) {
      this.entries.clear();
      return;
    }
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, [...counts]);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}
export function ebookPaginationCacheKey({
  articleId,
  columns,
  contentWidth,
  fontSize,
  layoutKey,
}: {
  articleId: string;
  columns: number;
  contentWidth: number;
  fontSize: number;
  layoutKey: string;
}) {
  return `${articleId}:${layoutKey}:${fontSize}:${contentWidth}:${columns}`;
}

export function ebookPaginationSectionOrder(sectionCount: number, currentSectionIndex?: number) {
  const indexes: number[] = [];
  const seen = new Set<number>();
  const addIndex = (index: number) => {
    if (index < 0 || index >= sectionCount || seen.has(index)) return;
    seen.add(index);
    indexes.push(index);
  };

  if (typeof currentSectionIndex === 'number' && Number.isInteger(currentSectionIndex)) {
    addIndex(currentSectionIndex);
  }
  for (let index = 0; index < sectionCount; index += 1) {
    addIndex(index);
  }

  return indexes;
}

export function ebookPendingPaginationSectionIndexes(
  sections: FoliateSectionSource[],
  counts: Array<number | null>,
  currentSectionIndex?: number,
) {
  return ebookPaginationSectionOrder(sections.length, currentSectionIndex).filter((index) => {
    const section = sections[index];
    if (!section) return false;
    if (section.linear === 'no') return false;
    return counts[index] === null;
  });
}
