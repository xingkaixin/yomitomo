import { describe, expect, it } from 'vitest';
import type { Annotation, ReadingMemoryEntry } from '@yomitomo/shared';
import {
  activeReadingMemoryEntries,
  normalizeReadingMemoryEntry,
  readingMemoryEntriesFromAnnotationThread,
  readingMemoryEntryFromAnnotation,
  readingMemoryEntryFromComment,
  readingMemoryEntrySearchText,
} from './reading-memory-entries';
import { parseReadingMemoryEntryPayload } from './reading-memory-entry-payload';

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

  it('rejects payloads that conflict with their source type', () => {
    expect(
      parseReadingMemoryEntryPayload(
        entry({
          kind: 'summary',
          sourceType: 'comment',
          payload: { summary: 'not a comment', keyTerms: [] },
        }),
      ),
    ).toBeNull();
  });

  it('rejects incomplete trace items', () => {
    expect(
      parseReadingMemoryEntryPayload(
        entry({
          kind: 'trace',
          payload: { items: [{ content: 'missing trace metadata' }] },
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

  it('creates deterministic memory entries from user annotations', () => {
    const memoryEntry = readingMemoryEntryFromAnnotation({
      articleId: 'article_1',
      annotation: annotation({
        author: { kind: 'user', userId: 'reader_1', username: 'kevin' },
        annotationType: 'question',
        readingIntent: 'question',
      }),
    });

    expect(memoryEntry).toMatchObject({
      id: 'annotation_memory_annotation_1',
      articleId: 'article_1',
      kind: 'reader_signal',
      scope: 'reader',
      readerId: 'reader_1',
      sourceType: 'annotation',
      sourceId: 'annotation_1',
      sourceAnnotationId: 'annotation_1',
      textRange: { textStart: 10, textEnd: 14 },
      anchor: { exact: '目标句子' },
      payload: {
        source: 'annotation',
        author: 'user',
        annotationType: 'question',
        readingIntent: 'question',
        anchorExact: '目标句子',
        userUsername: 'kevin',
      },
    });
  });

  it('creates deterministic memory entries from assistant comments with raw content', () => {
    const source = annotation({
      author: { kind: 'agent', agentId: 'agent_1', username: 'lin' },
      comments: [
        {
          id: 'comment_1',
          author: { kind: 'agent', agentId: 'agent_1', username: 'lin' },
          content: '  这里保留助手原始回复  ',
          createdAt: '2026-05-26T00:10:00.000Z',
          readingIntent: 'explain',
        },
      ],
    });
    const memoryEntry = readingMemoryEntryFromComment({
      articleId: 'article_1',
      annotation: source,
      comment: source.comments[0],
    });

    expect(memoryEntry).toMatchObject({
      id: 'comment_memory_comment_1',
      articleId: 'article_1',
      kind: 'trace',
      scope: 'agent',
      agentId: 'agent_1',
      sourceType: 'comment',
      sourceId: 'comment_1',
      sourceAnnotationId: 'annotation_1',
      sourceCommentId: 'comment_1',
      sourceEntryIds: ['annotation_memory_annotation_1'],
      payload: {
        source: 'comment',
        author: 'ai',
        content: '这里保留助手原始回复',
        annotationId: 'annotation_1',
        anchorExact: '目标句子',
        agentUsername: 'lin',
      },
    });
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
