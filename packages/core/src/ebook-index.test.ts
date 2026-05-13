import { createTextAnchor } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import {
  buildEpubBookIndex,
  epubIndexText,
  locateEpubOffset,
  locateEpubTextAnchor,
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
});
