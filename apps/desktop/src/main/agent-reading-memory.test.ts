import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
  ReadingMemoryEntry,
  EpubBookIndex,
} from '@yomitomo/shared';

const memoryStore = vi.hoisted(() => ({
  appendReadingMemoryEntries: vi.fn(),
  buildReadingMemoryView: vi.fn(),
  readReadingMemoryEntries: vi.fn(),
}));

vi.mock('./reading-memory-store', () => memoryStore);

import {
  agentAnnotatePayloadWithReadingMemoryEntries,
  agentMessagePayloadWithReadingMemoryView,
  saveAgentAnnotateReadingMemoryEntries,
} from './agent-reading-memory';

describe('agent reading memory persistence', () => {
  beforeEach(() => {
    memoryStore.appendReadingMemoryEntries.mockReset();
    memoryStore.buildReadingMemoryView.mockReset();
    memoryStore.readReadingMemoryEntries.mockReset();
  });

  it('uses memory entries before legacy annotate payload memory', () => {
    memoryStore.readReadingMemoryEntries.mockReturnValue([
      memoryEntry({
        id: 'entry_summary',
        payload: { summary: 'entries 摘要', keyTerms: ['entries'] },
      }),
    ]);

    const payload = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: annotatePayload({
        readingMemory: {
          updatedAt: '2026-05-26T00:00:00.000Z',
          textSummaries: [
            {
              scope: 'segment',
              chapterId: 'chapter_1',
              segmentId: 'segment_1',
              sourceRange: { textStart: 0, textEnd: 100 },
              summary: '旧 JSON 摘要',
              keyTerms: ['旧'],
              updatedAt: '2026-05-26T00:00:00.000Z',
            },
          ],
          readingTraces: [],
        },
      }),
      logError: vi.fn(),
    });

    expect(payload.readingMemory?.textSummaries.map((summary) => summary.summary)).toEqual([
      'entries 摘要',
    ]);
  });

  it('attaches a segment memory view for EPUB co-reading payloads', () => {
    const logInfo = vi.fn();
    memoryStore.readReadingMemoryEntries.mockReturnValue([
      memoryEntry({
        id: 'entry_summary',
        payload: { summary: 'entries 摘要', keyTerms: ['entries'] },
      }),
    ]);
    memoryStore.buildReadingMemoryView.mockReturnValue({
      articleId: 'article_1',
      viewType: 'segment',
      viewKey: 'segment:chapter_1:segment_1:0:100',
      entries: [],
      sourceEntryIds: [],
      updatedAt: '2026-05-26T00:00:00.000Z',
    });

    const payload = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: annotatePayload({
        article: {
          ...annotatePayload().article,
          ebookIndex: ebookIndex(),
        },
        readingPlan: [
          {
            sectionId: 'section_1',
            sectionTitle: '章节',
            sectionStart: 0,
            sectionEnd: 100,
            sectionSummary: '灯笼线索',
            sectionTag: 'clue',
          },
        ],
      }),
      logInfo,
      logError: vi.fn(),
    });

    expect(memoryStore.buildReadingMemoryView).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article_1',
        viewType: 'segment',
        chapterId: 'chapter_1',
        segmentId: 'segment_1',
        textRange: { textStart: 0, textEnd: 100 },
        query: expect.stringContaining('灯笼线索'),
        performanceLogger: logInfo,
      }),
    );
    expect(payload.readingMemoryView?.viewType).toBe('segment');
  });

  it('attaches an article section memory view for non-EPUB reading plans', () => {
    const logInfo = vi.fn();
    memoryStore.readReadingMemoryEntries.mockReturnValue([]);
    memoryStore.buildReadingMemoryView.mockReturnValue({
      articleId: 'article_1',
      viewType: 'article_section',
      viewKey: 'article_section:::10:60',
      entries: [
        {
          source: 'structured',
          entry: memoryEntry({
            id: 'comment_memory_comment_1',
            kind: 'reader_signal',
            scope: 'reader',
            textRange: { textStart: 20, textEnd: 30 },
            sourceType: 'comment',
            sourceCommentId: 'comment_1',
            payload: { source: 'comment', author: 'user', content: '既有 section 讨论' },
          }),
        },
      ],
      sourceEntryIds: ['comment_memory_comment_1'],
      updatedAt: '2026-05-26T00:00:00.000Z',
    });

    const payload = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: annotatePayload({
        instruction: '关注争议点',
        readingPlan: [
          {
            sectionId: 'section_1',
            sectionTitle: '第一节',
            sectionStart: 10,
            sectionEnd: 60,
            sectionSummary: '增长判断',
            sectionTag: 'growth',
          },
        ],
      }),
      logInfo,
      logError: vi.fn(),
    });

    expect(memoryStore.buildReadingMemoryView).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article_1',
        viewType: 'article_section',
        textRange: { textStart: 10, textEnd: 60 },
        query: expect.stringContaining('增长判断'),
        performanceLogger: logInfo,
      }),
    );
    expect(payload.readingMemoryView?.viewType).toBe('article_section');
  });

  it('attaches a selection memory view for target annotations', () => {
    const logInfo = vi.fn();
    memoryStore.readReadingMemoryEntries.mockReturnValue([]);
    memoryStore.buildReadingMemoryView.mockReturnValue({
      articleId: 'article_1',
      viewType: 'selection',
      viewKey: 'selection:::2:6',
      entries: [
        {
          source: 'structured',
          entry: memoryEntry({
            id: 'comment_memory_comment_1',
            kind: 'trace',
            scope: 'agent',
            textRange: { textStart: 2, textEnd: 6 },
            sourceType: 'comment',
            sourceCommentId: 'comment_1',
            payload: { source: 'comment', author: 'ai', content: '既有讨论' },
          }),
        },
      ],
      sourceEntryIds: ['comment_memory_comment_1'],
      updatedAt: '2026-05-26T00:00:00.000Z',
    });

    const payload = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: annotatePayload({
        targetAnchor: {
          start: 2,
          end: 6,
          exact: '目标句子',
          prefix: '前文',
          suffix: '后文',
        },
        instruction: '解释这里',
      }),
      logInfo,
      logError: vi.fn(),
    });

    expect(memoryStore.buildReadingMemoryView).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article_1',
        viewType: 'selection',
        textRange: { textStart: 2, textEnd: 6 },
        query: expect.stringContaining('目标句子'),
        performanceLogger: logInfo,
      }),
    );
    expect(payload.readingMemoryView?.viewType).toBe('selection');
  });

  it('keeps legacy annotate payload memory when no entries exist', () => {
    memoryStore.readReadingMemoryEntries.mockReturnValue([]);
    const legacyMemory = annotatePayload().readingMemory;

    const payload = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: annotatePayload({ readingMemory: legacyMemory }),
      logError: vi.fn(),
    });

    expect(payload.readingMemory).toBe(legacyMemory);
  });

  it('attaches a selection thread memory view for comment replies', () => {
    const logInfo = vi.fn();
    memoryStore.buildReadingMemoryView.mockReturnValue({
      articleId: 'article_1',
      viewType: 'selection_thread',
      viewKey: 'selection_thread:::2:6',
      entries: [
        {
          source: 'structured',
          entry: memoryEntry({
            id: 'comment_memory_comment_1',
            kind: 'reader_signal',
            scope: 'reader',
            textRange: { textStart: 2, textEnd: 6 },
            sourceType: 'comment',
            sourceCommentId: 'comment_1',
            payload: { source: 'comment', author: 'user', content: '既有读者讨论' },
          }),
        },
      ],
      sourceEntryIds: ['comment_memory_comment_1'],
      updatedAt: '2026-05-26T00:00:00.000Z',
    });

    const payload = agentMessagePayloadWithReadingMemoryView({
      payload: messagePayload({
        instruction: '继续解释',
      }),
      logInfo,
      logError: vi.fn(),
    });

    expect(memoryStore.buildReadingMemoryView).toHaveBeenCalledWith(
      expect.objectContaining({
        articleId: 'article_1',
        viewType: 'selection_thread',
        textRange: { textStart: 2, textEnd: 6 },
        query: expect.stringContaining('用户追问'),
        performanceLogger: logInfo,
      }),
    );
    expect(payload.readingMemoryView?.viewType).toBe('selection_thread');
  });

  it('keeps comment reply payload unchanged when thread memory read fails', () => {
    const logError = vi.fn();
    memoryStore.buildReadingMemoryView.mockImplementationOnce(() => {
      throw new Error('view failed');
    });
    const input = messagePayload();

    const payload = agentMessagePayloadWithReadingMemoryView({
      payload: input,
      logError,
    });

    expect(payload).toBe(input);
    expect(logError).toHaveBeenCalledWith('reading_memory.read_failed', expect.any(Error), {
      articleId: 'article_1',
    });
  });

  it('falls back to legacy annotate payload memory when entry read fails', () => {
    const logError = vi.fn();
    memoryStore.readReadingMemoryEntries.mockImplementationOnce(() => {
      throw new Error('read failed');
    });
    const legacyMemory = annotatePayload().readingMemory;

    const payload = agentAnnotatePayloadWithReadingMemoryEntries({
      payload: annotatePayload({ readingMemory: legacyMemory }),
      logError,
    });

    expect(payload.readingMemory).toBe(legacyMemory);
    expect(logError).toHaveBeenCalledWith('reading_memory.read_failed', expect.any(Error), {
      articleId: 'article_1',
    });
  });

  it('appends changed reading memory entries and anchor checkpoints', () => {
    const logError = vi.fn();

    saveAgentAnnotateReadingMemoryEntries({
      agent: annotationAgent(),
      payload: annotatePayload(),
      result: annotateResult(),
      logError,
      now: '2026-05-26T00:00:00.000Z',
    });

    expect(memoryStore.appendReadingMemoryEntries).toHaveBeenCalledTimes(1);
    const entries = memoryStore.appendReadingMemoryEntries.mock.calls[0]?.[0];
    expect(entries).toMatchObject([
      {
        articleId: 'article_1',
        kind: 'summary',
        scope: 'segment',
        agentId: 'agent_1',
        sourceType: 'ai_task',
        payload: { summary: '新摘要', keyTerms: ['新'] },
      },
      {
        articleId: 'article_1',
        kind: 'trace',
        scope: 'chapter',
        agentId: 'agent_1',
        sourceType: 'ai_task',
      },
      {
        articleId: 'article_1',
        kind: 'anchor',
        scope: 'segment',
        agentId: 'agent_1',
        sourceType: 'ai_task',
        sourceEntryIds: [entries?.[0]?.id],
      },
      {
        articleId: 'article_1',
        kind: 'anchor',
        scope: 'chapter',
        agentId: 'agent_1',
        sourceType: 'ai_task',
        sourceEntryIds: [entries?.[1]?.id],
      },
    ]);
    expect(entries?.[0]?.sourceTaskId).toMatch(/^reading_memory_task_/);
    expect(logError).not.toHaveBeenCalled();
  });

  it('skips persistence when the prompt article has no article id', () => {
    const payload = annotatePayload();
    payload.article.id = undefined;

    saveAgentAnnotateReadingMemoryEntries({
      agent: annotationAgent(),
      payload,
      result: annotateResult(),
      logError: vi.fn(),
    });

    expect(memoryStore.appendReadingMemoryEntries).not.toHaveBeenCalled();
  });

  it('logs memory write failures without throwing', () => {
    const logError = vi.fn();
    memoryStore.appendReadingMemoryEntries.mockImplementationOnce(() => {
      throw new Error('write failed');
    });

    expect(() =>
      saveAgentAnnotateReadingMemoryEntries({
        agent: annotationAgent(),
        payload: annotatePayload(),
        result: annotateResult(),
        logError,
      }),
    ).not.toThrow();

    expect(logError).toHaveBeenCalledWith(
      'reading_memory.write_failed',
      expect.any(Error),
      expect.objectContaining({
        articleId: 'article_1',
        agentId: 'agent_1',
        memorySummaryCount: 1,
        memoryTraceCount: 1,
      }),
    );
  });
});

