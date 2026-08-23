import type {
  ReaderProgress,
  ReadingMemoryEntry,
  ReadingMemoryView,
  TextRange,
} from '@yomitomo/shared';
import type { BuildReadingMemoryViewOptions } from './reading-memory-store-types';

type BuildReadingMemoryViewFromCandidatesInput = {
  options: BuildReadingMemoryViewOptions;
  searchCandidates: ReadingMemoryEntry[];
  structuredCandidates: ReadingMemoryEntry[];
};

export function readingMemoryViewLimits(options: BuildReadingMemoryViewOptions) {
  return {
    fts: normalizeLimit(options.ftsLimit, 5, 20),
    structured: normalizeLimit(options.structuredLimit, 12, 50),
  };
}

export function buildReadingMemoryViewFromCandidates({
  options,
  searchCandidates,
  structuredCandidates,
}: BuildReadingMemoryViewFromCandidatesInput): ReadingMemoryView {
  const limits = readingMemoryViewLimits(options);
  const structured = structuredCandidates
    .filter((entry) => memoryEntryAllowedForView(entry, options))
    .filter((entry) => memoryEntryAllowedByProgress(entry, options.readerProgress))
    .toSorted(memoryViewEntryOrder)
    .slice(-limits.structured);
  const entries: ReadingMemoryView['entries'] = structured.map((entry) => ({
    entry,
    source: 'structured',
  }));
  const seenIds = new Set(structured.map((entry) => entry.id));
  const seenProvenance = new Set(structured.map(memoryEntryProvenanceKey));

  for (const entry of searchCandidates) {
    if (entries.length >= structured.length + limits.fts) break;
    if (seenIds.has(entry.id)) continue;
    if (!memoryEntryAllowedByProgress(entry, options.readerProgress)) continue;
    if (!memoryEntryAllowedForView(entry, options)) continue;

    const provenanceKey = memoryEntryProvenanceKey(entry);
    if (seenProvenance.has(provenanceKey)) continue;
    seenIds.add(entry.id);
    seenProvenance.add(provenanceKey);
    entries.push({ entry, source: 'fts' });
  }

  return {
    articleId: options.articleId,
    viewType: options.viewType,
    viewKey: memoryViewKey(options),
    entries,
    sourceEntryIds: entries.map((item) => item.entry.id),
    updatedAt: latestMemoryEntryUpdatedAt(entries.map((item) => item.entry)),
  };
}

function memoryEntryAllowedForView(
  entry: ReadingMemoryEntry,
  options: BuildReadingMemoryViewOptions,
) {
  if (
    entry.kind !== 'summary' &&
    entry.kind !== 'trace' &&
    entry.kind !== 'correction' &&
    entry.kind !== 'reader_signal'
  ) {
    return false;
  }

  if (options.viewType === 'selection' || options.viewType === 'selection_thread') {
    if (options.chapterId && entry.chapterId && entry.chapterId !== options.chapterId) return false;
    if (!options.textRange || !entry.textRange) return true;
    return rangesNear(entry.textRange, options.textRange, 2400);
  }

  if (options.viewType === 'article_section') {
    if (!options.textRange || !entry.textRange) return true;
    return rangesNear(entry.textRange, options.textRange, 2400);
  }

  if (options.viewType === 'segment') {
    if (entry.scope !== 'segment' && entry.scope !== 'chapter' && entry.scope !== 'reader') {
      return false;
    }
    if (options.chapterId && entry.chapterId && entry.chapterId !== options.chapterId) return false;
    if (!options.textRange || !entry.textRange) return true;
    return entry.textRange.textEnd <= options.textRange.textEnd;
  }

  if (options.viewType === 'chapter') {
    if (entry.scope !== 'chapter' && entry.scope !== 'segment' && entry.scope !== 'reader') {
      return false;
    }
    return !options.chapterId || !entry.chapterId || entry.chapterId === options.chapterId;
  }

  return false;
}

function memoryEntryAllowedByProgress(
  entry: ReadingMemoryEntry,
  progress: ReaderProgress | undefined,
) {
  if (!progress) return true;
  if (entry.chapterId && progress.readChapterIds.includes(entry.chapterId)) return true;
  if (entry.chapterId && entry.chapterId !== progress.currentChapterId) return false;
  if (progress.readUntilTextOffset === undefined || !entry.textRange) return true;
  return entry.textRange.textEnd <= progress.readUntilTextOffset;
}

function memoryViewEntryOrder(left: ReadingMemoryEntry, right: ReadingMemoryEntry) {
  const leftStart = left.textRange?.textStart ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.textRange?.textStart ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) return leftStart - rightStart;
  if (left.updatedAt !== right.updatedAt) return left.updatedAt.localeCompare(right.updatedAt);
  return left.id.localeCompare(right.id);
}

function rangesNear(left: TextRange, right: TextRange, distance: number) {
  if (left.textEnd < right.textStart) return right.textStart - left.textEnd <= distance;
  if (right.textEnd < left.textStart) return left.textStart - right.textEnd <= distance;
  return true;
}

function memoryEntryProvenanceKey(entry: ReadingMemoryEntry) {
  return [
    entry.sourceType,
    entry.sourceId || '',
    entry.sourceTaskId || '',
    entry.supersedesEntryId || '',
    entry.sourceEntryIds.join(','),
    entry.chapterId || '',
    entry.segmentId || '',
    entry.textRange?.textStart ?? '',
    entry.textRange?.textEnd ?? '',
  ].join(':');
}

function memoryViewKey(options: BuildReadingMemoryViewOptions) {
  return [
    options.viewType,
    options.chapterId || '',
    options.segmentId || '',
    options.textRange?.textStart ?? '',
    options.textRange?.textEnd ?? '',
  ].join(':');
}

function latestMemoryEntryUpdatedAt(entries: ReadingMemoryEntry[]) {
  return entries.reduce((latest, entry) => {
    if (!latest || entry.updatedAt > latest) return entry.updatedAt;
    return latest;
  }, '');
}

function normalizeLimit(value: number | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(value || fallback, max));
}
