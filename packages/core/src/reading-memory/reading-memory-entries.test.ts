import { describe, expect, it } from 'vitest';
import type { Annotation, ReadingMemoryEntry } from '@yomitomo/shared';
import {
  activeReadingMemoryEntries,
  normalizeReadingMemoryEntry,
  readingMemoryEntriesFromAnnotationThread,
  readingMemoryEntrySearchText,
} from './reading-memory-entries';
import { parseReadingMemoryEntryPayload } from './reading-memory-entry-payload';

describe('reading memory entries', () => {
  it('preserves future payload versions without interpreting them', () => {
    const futureEntry = entry({
      kind: 'summary',
      payloadVersion: 2,
      textRange: { textStart: 0, textEnd: 10 },
      payload: { summary: 'future summary', keyTerms: [] },
    });

    expect(normalizeReadingMemoryEntry(futureEntry)).toEqual(futureEntry);
    expect(parseReadingMemoryEntryPayload(futureEntry)).toBeNull();
  });

  it('filters deleted and superseded entries from active views', () => {
    const entries = [
      entry({ id: 'old' }),
      entry({ id: 'deleted', deletedAt: '2026-05-26T00:00:00.000Z' }),
      entry({ id: 'new', supersedesEntryId: 'old' }),
    ];

    expect(activeReadingMemoryEntries(entries).map((item) => item.id)).toEqual(['new']);
  });

  it('creates annotation thread memory entries and skips blank comments', () => {
    const entries = readingMemoryEntriesFromAnnotationThread({
      articleId: 'article_1',
      annotation: annotation({
        comments: [
          {
            id: 'comment_1',
            author: { kind: 'user', userId: 'reader_1', username: 'reader' },
            content: '用户补充自己的想法',
            createdAt: '2026-05-26T00:10:00.000Z',
          },
          {
            id: 'comment_blank',
            author: { kind: 'user', username: 'reader' },
            content: '  ',
            createdAt: '2026-05-26T00:11:00.000Z',
          },
        ],
      }),
    });

    expect(entries.map((item) => item.id)).toEqual([
      'annotation_memory_annotation_1',
      'comment_memory_comment_1',
    ]);
    expect(readingMemoryEntrySearchText(entries[1])).toContain('用户补充自己的想法');
  });
});

function entry(overrides: Partial<ReadingMemoryEntry> = {}): ReadingMemoryEntry {
  return {
    id: 'entry_1',
    articleId: 'article_1',
    kind: 'summary',
    scope: 'segment',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: 'chapter_1',
    segmentId: 'segment_1',
    textRange: { textStart: 0, textEnd: 100 },
    sourceType: 'ai_task',
    sourceTaskId: 'task_1',
    sourceEntryIds: [],
    payload: {
      summary: '这一段交代人物进入新环境。',
      keyTerms: ['人物', '环境'],
    },
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '目标句子',
      prefix: '前文',
      suffix: '后文',
      start: 10,
      end: 14,
      chapterId: 'chapter_1',
      segmentId: 'segment_1',
      paragraphId: 'paragraph_1',
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}