function annotationAgent(): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    providerId: 'provider_1',
    nickname: '助手',
    username: 'assistant',
    avatar: '',
    annotationColor: '#f4c95d',
    annotationDensity: 'medium',
    enabled: true,
    temperature: 0.5,
    soul: '',
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
  };
}

function annotatePayload(overrides: Partial<AgentAnnotatePayload> = {}): AgentAnnotatePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'assistant',
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text: '正文'.repeat(80),
    },
    readingMemory: {
      updatedAt: '2026-05-26T00:00:00.000Z',
      textSummaries: [],
      readingTraces: [],
    },
    ...overrides,
  };
}

function messagePayload(overrides: Partial<AgentMessagePayload> = {}): AgentMessagePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'assistant',
    article: {
      id: 'article_1',
      title: '文章',
      url: 'https://example.com',
      text: '前文目标句子后文。',
    },
    annotation: {
      id: 'annotation_1',
      anchor: {
        start: 2,
        end: 6,
        exact: '目标句子',
        prefix: '前文',
        suffix: '后文',
      },
      author: 'user',
      color: '#f4c95d',
      comments: [],
      createdAt: '2026-05-26T00:00:00.000Z',
      updatedAt: '2026-05-26T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_1',
      author: 'user',
      content: '用户追问',
      createdAt: '2026-05-26T00:01:00.000Z',
    },
    ...overrides,
  };
}

