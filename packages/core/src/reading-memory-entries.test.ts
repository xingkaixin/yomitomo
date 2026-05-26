import { describe, expect, it } from 'vitest';
import type { ReadingMemoryEntry } from '@yomitomo/shared';
import {
  activeReadingMemoryEntries,
  normalizeReadingMemoryEntry,
  readingMemoryEntrySearchText,
} from './reading-memory-entries';

describe('reading memory entries', () => {
  it('normalizes valid entries and deduplicates source entry ids', () => {
    const normalized = normalizeReadingMemoryEntry(
      entry({
        sourceEntryIds: ['entry_a', 'entry_a', ' entry_b '],
      }),
    );

    expect(normalized).toMatchObject({
      id: 'entry_1',
      articleId: 'article_1',
      payloadVersion: 1,
      sourceEntryIds: ['entry_a', 'entry_b'],
    });
  });

  it('rejects invalid payload versions and text ranges', () => {
    expect(normalizeReadingMemoryEntry(entry({ payloadVersion: 0 }))).toBeNull();
    expect(
      normalizeReadingMemoryEntry(
        entry({
          textRange: { textStart: 20, textEnd: 20 },
        }),
      ),
    ).toBeNull();
  });

  it('filters deleted and superseded entries from active views', () => {
    const entries = [
      entry({ id: 'old' }),
      entry({ id: 'deleted', deletedAt: '2026-05-26T00:00:00.000Z' }),
      entry({ id: 'new', supersedesEntryId: 'old' }),
    ];

    expect(activeReadingMemoryEntries(entries).map((item) => item.id)).toEqual(['new']);
  });

  it('builds searchable text from payload and anchor text', () => {
    const text = readingMemoryEntrySearchText(
      entry({
        kind: 'trace',
        anchor: {
          exact: '关键原文',
          prefix: '',
          suffix: '',
          start: 0,
          end: 4,
        },
        payload: {
          items: [
            {
              type: 'agent_observation',
              content: '助手注意到人物动机变化',
              evidenceAnchors: [],
              confidence: 'medium',
              createdFromTask: 'chapter_segment_annotation',
            },
          ],
        },
      }),
    );

    expect(text).toBe(
      'agent_observation 助手注意到人物动机变化 medium chapter_segment_annotation 关键原文',
    );
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
