import { describe, expect, it } from 'vitest';
import type {
  AgentRoleCard,
  BaseReadingContext,
  ChapterDescriptor,
  ContextSourceLabel,
  ContextSourceType,
  ReadingTaskContext,
  SourceLabeledContextBlock,
  SpoilerPolicy,
  TextAnchor,
} from '@yomitomo/shared';
import {
  collectReadingContextBlocks,
  packReadingContext,
  packReadingContextBlocks,
} from './context-packing';

describe('reading context packing', () => {
  it('orders blocks by budget policy type order', () => {
    const packed = packReadingContextBlocks(
      [
        block('retrieved', 'evidence', source('retrieved_evidence')),
        block('selection', 'selected text', source('selection')),
        block('window', 'local window', source('local_window')),
      ],
      {
        maxTokens: 100,
        blockTypeOrder: ['selection', 'local_window', 'retrieved_evidence'],
      },
      { estimateTokens: (text) => text.length },
    );

    expect(packed.blocks.map((item) => item.id)).toEqual(['selection', 'window', 'retrieved']);
  });

  it('reserves budget for later block types', () => {
    const packed = packReadingContextBlocks(
      [
        block('window', '12345678901234567890', source('local_window')),
        block('selection', 'abcd', source('selection')),
      ],
      {
        maxTokens: 10,
        blockTypeOrder: ['local_window', 'selection'],
        reserveTokensByType: { selection: 4 },
      },
      { estimateTokens: (text) => text.length },
    );

    expect(packed.blocks.map((item) => [item.id, item.text])).toEqual([
      ['window', '123456'],
      ['selection', 'abcd'],
    ]);
    expect(packed.usedTokens).toBe(10);
    expect(packed.blocks[0]?.truncated).toBe(true);
    expect(packed.blocks[1]?.truncated).toBe(false);
  });

  it('keeps source labels on packed blocks', () => {
    const label = source('retrieved_evidence', {
      articleId: 'book-1',
      chapterId: 'chapter-1',
      segmentId: 'segment-1',
      paragraphId: 'paragraph-1',
      score: 0.8,
      source: 'exact-match',
    });

    const packed = packReadingContextBlocks(
      [block('evidence', 'source labeled evidence', label)],
      { maxTokens: 100 },
      { estimateTokens: (text) => text.length },
    );

    expect(packed.blocks[0]?.source).toEqual(label);
  });

  it('packs lexical related passages under the retrieved evidence budget', () => {
    const packed = packReadingContextBlocks(
      [
        block('selection', '目标文本', source('selection')),
        block('related-1', '1234567890', source('retrieved_evidence')),
        block('related-2', 'abcdef', source('retrieved_evidence')),
      ],
      {
        maxTokens: 12,
        blockTypeOrder: ['selection', 'retrieved_evidence'],
        reserveTokensByType: { retrieved_evidence: 6 },
      },
      { estimateTokens: (text) => text.length },
    );

    expect(packed.blocks.map((item) => [item.id, item.text])).toEqual([
      ['selection', '目标文本'],
      ['related-1', '123456'],
    ]);
    expect(packed.omittedBlocks.map((item) => item.block.id)).toEqual(['related-2']);
  });

  it('collects all first-phase task context views', () => {
    const contexts: ReadingTaskContext[] = [
      {
        ...baseContext('selection_annotation'),
        task: 'selection_annotation',
        selection: anchor('关键句'),
        localWindow: { blocks: [block('window', '前后段落', source('local_window'))] },
        retrievedEvidence: [
          {
            id: 'selection-passage-1',
            text: '同章召回',
            source: source('retrieved_evidence'),
          },
        ],
        nearbyAnnotations: [
          {
            annotationId: 'annotation-1',
            text: '附近批注',
            source: source('nearby_annotation'),
          },
        ],
        chapterMemory: {
          chapterId: 'chapter-1',
          summary: '章节记忆',
          source: source('chapter_memory'),
        },
      },
      {
        ...baseContext('selection_thread_reply'),
        task: 'selection_thread_reply',
        originalSelection: anchor('原选区'),
        localWindow: { blocks: [block('thread-window', '讨论局部上下文', source('local_window'))] },
        thread: {
          annotationId: 'annotation-1',
          messages: [
            {
              commentId: 'comment-1',
              author: 'user',
              text: '读者追问',
              source: source('thread'),
            },
          ],
        },
        retrievedEvidence: [
          {
            id: 'passage-1',
            text: '召回证据',
            source: source('retrieved_evidence'),
          },
        ],
      },
      {
        ...baseContext('chapter_route'),
        task: 'chapter_route',
        toc: [chapterDescriptor()],
        readerGoal: '重点看论证',
        agents: [agentRoleCard()],
      },
      {
        ...baseContext('chapter_segment_annotation'),
        task: 'chapter_segment_annotation',
        currentSegment: {
          segmentId: 'segment-1',
          text: '当前 segment',
          source: source('segment'),
        },
        retrievedEvidence: [
          {
            id: 'segment-passage-1',
            text: '前文相似段落',
            source: source('retrieved_evidence'),
          },
        ],
        previousMemory: {
          segmentId: 'segment-0',
          summary: '上一段记忆',
          source: source('segment_memory'),
        },
        previousTrace: {
          segmentId: 'segment-0',
          events: ['上一段关注过定义'],
          source: source('segment_trace'),
        },
        nextPreview: '下一段预览',
        chapterTrace: {
          chapterId: 'chapter-1',
          events: ['已经批注过相同观点'],
          source: source('chapter_trace'),
        },
        allowedAnchorRange: { textStart: 0, textEnd: 20 },
        dedupContext: {
          recentAnchors: [anchor('相同观点')],
          recentComments: ['已有评论'],
          source: source('dedup'),
        },
      },
    ];

    expect(contexts.map((context) => context.task)).toEqual([
      'selection_annotation',
      'selection_thread_reply',
      'chapter_route',
      'chapter_segment_annotation',
    ]);
    expect(contexts.flatMap(collectReadingContextBlocks).map((item) => item.source.type)).toEqual([
      'selection',
      'local_window',
      'retrieved_evidence',
      'nearby_annotation',
      'chapter_memory',
      'selection',
      'local_window',
      'thread',
      'retrieved_evidence',
      'reader_goal',
      'toc',
      'agent_role',
      'segment',
      'retrieved_evidence',
      'segment_memory',
      'segment_trace',
      'next_preview',
      'chapter_trace',
      'dedup',
    ]);
    expect(
      contexts.map(
        (context) =>
          packReadingContext(context, { estimateTokens: (text) => text.length }).blocks.length,
      ),
    ).toEqual([5, 4, 3, 7]);
  });
});

