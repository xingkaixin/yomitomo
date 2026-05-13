import { describe, expect, it } from 'vitest';
import { buildEpubBookIndex, epubIndexText, type EpubBookIndexChapterInput } from './ebook-index';
import {
  buildReadingContextBundle,
  selectionAnnotationSpoilerPolicy,
  wholeBookSpoilerPolicy,
} from './reading-context';

const chapters: EpubBookIndexChapterInput[] = [
  {
    id: 'chapter-1',
    title: '第一章',
    paragraphs: ['第一章已经读完。', '第一章结论。'],
  },
  {
    id: 'chapter-2',
    title: '第二章',
    paragraphs: ['第二章开头。', '第二章已读论证。', '第二章未读反转。'],
  },
  {
    id: 'chapter-3',
    title: '第三章',
    paragraphs: ['第三章未来剧情。'],
  },
];

function bookFixture() {
  const index = buildEpubBookIndex({ articleId: 'book-1', chapters });
  return { index, text: epubIndexText(chapters) };
}

describe('buildReadingContextBundle', () => {
  it('limits current chapter context to the read offset', () => {
    const { index, text } = bookFixture();
    const readUntilTextOffset = text.indexOf('第二章未读反转');
    const bundle = buildReadingContextBundle({
      articleText: text,
      ebookIndex: index,
      readerProgress: {
        currentChapterId: 'chapter-2',
        currentSegmentId: 'chapter-2-segment-1',
        readChapterIds: ['chapter-1'],
        readUntilTextOffset,
      },
      spoilerPolicy: selectionAnnotationSpoilerPolicy,
    });

    expect(bundle.articleText).toContain('第二章开头。');
    expect(bundle.articleText).toContain('第二章已读论证。');
    expect(bundle.articleText).not.toContain('第二章未读反转。');
    expect(bundle.articleText).not.toContain('第三章未来剧情。');
  });

  it('filters passages and chapter summaries from unread chapters', () => {
    const { index, text } = bookFixture();
    const readUntilTextOffset = text.indexOf('第二章未读反转');
    const bundle = buildReadingContextBundle({
      articleText: text,
      ebookIndex: index,
      readerProgress: {
        currentChapterId: 'chapter-2',
        currentSegmentId: 'chapter-2-segment-1',
        readChapterIds: ['chapter-1'],
        readUntilTextOffset,
      },
      spoilerPolicy: {
        allowedScope: 'read-so-far',
        allowFutureChapterEvidence: false,
        allowFuturePlotEvents: false,
      },
      relatedPassages: [
        {
          id: 'read',
          chapterId: 'chapter-1',
          text: '第一章已经读完。',
        },
        {
          id: 'future',
          chapterId: 'chapter-3',
          text: '第三章未来剧情。',
        },
      ],
      chapterSummaries: [
        {
          chapterId: 'chapter-1',
          summary: '第一章摘要。',
        },
        {
          chapterId: 'chapter-3',
          summary: '第三章剧透摘要。',
        },
      ],
    });

    expect(bundle.relatedPassages.map((passage) => passage.id)).toEqual(['read']);
    expect(bundle.chapterSummaries.map((summary) => summary.chapterId)).toEqual(['chapter-1']);
  });

  it('allows whole-book evidence when the user overrides spoiler limits', () => {
    const { index, text } = bookFixture();
    const bundle = buildReadingContextBundle({
      articleText: text,
      ebookIndex: index,
      readerProgress: {
        currentChapterId: 'chapter-2',
        currentSegmentId: 'chapter-2-segment-1',
        readChapterIds: ['chapter-1'],
        readUntilTextOffset: text.indexOf('第二章未读反转'),
      },
      spoilerPolicy: wholeBookSpoilerPolicy,
      relatedPassages: [
        {
          id: 'future',
          chapterId: 'chapter-3',
          text: '第三章未来剧情。',
        },
      ],
      chapterSummaries: [
        {
          chapterId: 'chapter-3',
          summary: '第三章剧透摘要。',
        },
      ],
    });

    expect(bundle.articleText).toContain('第三章未来剧情。');
    expect(bundle.relatedPassages.map((passage) => passage.id)).toEqual(['future']);
    expect(bundle.chapterSummaries.map((summary) => summary.chapterId)).toEqual(['chapter-3']);
  });
});
