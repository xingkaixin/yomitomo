import { createTextAnchor } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import {
  buildEpubBookIndex,
  createEpubTextAnchor,
  createEpubTextAnchorFromQuote,
  epubIndexText,
  locateEpubOffset,
  locateEpubTextAnchor,
  resolveEpubTextAnchor,
} from './ebook-index';

describe('buildEpubBookIndex', () => {
  it('builds chapter, segment and paragraph ranges over book text', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        href: 'chapter1.xhtml',
        paragraphs: ['第一段。', '第二段。'],
      },
      {
        id: 'chapter-2',
        title: '第二章',
        href: 'chapter2.xhtml',
        paragraphs: ['第三段。'],
      },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });

    expect(text).toBe('第一段。\n\n第二段。\n\n第三段。');
    expect(index.textLength).toBe(text.length);
    expect(index.chapters).toHaveLength(2);
    expect(index.chapters[0]).toMatchObject({
      id: 'chapter-1',
      href: 'chapter1.xhtml',
      textStart: 0,
      textEnd: '第一段。\n\n第二段。'.length,
      paragraphIds: ['chapter-1-paragraph-1', 'chapter-1-paragraph-2'],
    });
    expect(index.chapters[1]?.textStart).toBe('第一段。\n\n第二段。\n\n'.length);
    expect(index.paragraphs.map((paragraph) => [paragraph.textStart, paragraph.textEnd])).toEqual([
      [0, 4],
      [6, 10],
      [12, 16],
    ]);
  });

  it('groups long chapters by paragraph boundaries', () => {
    const paragraphs = Array.from({ length: 7 }, (_, index) => `第 ${index + 1} 段。`.repeat(40));
    const index = buildEpubBookIndex({
      articleId: 'article-1',
      chapters: [{ id: 'chapter-1', title: '长章节', paragraphs }],
      maxSegmentTextLength: 360,
      minSegmentTextLength: 180,
    });

    expect(index.segments.length).toBeGreaterThan(1);
    expect(index.segments.flatMap((segment) => segment.paragraphIds)).toEqual(
      index.paragraphs.map((paragraph) => paragraph.id),
    );
    expect(index.segments.every((segment) => segment.paragraphIds.length > 0)).toBe(true);
  });

  it('keeps empty titles and short chapters addressable', () => {
    const chapters = [
      { id: 'chapter-1', title: '', paragraphs: ['短章。'] },
      { id: 'chapter-2', title: '尾声', paragraphs: ['完。'] },
    ];
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });

    expect(index.chapters[0]).toMatchObject({
      title: '',
      textLength: 3,
      segmentIds: ['chapter-1-segment-1'],
      paragraphIds: ['chapter-1-paragraph-1'],
    });
    expect(index.segments[0]).toMatchObject({
      id: 'chapter-1-segment-1',
      textLength: 3,
      previewStart: '短章。',
      previewEnd: '短章。',
    });
  });
});

