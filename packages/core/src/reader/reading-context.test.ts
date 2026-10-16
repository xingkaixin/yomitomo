import { describe, expect, it } from 'vitest';
import type { SpoilerPolicy } from '@yomitomo/shared';
import {
  buildEpubBookIndex,
  epubIndexText,
  prepareEpubBookIndex,
  type EpubBookIndexChapterInput,
} from '../epub/ebook-index';
import { epubReadableTextRanges, selectionThreadSpoilerPolicy } from './reading-context';

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

function readableText(spoilerPolicy: SpoilerPolicy) {
  const index = buildEpubBookIndex({ articleId: 'book-1', chapters });
  const text = epubIndexText(chapters);
  const ranges = epubReadableTextRanges(prepareEpubBookIndex(index), {
    articleText: text,
    readerProgress: {
      currentChapterId: 'chapter-2',
      currentSegmentId: 'chapter-2-segment-1',
      readChapterIds: ['chapter-1'],
      readUntilTextOffset: text.indexOf('第二章未读反转'),
    },
    spoilerPolicy,
  });
  return ranges.map((range) => text.slice(range.textStart, range.textEnd)).join('\n');
}

describe('epubReadableTextRanges', () => {
  it('limits the current chapter to the read offset', () => {
    const text = readableText({
      allowedScope: 'current-chapter-so-far',
      allowFutureChapterEvidence: false,
      allowFuturePlotEvents: false,
    });

    expect(text).toContain('第二章开头。');
    expect(text).toContain('第二章已读论证。');
    expect(text).not.toContain('第一章已经读完。');
    expect(text).not.toContain('第二章未读反转。');
    expect(text).not.toContain('第三章未来剧情。');
  });

  it('keeps read chapters and stops at the read offset for read-so-far', () => {
    const text = readableText(selectionThreadSpoilerPolicy);

    expect(text).toContain('第一章已经读完。');
    expect(text).toContain('第二章已读论证。');
    expect(text).not.toContain('第二章未读反转。');
    expect(text).not.toContain('第三章未来剧情。');
  });

  it('allows the whole book when the user overrides spoiler limits', () => {
    const text = readableText({
      allowedScope: 'whole-book',
      allowFutureChapterEvidence: true,
      allowFuturePlotEvents: true,
      userOverride: true,
    });

    expect(text).toContain('第二章未读反转。');
    expect(text).toContain('第三章未来剧情。');
  });
});
