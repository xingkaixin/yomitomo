import { describe, expect, it } from 'vitest';
import type { Annotation, ReadingMemoryEntry } from '@yomitomo/shared';
import {
  activeReadingMemoryEntries,
  normalizeReadingMemoryEntry,
  readingMemoryAnchorCheckpointEntries,
  readingMemoryEntriesFromAnnotationThread,
  readingMemoryCorrectionEntry,
  readingMemoryEntriesFromMemoryDelta,
  readingMemoryEntryFromAnnotation,
  readingMemoryEntryFromComment,
  readingMemoryFromEntries,
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

  it('creates summary and trace entries from reading memory deltas', () => {
    const entries = readingMemoryEntriesFromMemoryDelta({
      articleId: 'article_1',
      agentId: 'agent_1',
      sourceTaskId: 'task_1',
      createdAt: '2026-05-26T00:00:00.000Z',
      current: {
        updatedAt: '2026-05-26T00:00:00.000Z',
        textSummaries: [],
        readingTraces: [],
      },
      next: {
        updatedAt: '2026-05-26T00:00:00.000Z',
        textSummaries: [
          {
            scope: 'segment',
            chapterId: 'chapter_1',
            segmentId: 'segment_1',
            sourceRange: { textStart: 0, textEnd: 100 },
            summary: '这一段交代人物进入新环境。',
            keyTerms: ['人物'],
            updatedAt: '2026-05-26T00:00:00.000Z',
          },
        ],
        readingTraces: [
          {
            scope: 'chapter',
            chapterId: 'chapter_1',
            agentId: 'agent_1',
            sourceRange: { textStart: 0, textEnd: 100 },
            items: [traceItem('注意人物动机')],
            updatedAt: '2026-05-26T00:00:00.000Z',
          },
        ],
      },
    });

    expect(entries).toMatchObject([
      {
        id: 'task_1_summary_0',
        articleId: 'article_1',
        kind: 'summary',
        scope: 'segment',
        sourceType: 'ai_task',
        sourceTaskId: 'task_1',
        payload: { summary: '这一段交代人物进入新环境。', keyTerms: ['人物'] },
      },
      {
        id: 'task_1_trace_1',
        articleId: 'article_1',
        kind: 'trace',
        scope: 'chapter',
        sourceType: 'ai_task',
        sourceTaskId: 'task_1',
        payload: { items: [traceItem('注意人物动机')] },
      },
    ]);
  });

  it('creates deterministic memory entries from user annotations', () => {
    const memoryEntry = readingMemoryEntryFromAnnotation({
      articleId: 'article_1',
      annotation: annotation({
        author: 'user',
        userId: 'reader_1',
        userUsername: 'kevin',
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
      author: 'ai',
      agentId: 'agent_1',
      comments: [
        {
          id: 'comment_1',
          author: 'ai',
          content: '  这里保留助手原始回复  ',
          createdAt: '2026-05-26T00:10:00.000Z',
          agentId: 'agent_1',
          agentUsername: 'lin',
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
            author: 'user',
            content: '用户补充自己的想法',
            createdAt: '2026-05-26T00:10:00.000Z',
            userId: 'reader_1',
          },
          {
            id: 'comment_blank',
            author: 'user',
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

  it('skips unchanged memory facts when building delta entries', () => {
    const memory = {
      updatedAt: '2026-05-26T00:00:00.000Z',
      textSummaries: [
        {
          scope: 'segment' as const,
          chapterId: 'chapter_1',
          segmentId: 'segment_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          summary: '旧摘要',
          keyTerms: ['旧'],
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
      readingTraces: [],
    };

    expect(
      readingMemoryEntriesFromMemoryDelta({
        articleId: 'article_1',
        sourceTaskId: 'task_1',
        createdAt: '2026-05-26T00:00:00.000Z',
        current: memory,
        next: memory,
      }),
    ).toEqual([]);
  });

  it('projects active summary and trace entries to legacy reading memory', () => {
    const memory = readingMemoryFromEntries([
      entry({
        id: 'summary_1',
        kind: 'summary',
        payload: { summary: '投影摘要', keyTerms: ['投影'] },
      }),
      entry({
        id: 'trace_1',
        kind: 'trace',
        payload: { items: [traceItem('投影 trace')] },
        updatedAt: '2026-05-26T01:00:00.000Z',
      }),
    ]);

    expect(memory).toEqual({
      updatedAt: '2026-05-26T01:00:00.000Z',
      textSummaries: [
        {
          scope: 'segment',
          chapterId: 'chapter_1',
          segmentId: 'segment_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          summary: '投影摘要',
          keyTerms: ['投影'],
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
      readingTraces: [
        {
          scope: 'segment',
          chapterId: 'chapter_1',
          segmentId: 'segment_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          items: [traceItem('投影 trace')],
          updatedAt: '2026-05-26T01:00:00.000Z',
        },
      ],
    });
  });

  it('excludes deleted and superseded entries from legacy projection', () => {
    const memory = readingMemoryFromEntries([
      entry({ id: 'old', payload: { summary: '旧摘要', keyTerms: [] } }),
      entry({
        id: 'deleted',
        deletedAt: '2026-05-26T01:00:00.000Z',
        payload: { summary: '删除摘要', keyTerms: [] },
      }),
      entry({
        id: 'new',
        supersedesEntryId: 'old',
        payload: { summary: '新摘要', keyTerms: [] },
      }),
    ]);

    expect(memory?.textSummaries.map((summary) => summary.summary)).toEqual(['新摘要']);
  });

  it('creates anchor checkpoint entries for memory facts', () => {
    const checkpoints = readingMemoryAnchorCheckpointEntries({
      articleText: '前文。目标句子在这里。后文。',
      sourceTaskId: 'task_1',
      createdAt: '2026-05-26T00:00:00.000Z',
      entries: [
        entry({
          id: 'summary_1',
          textRange: { textStart: 3, textEnd: 11 },
        }),
      ],
    });

    expect(checkpoints).toMatchObject([
      {
        id: 'task_1_anchor_0',
        kind: 'anchor',
        articleId: 'article_1',
        sourceEntryIds: ['summary_1'],
        anchor: {
          exact: '目标句子在这里。',
          start: 3,
          end: 11,
        },
        payload: {
          label: 'summary:segment',
        },
      },
    ]);
  });

  it('projects correction entries while excluding the superseded fact', () => {
    const old = entry({
      id: 'old_trace',
      kind: 'trace',
      payload: { items: [traceItem('旧判断')] },
    });
    const correction = readingMemoryCorrectionEntry({
      id: 'correction_1',
      articleId: 'article_1',
      targetEntry: old,
      reason: '旧判断不成立',
      replacement: '应理解为人物在试探环境',
      createdAt: '2026-05-26T01:00:00.000Z',
      anchor: {
        exact: '目标句子',
        prefix: '',
        suffix: '',
        start: 3,
        end: 7,
      },
    });

    expect(correction).toMatchObject({
      kind: 'correction',
      sourceType: 'correction',
      sourceEntryIds: ['old_trace'],
      supersedesEntryId: 'old_trace',
    });

    const memory = readingMemoryFromEntries([old, correction!]);

    expect(
      memory?.readingTraces.flatMap((trace) => trace.items.map((item) => item.content)),
    ).toEqual(['correction：旧判断不成立；replacement：应理解为人物在试探环境']);
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

function traceItem(content: string) {
  return {
    type: 'agent_observation' as const,
    content,
    evidenceAnchors: [],
    confidence: 'medium' as const,
    createdFromTask: 'chapter_segment_annotation',
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
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}
