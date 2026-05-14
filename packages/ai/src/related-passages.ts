import type { ContextSourceLabel, EpubBookIndex, RelatedPassage } from '@yomitomo/shared';
import type { ReadingContextBundle, ReadingContextPassageInput } from '@yomitomo/core';

export function relatedPassagesFromReadingContext(
  index: EpubBookIndex,
  readingContext: ReadingContextBundle | undefined,
): RelatedPassage[] {
  return relatedPassagesFromInputs(index, readingContext?.relatedPassages || []);
}

export function relatedPassagesFromInputs(
  index: EpubBookIndex,
  passages: ReadingContextPassageInput[],
): RelatedPassage[] {
  return passages.flatMap((passage, passageIndex) => {
    const text = passage.text.trim();
    if (!text) return [];
    return [
      {
        id: passage.id || `${index.articleId}:related-${passageIndex + 1}`,
        text,
        chapterId: passage.chapterId,
        segmentId: passage.segmentId,
        paragraphId: passage.paragraphId,
        reason: passage.reason,
        passageSource: passage.source,
        score: passage.score,
        anchor: passage.anchor,
        source: sourceLabel('retrieved_evidence', index.articleId, {
          chapterId: passage.chapterId,
          segmentId: passage.segmentId,
          paragraphId: passage.paragraphId,
          score: passage.score,
          source: passage.source || 'related-passages',
        }),
      },
    ];
  });
}

function sourceLabel(
  type: ContextSourceLabel['type'],
  articleId: string,
  source: Omit<ContextSourceLabel, 'type' | 'articleId'> = {},
): ContextSourceLabel {
  return {
    type,
    articleId,
    ...source,
  };
}
