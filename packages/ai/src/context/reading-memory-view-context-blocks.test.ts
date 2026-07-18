import { describe, expect, it } from 'vitest';
import type { ReadingMemoryView } from '@yomitomo/shared';
import { readingMemoryViewContextBlocks } from './reading-memory-view-context-blocks';

describe('reading view assembler', () => {
  it('turns memory view entries into source labeled context blocks', () => {
    const blocks = readingMemoryViewContextBlocks({
      articleId: 'article_1',
      viewType: 'segment',
      viewKey: 'segment:chapter_1:segment_1:0:100',
      sourceEntryIds: ['summary_1', 'correction_1'],
      updatedAt: '2026-05-26T00:00:00.000Z',
      entries: [
        {
          source: 'structured',
          entry: {
            id: 'summary_1',
            articleId: 'article_1',
            kind: 'summary',
            scope: 'segment',
            visibility: 'default',
            payloadVersion: 1,
            chapterId: 'chapter_1',
            segmentId: 'segment_1',
            textRange: { textStart: 0, textEnd: 80 },
            sourceType: 'ai_task',
            sourceEntryIds: [],
            payload: { summary: '人物误读了灯笼线索', keyTerms: ['灯笼'] },
            createdAt: '2026-05-26T00:00:00.000Z',
            updatedAt: '2026-05-26T00:00:00.000Z',
          },
        },
        {
          source: 'fts',
          entry: {
            id: 'correction_1',
            articleId: 'article_1',
            kind: 'correction',
            scope: 'segment',
            visibility: 'default',
            payloadVersion: 1,
            chapterId: 'chapter_1',
            segmentId: 'segment_1',
            sourceType: 'correction',
            sourceEntryIds: ['trace_1'],
            supersedesEntryId: 'trace_1',
            payload: { reason: '旧判断不成立', replacement: '灯笼是试探信号' },
            createdAt: '2026-05-26T00:01:00.000Z',
            updatedAt: '2026-05-26T00:01:00.000Z',
          },
        },
      ],
    } satisfies ReadingMemoryView);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      source: {
        type: 'memory_view',
        articleId: 'article_1',
        chapterId: 'chapter_1',
        segmentId: 'segment_1',
        source: 'reading-memory-structured',
      },
    });
    expect(blocks.map((block) => block.text).join('\n')).toContain('人物误读了灯笼线索');
    expect(blocks.map((block) => block.text).join('\n')).toContain('灯笼是试探信号');
  });

  it('keeps annotation and comment memory payloads available as context', () => {
    const blocks = readingMemoryViewContextBlocks({
      articleId: 'article_1',
      viewType: 'selection',
      viewKey: 'selection:::10:14',
      sourceEntryIds: ['reader_annotation', 'assistant_comment'],
      updatedAt: '2026-05-26T00:00:00.000Z',
      entries: [
        {
          source: 'structured',
          entry: {
            id: 'reader_annotation',
            articleId: 'article_1',
            kind: 'reader_signal',
            scope: 'reader',
            visibility: 'default',
            payloadVersion: 1,
            textRange: { textStart: 10, textEnd: 14 },
            sourceType: 'annotation',
            sourceAnnotationId: 'annotation_1',
            sourceEntryIds: [],
            payload: {
              source: 'annotation',
              author: 'user',
              annotationType: 'question',
              anchorExact: '目标句子',
            },
            createdAt: '2026-05-26T00:00:00.000Z',
            updatedAt: '2026-05-26T00:00:00.000Z',
          },
        },
        {
          source: 'fts',
          entry: {
            id: 'assistant_comment',
            articleId: 'article_1',
            kind: 'trace',
            scope: 'agent',
            visibility: 'default',
            payloadVersion: 1,
            textRange: { textStart: 10, textEnd: 14 },
            agentId: 'agent_1',
            sourceType: 'comment',
            sourceAnnotationId: 'annotation_1',
            sourceCommentId: 'comment_1',
            sourceEntryIds: ['reader_annotation'],
            payload: {
              source: 'comment',
              author: 'ai',
              content: '这里保留助手原始回复',
            },
            createdAt: '2026-05-26T00:01:00.000Z',
            updatedAt: '2026-05-26T00:01:00.000Z',
          },
        },
      ],
    } satisfies ReadingMemoryView);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.text).join('\n')).toContain('目标句子');
    expect(blocks.map((block) => block.text).join('\n')).toContain('这里保留助手原始回复');
  });
});