function annotateResult(): AgentAnnotateResult {
  return {
    annotations: [],
    readingMemory: {
      updatedAt: '2026-05-26T00:00:00.000Z',
      textSummaries: [
        {
          scope: 'segment',
          chapterId: 'chapter_1',
          segmentId: 'segment_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          summary: '新摘要',
          keyTerms: ['新'],
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
      readingTraces: [
        {
          scope: 'chapter',
          chapterId: 'chapter_1',
          agentId: 'agent_1',
          sourceRange: { textStart: 0, textEnd: 100 },
          items: [
            {
              type: 'agent_observation',
              content: '新 trace',
              evidenceAnchors: [],
              confidence: 'medium',
              createdFromTask: 'chapter_segment_annotation',
            },
          ],
          updatedAt: '2026-05-26T00:00:00.000Z',
        },
      ],
    },
  };
}

function memoryEntry(overrides: Partial<ReadingMemoryEntry> = {}) {
  return {
    id: 'entry_1',
    articleId: 'article_1',
    kind: 'summary' as const,
    scope: 'segment' as const,
    visibility: 'default' as const,
    payloadVersion: 1,
    chapterId: 'chapter_1',
    segmentId: 'segment_1',
    textRange: { textStart: 0, textEnd: 100 },
    sourceType: 'ai_task' as const,
    sourceTaskId: 'task_1',
    sourceEntryIds: [],
    payload: {
      summary: 'entries 摘要',
      keyTerms: ['entries'],
    },
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function ebookIndex(): EpubBookIndex {
  return {
    version: 1,
    articleId: 'article_1',
    textLength: 160,
    chapters: [
      {
        id: 'chapter_1',
        title: '第一章',
        href: '',
        indexInBook: 0,
        textStart: 0,
        textEnd: 160,
        textLength: 160,
        previewStart: '',
        previewEnd: '',
        segmentIds: ['segment_1'],
        paragraphIds: ['paragraph_1'],
      },
    ],
    segments: [
      {
        id: 'segment_1',
        chapterId: 'chapter_1',
        indexInChapter: 0,
        textStart: 0,
        textEnd: 160,
        textLength: 160,
        previewStart: '',
        previewEnd: '',
        paragraphIds: ['paragraph_1'],
      },
    ],
    paragraphs: [
      {
        id: 'paragraph_1',
        chapterId: 'chapter_1',
        segmentId: 'segment_1',
        indexInChapter: 0,
        indexInSegment: 0,
        textStart: 0,
        textEnd: 160,
        textLength: 160,
        previewStart: '',
        previewEnd: '',
      },
    ],
  };
}