describe('locateEpubOffset', () => {
  it('locates offset in chapter, segment, paragraph and paragraph window', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['甲段。', '乙段。', '丙段。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({
      articleId: 'article-1',
      chapters,
      maxSegmentTextLength: 8,
      minSegmentTextLength: 4,
    });
    const location = locateEpubOffset(index, text.indexOf('乙'), { paragraphWindowSize: 1 });

    expect(location?.chapter.id).toBe('chapter-1');
    expect(location?.segment.id).toBe('chapter-1-segment-1');
    expect(location?.paragraph?.id).toBe('chapter-1-paragraph-2');
    expect(location?.paragraphWindow.map((paragraph) => paragraph.id)).toEqual([
      'chapter-1-paragraph-1',
      'chapter-1-paragraph-2',
      'chapter-1-paragraph-3',
    ]);
  });

  it('locates TextAnchor through shared anchor resolution', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['重复句子。', '目标句子。', '重复句子。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const start = text.indexOf('目标');
    const anchor = createTextAnchor(text, start, start + '目标句子'.length);
    const location = locateEpubTextAnchor(index, text, { ...anchor, start: 0, end: 4 });

    expect(location?.textStart).toBe(start);
    expect(location?.textEnd).toBe(start + '目标句子'.length);
    expect(location?.paragraph?.id).toBe('chapter-1-paragraph-2');
  });

  it('creates paragraph-aware anchors from EPUB index offsets', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一段目标。', '第二段目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const start = text.indexOf('第二');
    const anchor = createEpubTextAnchor(index, text, start, start + '第二段'.length);

    expect(anchor).toMatchObject({
      exact: '第二段',
      chapterId: 'chapter-1',
      segmentId: 'chapter-1-segment-1',
      paragraphId: 'chapter-1-paragraph-2',
      textStartInParagraph: 0,
      textEndInParagraph: 3,
      textStartInBook: start,
      textEndInBook: start + '第二段'.length,
    });
    expect(anchor.quoteHash).toBeTruthy();
  });

  it('prefers paragraph offsets when exact text repeats', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['重复目标。', '重复目标。', '重复目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const paragraph = index.paragraphs[1];
    const anchor = createEpubTextAnchor(index, text, paragraph.textStart, paragraph.textStart + 4);
    const location = locateEpubTextAnchor(index, text, {
      ...anchor,
      start: 0,
      end: 4,
      prefix: '',
      suffix: '',
    });

    expect(location?.paragraph?.id).toBe('chapter-1-paragraph-2');
    expect(location?.textStart).toBe(paragraph.textStart);
  });

  it('falls back inside the paragraph when stored paragraph offset drifts', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['前置文字。', '这里有目标句子。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const start = text.indexOf('目标');
    const anchor = createEpubTextAnchor(index, text, start, start + '目标句子'.length);
    const position = resolveEpubTextAnchor(index, text, {
      ...anchor,
      textStartInParagraph: 0,
      textEndInParagraph: 4,
    });

    expect(position).toEqual({ start, end: start + '目标句子'.length });
  });

  it('keeps cross-paragraph selections addressable by book offsets', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一段目标。', '第二段目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const start = text.indexOf('目标');
    const end = text.lastIndexOf('目标') + '目标'.length;
    const anchor = createEpubTextAnchor(index, text, start, end);
    const location = locateEpubTextAnchor(index, text, anchor);

    expect(anchor.paragraphId).toBe('chapter-1-paragraph-1');
    expect(anchor.textEndInParagraph).toBeUndefined();
    expect(anchor.textEndInBook).toBe(end);
    expect(location?.paragraph?.id).toBe('chapter-1-paragraph-1');
    expect(location?.textEnd).toBe(end);
  });

  it('creates anchors from rendered selections that collapse paragraph whitespace', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一段目标。', '第二段目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const anchor = createEpubTextAnchorFromQuote(index, text, '目标。 第二段', {
      chapterId: 'chapter-1',
      prefix: '第一段',
      suffix: '目标',
    });

    expect(anchor).toMatchObject({
      exact: '目标。\n\n第二段',
      chapterId: 'chapter-1',
      paragraphId: 'chapter-1-paragraph-1',
      textEndInParagraph: undefined,
    });
    expect(anchor?.textStartInBook).toBe(text.indexOf('目标。'));
  });

  it('uses rendered context to disambiguate repeated selection text', () => {
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: ['上文。重复目标。', '中间上下文。重复目标。', '结尾。重复目标。'],
      },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const anchor = createEpubTextAnchorFromQuote(index, text, '重复目标', {
      chapterId: 'chapter-1',
      prefix: '中间上下文。',
      suffix: '。',
    });

    expect(anchor?.paragraphId).toBe('chapter-1-paragraph-2');
    expect(anchor?.textStartInBook).toBe(text.indexOf('重复目标', text.indexOf('中间上下文')));
  });

  it('does not create a chapter anchor from another chapter boundary', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['目标句子。'] },
      { id: 'chapter-2', title: '第二章', paragraphs: ['目标句子。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const anchor = createEpubTextAnchorFromQuote(index, text, '目标句子', {
      chapterId: 'chapter-2',
    });

    expect(anchor?.chapterId).toBe('chapter-2');
    expect(anchor?.textStartInBook).toBe(index.chapters[1]?.textStart);
  });

  it('uses quoteHash to validate structural offsets after whitespace changes', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['alpha target quote omega'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const start = text.indexOf('target');
    const anchor = createEpubTextAnchor(index, text, start, start + 'target quote'.length);
    const rendered = text.replace('target quote', 'target\nquote');
    const position = resolveEpubTextAnchor(index, rendered, { ...anchor, exact: 'stale quote' });

    expect(position).toEqual({ start, end: start + 'target quote'.length });
  });

  it('rejects resolved anchors outside allowed paragraph and core ranges', () => {
    const chapters = [
      { id: 'chapter-1', title: '第一章', paragraphs: ['第一段目标。', '第二段目标。'] },
    ];
    const text = epubIndexText(chapters);
    const index = buildEpubBookIndex({ articleId: 'article-1', chapters });
    const second = index.paragraphs[1];
    const anchor = createEpubTextAnchor(index, text, second.textStart, second.textStart + 4);

    expect(
      locateEpubTextAnchor(index, text, anchor, {
        allowedParagraphIds: ['chapter-1-paragraph-1'],
      }),
    ).toBeNull();
    expect(
      locateEpubTextAnchor(index, text, anchor, {
        allowedTextStart: 0,
        allowedTextEnd: second.textStart,
      }),
    ).toBeNull();
    expect(
      locateEpubTextAnchor(index, text, anchor, {
        allowedParagraphIds: ['chapter-1-paragraph-2'],
        allowedTextStart: second.textStart,
        allowedTextEnd: second.textEnd,
      })?.paragraph?.id,
    ).toBe('chapter-1-paragraph-2');
  });
});
