import { describe, expect, it } from 'vitest';
import { buildEpubBookIndex, epubIndexText, type EpubBookIndexChapterInput } from './ebook-index';
import {
  buildCurrentChapterLexicalRelatedPassages,
  createLexicalRelatedPassageCache,
} from './lexical-related-passages';

describe('buildCurrentChapterLexicalRelatedPassages', () => {
  it('retrieves same-chapter paragraph evidence with neighbor expansion', () => {
    const { index, text } = bookFixture();
    const passages = buildCurrentChapterLexicalRelatedPassages({
      articleText: text,
      ebookIndex: index,
      query: '人口红利再次出现',
      chapterId: 'chapter-2',
      readerProgress: {
        currentChapterId: 'chapter-2',
        currentSegmentId: 'chapter-2-segment-1',
        readChapterIds: ['chapter-1'],
        readUntilTextOffset: text.indexOf('未读反转'),
      },
      spoilerPolicy: {
        allowedScope: 'current-chapter-so-far',
        allowFutureChapterEvidence: false,
        allowFuturePlotEvents: false,
      },
      excludeParagraphIds: ['chapter-2-paragraph-3'],
      maxPassages: 2,
      neighborParagraphs: 1,
    });

    expect(passages[0]).toMatchObject({
      paragraphId: 'chapter-2-paragraph-1',
      source: 'current-chapter-lexical',
    });
    expect(passages[0]?.text).toContain('人口红利在本章开头被定义为劳动力供给优势。');
    expect(passages[0]?.text).toContain('产业升级让这个优势开始变得不稳定。');
    expect(passages[0]?.text).not.toContain('未读反转');
    expect(passages[0]?.anchor?.paragraphId).toBe('chapter-2-paragraph-1');
    expect(passages[0]?.score).toBeGreaterThan(0);
  });

  it('can widen lexical scope to read-so-far chapters', () => {
    const { index, text } = bookFixture();
    const passages = buildCurrentChapterLexicalRelatedPassages({
      articleText: text,
      ebookIndex: index,
      query: '人口红利',
      chapterId: 'chapter-2',
      readerProgress: {
        currentChapterId: 'chapter-2',
        currentSegmentId: 'chapter-2-segment-1',
        readChapterIds: ['chapter-1'],
        readUntilTextOffset: text.indexOf('未读反转'),
      },
      spoilerPolicy: {
        allowedScope: 'read-so-far',
        allowFutureChapterEvidence: false,
        allowFuturePlotEvents: false,
      },
      scope: 'read-so-far',
      excludeParagraphIds: [
        'chapter-2-paragraph-1',
        'chapter-2-paragraph-2',
        'chapter-2-paragraph-3',
      ],
      maxPassages: 2,
      neighborParagraphs: 0,
    });

    expect(passages.map((passage) => passage.chapterId)).toEqual(['chapter-1']);
    expect(passages[0]?.text).toContain('上一章也短暂提到人口红利。');
  });

  it('dedupes overlapping neighbor windows', () => {
    const chapters: EpubBookIndexChapterInput[] = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['制度惯性第一次出现。', '制度惯性继续影响决策。', '这里再次讨论制度惯性。'],
      },
    ];
    const index = buildEpubBookIndex({ articleId: 'book-1', chapters });
    const text = epubIndexText(chapters);
    const passages = buildCurrentChapterLexicalRelatedPassages({
      articleText: text,
      ebookIndex: index,
      query: '制度惯性',
      chapterId: 'chapter-1',
      excludeParagraphIds: ['chapter-1-paragraph-3'],
      maxPassages: 4,
      neighborParagraphs: 1,
    });

    expect(passages).toHaveLength(1);
    expect(passages[0]?.text).toContain('制度惯性第一次出现。');
    expect(passages[0]?.text).toContain('制度惯性继续影响决策。');
  });

  it('ignores queries without searchable lexical terms', () => {
    const { index, text } = bookFixture();
    const passages = buildCurrentChapterLexicalRelatedPassages({
      articleText: text,
      ebookIndex: index,
      query: '这里 哪里 什么',
      chapterId: 'chapter-2',
    });

    expect(passages).toEqual([]);
  });

  it('reuses cached paragraph lexical documents across repeated calls', () => {
    const { index, text } = bookFixture();
    const lexicalCache = createLexicalRelatedPassageCache();
    const timings: Record<string, unknown>[] = [];
    const input = {
      articleText: text,
      ebookIndex: index,
      query: '人口红利',
      chapterId: 'chapter-2',
      excludeParagraphIds: ['chapter-2-paragraph-3'],
      maxPassages: 2,
      neighborParagraphs: 0,
      lexicalCache,
      performanceLogger: (_name: string, data?: Record<string, unknown>) => {
        if (data) timings.push(data);
      },
    };

    buildCurrentChapterLexicalRelatedPassages(input);
    buildCurrentChapterLexicalRelatedPassages(input);

    expect(timings[0]).toMatchObject({
      lexicalCacheHitCount: 0,
      lexicalCacheMissCount: 3,
    });
    expect(timings[1]).toMatchObject({
      lexicalCacheHitCount: 3,
      lexicalCacheMissCount: 0,
    });
  });

  it('keeps excluded paragraphs out of the current result without poisoning the cache', () => {
    const { index, text } = bookFixture();
    const lexicalCache = createLexicalRelatedPassageCache();
    const baseInput = {
      articleText: text,
      ebookIndex: index,
      query: '这里再次讨论人口红利',
      chapterId: 'chapter-2',
      maxPassages: 2,
      neighborParagraphs: 0,
      lexicalCache,
    };

    const excluded = buildCurrentChapterLexicalRelatedPassages({
      ...baseInput,
      excludeParagraphIds: ['chapter-2-paragraph-3'],
    });
    const included = buildCurrentChapterLexicalRelatedPassages(baseInput);

    expect(excluded.map((passage) => passage.paragraphId)).not.toContain('chapter-2-paragraph-3');
    expect(included[0]?.paragraphId).toBe('chapter-2-paragraph-3');
  });
});

function bookFixture() {
  const chapters: EpubBookIndexChapterInput[] = [
    {
      id: 'chapter-1',
      title: '第一章',
      paragraphs: ['上一章也短暂提到人口红利。'],
    },
    {
      id: 'chapter-2',
      title: '第二章',
      paragraphs: [
        '人口红利在本章开头被定义为劳动力供给优势。',
        '产业升级让这个优势开始变得不稳定。',
        '这里再次讨论人口红利如何影响选择。',
        '未读反转：人口红利其实已经转向另一条线索。',
      ],
    },
    {
      id: 'chapter-3',
      title: '第三章',
      paragraphs: ['未来章节继续讨论人口红利。'],
    },
  ];
  const index = buildEpubBookIndex({ articleId: 'book-1', chapters });
  return { index, text: epubIndexText(chapters) };
}
