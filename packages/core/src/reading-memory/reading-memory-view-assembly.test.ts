import { describe, expect, it } from 'vitest';
import type { AgentAnnotatePayload, AgentMessagePayload, EpubBookIndex } from '@yomitomo/shared';
import {
  readingMemoryViewRequestForAnnotatePayload,
  readingMemoryViewRequestForMessagePayload,
} from './reading-memory-view-assembly';

describe('reading memory view assembly', () => {
  it('builds EPUB segment requests from the first reading plan item', () => {
    const request = readingMemoryViewRequestForAnnotatePayload(
      annotatePayload({
        article: {
          ...annotatePayload().article,
          ebookIndex: ebookIndex(),
        },
        instruction: '关注转折',
        readingPlan: [
          {
            sectionId: 'section_1',
            sectionTitle: '第一节',
            sectionStart: 20,
            sectionEnd: 140,
            sectionSummary: '灯笼线索',
            sectionTag: 'clue',
            messages: [{ content: '补充读者疑问' }],
          },
        ],
      }),
    );

    expect(request).toMatchObject({
      articleId: 'article_1',
      viewType: 'segment',
      chapterId: 'chapter_1',
      segmentId: 'segment_1',
      textRange: { textStart: 20, textEnd: 100 },
      readerProgress: {
        currentChapterId: 'chapter_1',
        currentSegmentId: 'segment_1',
        readChapterIds: [],
        readUntilTextOffset: 100,
      },
    });
    expect(request?.query).toContain('灯笼线索');
    expect(request?.query).toContain('补充读者疑问');
  });

  it('skips EPUB segment requests when the reading plan does not overlap a segment', () => {
    const request = readingMemoryViewRequestForAnnotatePayload(
      annotatePayload({
        article: {
          ...annotatePayload().article,
          ebookIndex: ebookIndex(),
        },
        readingPlan: [
          {
            sectionId: 'section_1',
            sectionTitle: '越界章节',
            sectionStart: 240,
            sectionEnd: 280,
          },
        ],
      }),
    );

    expect(request).toBeUndefined();
  });

  it('builds article section requests for non-EPUB reading plans', () => {
    const request = readingMemoryViewRequestForAnnotatePayload(
      annotatePayload({
        instruction: '关注争议点',
        readingPlan: [
          {
            sectionId: 'section_1',
            sectionTitle: '第一节',
            sectionStart: 30,
            sectionEnd: 80,
            sectionSummary: '增长判断',
            sectionTag: 'growth',
          },
          {
            sectionId: 'section_2',
            sectionTitle: '第二节',
            sectionStart: 90,
            sectionEnd: 140,
            sectionSummary: '反例',
            sectionTag: 'counter',
          },
        ],
      }),
    );

    expect(request).toMatchObject({
      articleId: 'article_1',
      viewType: 'article_section',
      textRange: { textStart: 30, textEnd: 140 },
    });
    expect(request?.query).toContain('增长判断');
    expect(request?.query).toContain('反例');
  });

  it('prefers book offsets over local anchor offsets for selection requests', () => {
    const request = readingMemoryViewRequestForAnnotatePayload(
      annotatePayload({
        article: {
          ...annotatePayload().article,
          ebookIndex: ebookIndex(),
        },
        targetAnchor: {
          start: 2,
          end: 6,
          textStartInBook: 105,
          textEndInBook: 112,
          exact: '目标句子',
          prefix: '前文',
          suffix: '后文',
        },
        instruction: '解释这里',
      }),
    );

    expect(request).toMatchObject({
      articleId: 'article_1',
      viewType: 'selection',
      chapterId: 'chapter_2',
      segmentId: 'segment_2',
      textRange: { textStart: 105, textEnd: 112 },
      readerProgress: {
        currentChapterId: 'chapter_2',
        currentSegmentId: 'segment_2',
        readChapterIds: ['chapter_1'],
        readUntilTextOffset: 112,
      },
    });
    expect(request?.query).toContain('目标句子');
  });

  it('keeps selection locations whose textEnd lands on the segment end', () => {
    const request = readingMemoryViewRequestForMessagePayload(
      messagePayload({
        article: {
          ...messagePayload().article,
          ebookIndex: ebookIndex(),
        },
        annotation: {
          ...messagePayload().annotation,
          anchor: {
            start: 2,
            end: 6,
            textStartInBook: 95,
            textEndInBook: 100,
            exact: '段末句子',
            prefix: '前文',
            suffix: '后文',
          },
        },
      }),
    );

    expect(request).toMatchObject({
      articleId: 'article_1',
      viewType: 'selection_thread',
      chapterId: 'chapter_1',
      segmentId: 'segment_1',
      textRange: { textStart: 95, textEnd: 100 },
      readerProgress: {
        currentChapterId: 'chapter_1',
        currentSegmentId: 'segment_1',
        readChapterIds: [],
        readUntilTextOffset: 100,
      },
    });
  });

  it('builds selection thread requests from annotation anchor and latest user comment', () => {
    const request = readingMemoryViewRequestForMessagePayload(
      messagePayload({
        instruction: '继续解释',
      }),
    );

    expect(request).toMatchObject({
      articleId: 'article_1',
      viewType: 'selection_thread',
      textRange: { textStart: 2, textEnd: 6 },
    });
    expect(request?.query).toContain('目标句子');
    expect(request?.query).toContain('用户追问');
  });
});

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

function ebookIndex(): EpubBookIndex {
  return {
    version: 1,
    articleId: 'article_1',
    textLength: 220,
    chapters: [
      {
        id: 'chapter_1',
        title: '第一章',
        href: '',
        indexInBook: 0,
        textStart: 0,
        textEnd: 100,
        textLength: 100,
        previewStart: '',
        previewEnd: '',
        segmentIds: ['segment_1'],
        paragraphIds: ['paragraph_1'],
      },
      {
        id: 'chapter_2',
        title: '第二章',
        href: '',
        indexInBook: 1,
        textStart: 100,
        textEnd: 220,
        textLength: 120,
        previewStart: '',
        previewEnd: '',
        segmentIds: ['segment_2'],
        paragraphIds: ['paragraph_2'],
      },
    ],
    segments: [
      {
        id: 'segment_1',
        chapterId: 'chapter_1',
        indexInChapter: 0,
        textStart: 0,
        textEnd: 100,
        textLength: 100,
        previewStart: '',
        previewEnd: '',
        paragraphIds: ['paragraph_1'],
      },
      {
        id: 'segment_2',
        chapterId: 'chapter_2',
        indexInChapter: 0,
        textStart: 100,
        textEnd: 220,
        textLength: 120,
        previewStart: '',
        previewEnd: '',
        paragraphIds: ['paragraph_2'],
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
        textEnd: 100,
        textLength: 100,
        previewStart: '',
        previewEnd: '',
      },
      {
        id: 'paragraph_2',
        chapterId: 'chapter_2',
        segmentId: 'segment_2',
        indexInChapter: 0,
        indexInSegment: 0,
        textStart: 100,
        textEnd: 220,
        textLength: 120,
        previewStart: '',
        previewEnd: '',
      },
    ],
  };
}
