import type {
  ReadingMemoryEntry,
  ReadingMemoryEntryKind,
  ReadingMemoryScope,
  ReadingMemorySourceType,
  ReadingMemoryVisibility,
  TextRange,
} from '@yomitomo/shared';

const ENTRY_KINDS = new Set<ReadingMemoryEntryKind>([
  'summary',
  'trace',
  'anchor',
  'correction',
  'reader_signal',
  'progress',
  'preference',
  'retrieval_note',
]);

const ENTRY_SCOPES = new Set<ReadingMemoryScope>(['segment', 'chapter', 'book', 'reader', 'agent']);

const ENTRY_VISIBILITIES = new Set<ReadingMemoryVisibility>([
  'default',
  'hidden',
  'agent_private',
  'debug_only',
]);

const SOURCE_TYPES = new Set<ReadingMemorySourceType>([
  'original_text',
  'ai_task',
  'annotation',
  'comment',
  'progress',
  'correction',
  'import',
]);

export function normalizeReadingMemoryEntry(entry: ReadingMemoryEntry): ReadingMemoryEntry | null {
  if (!entry.id || !entry.articleId || !entry.createdAt || !entry.updatedAt) return null;
  if (!ENTRY_KINDS.has(entry.kind)) return null;
  if (!ENTRY_SCOPES.has(entry.scope)) return null;
  if (!ENTRY_VISIBILITIES.has(entry.visibility)) return null;
  if (!SOURCE_TYPES.has(entry.sourceType)) return null;
  if (!Number.isInteger(entry.payloadVersion) || entry.payloadVersion < 1) return null;

  const textRange = normalizeTextRange(entry.textRange);
  if (entry.textRange && !textRange) return null;

  return {
    ...entry,
    textRange: textRange || undefined,
    sourceEntryIds: uniqueStrings(entry.sourceEntryIds || []),
  };
}

export function activeReadingMemoryEntries(entries: ReadingMemoryEntry[]) {
  return applySupersededEntryFilter(entries.filter((entry) => !entry.deletedAt));
}

export function applySupersededEntryFilter(entries: ReadingMemoryEntry[]) {
  const supersededIds = new Set(
    entries.map((entry) => entry.supersedesEntryId).filter((id): id is string => Boolean(id)),
  );
  if (supersededIds.size === 0) return entries;
  return entries.filter((entry) => !supersededIds.has(entry.id));
}

export function readingMemoryEntrySearchText(entry: ReadingMemoryEntry) {
  const parts = collectSearchTextParts(entry.payload);
  if (entry.anchor?.exact) parts.push(entry.anchor.exact);
  return compactSearchText(parts.join(' '));
}

function normalizeTextRange(range: TextRange | undefined) {
  if (!range) return undefined;
  if (!Number.isInteger(range.textStart) || !Number.isInteger(range.textEnd)) return null;
  if (range.textEnd <= range.textStart) return null;
  return range;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function collectSearchTextParts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  if (Array.isArray(value)) return value.flatMap(collectSearchTextParts);

  const parts: string[] = [];
  for (const item of Object.values(value)) {
    parts.push(...collectSearchTextParts(item));
  }
  return parts;
}

function compactSearchText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}
