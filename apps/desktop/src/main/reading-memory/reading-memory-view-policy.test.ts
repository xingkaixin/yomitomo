import { describe, expect, it } from 'vitest';
import type { ReadingMemoryEntry } from '@yomitomo/shared';
import { buildReadingMemoryViewFromCandidates } from './reading-memory-view-policy';

describe('reading memory view policy', () => {
  it('combines bounded structured and search candidates without exposing unread memory', () => {
    const prior = entry({
      id: 'prior',
      sourceTaskId: 'task_prior',
      textRange: { textStart: 50, textEnd: 70 },
    });
    const future = entry({
      id: 'future',
      sourceTaskId: 'task_future',
      textRange: { textStart: 130, textEnd: 160 },
    });
    const searched = entry({
      id: 'searched',
      sourceTaskId: 'task_searched',
      textRange: { textStart: 0, textEnd: 40 },
    });

    const view = buildReadingMemoryViewFromCandidates({
      options: {
        articleId: 'article_1',
        viewType: 'segment',
        chapterId: 'chapter_1',
        segmentId: 'segment_2',
        textRange: { textStart: 80, textEnd: 100 },
        structuredLimit: 1,
        readerProgress: {
          currentChapterId: 'chapter_1',
          currentSegmentId: 'segment_2',
          readChapterIds: [],
          readUntilTextOffset: 100,
        },
      },
      structuredCandidates: [prior, future],
      searchCandidates: [prior, searched, future],
    });

    expect(view.entries.map((item) => [item.entry.id, item.source])).toEqual([
      ['prior', 'structured'],
      ['searched', 'fts'],
    ]);
    expect(view.sourceEntryIds).toEqual(['prior', 'searched']);
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
    payload: { summary: 'memory topic', keyTerms: ['memory'] },
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}