function baseContext(task: ReadingTaskContext['task']): BaseReadingContext {
  return {
    book: {
      articleId: 'book-1',
      title: '长书',
      url: 'ebook://book-1',
      sourceType: 'ebook',
      textLength: 1000,
    },
    location: {
      chapterId: 'chapter-1',
      segmentId: 'segment-1',
      textRange: { textStart: 0, textEnd: 100 },
    },
    agent: {
      agentId: 'agent-1',
      agentUsername: 'lin',
      readingIntent: 'explain',
    },
    budget: {
      maxTokens: 100,
      blockTypeOrder: blockOrder(task),
    },
    evidencePolicy: {
      spoilerPolicy,
    },
  };
}

function blockOrder(task: ReadingTaskContext['task']): ContextSourceType[] {
  if (task === 'selection_annotation') {
    return [
      'selection',
      'local_window',
      'retrieved_evidence',
      'nearby_annotation',
      'chapter_memory',
    ];
  }
  if (task === 'selection_thread_reply') {
    return ['selection', 'local_window', 'thread', 'retrieved_evidence'];
  }
  if (task === 'chapter_route') {
    return ['reader_goal', 'toc', 'agent_role'];
  }
  return [
    'segment',
    'retrieved_evidence',
    'segment_memory',
    'segment_trace',
    'next_preview',
    'chapter_trace',
    'dedup',
  ];
}

function block(id: string, text: string, label: ContextSourceLabel): SourceLabeledContextBlock {
  return { id, text, source: label };
}

function source(
  type: ContextSourceLabel['type'],
  overrides: Partial<ContextSourceLabel> = {},
): ContextSourceLabel {
  return {
    type,
    articleId: 'book-1',
    chapterId: 'chapter-1',
    ...overrides,
  };
}

function anchor(exact: string): TextAnchor {
  return {
    exact,
    prefix: '',
    suffix: '',
    start: 0,
    end: exact.length,
    chapterId: 'chapter-1',
    segmentId: 'segment-1',
    paragraphId: 'paragraph-1',
  };
}

function chapterDescriptor(): ChapterDescriptor {
  return {
    chapterId: 'chapter-1',
    title: '第一章',
    indexInBook: 0,
    textLength: 100,
    segmentCount: 2,
    source: source('toc'),
  };
}

function agentRoleCard(): AgentRoleCard {
  return {
    agentId: 'agent-1',
    agentUsername: 'lin',
    nickname: '林知微',
    roleCard: '角色卡',
    source: source('agent_role'),
  };
}

const spoilerPolicy: SpoilerPolicy = {
  allowedScope: 'read-so-far',
  allowFutureChapterEvidence: false,
  allowFuturePlotEvents: false,
};
