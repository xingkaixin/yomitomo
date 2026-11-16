import {
  epubReadableTextRanges,
  prepareEpubBookIndex,
  selectionThreadSpoilerPolicy,
} from '@yomitomo/core';
import type {
  ArticleReadingProgress,
  ArticleTextSnapshot,
  EpubBookIndex,
  ReaderProgress,
  TextAnchor,
} from '@yomitomo/shared';

export function visibleRanges(
  text: ArticleTextSnapshot | undefined,
  anchor: TextAnchor | undefined,
  meta: { ebookIndex?: EpubBookIndex; readingProgress?: ArticleReadingProgress } | undefined,
) {
  if (!meta?.ebookIndex || !text) return null;
  const prepared = prepareEpubBookIndex(meta.ebookIndex);
  return epubReadableTextRanges(prepared, {
    articleText: text.text,
    targetAnchor: anchor,
    readerProgress: anchor
      ? highlightChapterProgress(prepared, text.text, anchor)
      : readerProgress(prepared, meta.readingProgress),
    spoilerPolicy: selectionThreadSpoilerPolicy,
  });
}

// A highlight opens its whole chapter, so agents can read past a cut sentence or a heading.
function highlightChapterProgress(
  prepared: ReturnType<typeof prepareEpubBookIndex>,
  articleText: string,
  anchor: TextAnchor,
): ReaderProgress | undefined {
  const position = prepared.locateAnchor(articleText, anchor);
  const chapter = position ? prepared.locateOffset(position.textStart)?.chapter : undefined;
  if (!chapter) return undefined;
  return {
    currentChapterId: chapter.id,
    readChapterIds: prepared.chaptersBefore(chapter),
    readUntilTextOffset: chapter.textEnd,
  };
}

// A question without a selection is scoped by how far the reader has read the book.
function readerProgress(
  prepared: ReturnType<typeof prepareEpubBookIndex>,
  progress: ArticleReadingProgress | undefined,
): ReaderProgress | undefined {
  if (progress?.kind !== 'chapter') return undefined;
  const chapter = prepared.chapters().find((item) => item.indexInBook === progress.chapterIndex);
  if (!chapter) return undefined;
  const readUntil = chapter.textStart + Math.round(progress.chapterProgress * chapter.textLength);
  return {
    currentChapterId: chapter.id,
    currentSegmentId: prepared.locateOffset(readUntil)?.segment.id,
    readChapterIds: prepared.chaptersBefore(chapter),
    readUntilTextOffset: readUntil,
  };
}
