export {
  annotationColor,
  annotationCommentThreads,
  annotationAgentAuthorRef,
  annotationAuthorName,
  annotationPersona,
  annotationPrimaryComment,
  annotationTypeLabel,
  appendAnnotationComment,
  commentPersona,
  createUserAnnotation,
  createUserComment,
  deleteAnnotationComment,
  findMentionedAgents,
  getMentionQuery,
  replaceMentionQuery,
  updateAnnotationComment,
} from './reader/annotations';
export type {
  AnnotationCommentThread,
  AnnotationPersona,
  CreateUserAnnotationOptions,
  MentionQuery,
} from './reader/annotations';

export type { ArticleImageInlineOptions, ImageFetcher } from './articles/article-images';

export {
  applyBilingualTranslation,
  articleHtmlWithBilingualTranslation,
  bilingualTranslationSelector,
  clearBilingualTranslation,
  createTranslationTextAnchor,
  extractBilingualTranslationBlocks,
  extractWebArticleTranslationBlocks,
  rangeIntersectsBilingualTranslation,
  rangeForTranslationTextAnchor,
  sourceTextContent,
  textForTranslationAnchor,
  translationElementForRange,
} from './articles/article-translation';
export type {
  ArticleBilingualTranslationRenderOptions,
  BilingualTranslationSourceBlock,
  WebArticleTranslationBlock,
} from './articles/article-translation';
export { createArticleTextIndex, splitArticleTextBlocks } from './articles/article-text-index';
export type {
  ArticleTextBlock,
  ArticleTextIndex,
  ArticleTextOutlineItem,
  ArticleTextRead,
  ArticleTextSearchHit,
} from './articles/article-text-index';

export {
  buildEpubBookIndex,
  createEpubTextAnchor,
  createEpubTextAnchorFromQuote,
  epubIndexText,
  locateEpubOffset,
  locateEpubTextAnchor,
  prepareEpubBookIndex,
  prepareEpubTextAnchorResolver,
} from './epub/ebook-index';
export type {
  BuildEpubBookIndexInput,
  CreateEpubTextAnchorFromQuoteOptions,
  EpubBookIndexPreparationLogger,
  EpubBookIndexChapterInput,
  EpubIndexLocation,
  LocateEpubIndexOptions,
  PreparedEpubBookIndex,
  PreparedEpubTextAnchorResolver,
} from './epub/ebook-index';

export { performanceElapsedMs, performanceStart } from './performance';
export type { PerformanceTimingLogger } from './performance';

export { articleCounts } from './reader/article-counts';
export { readingProgressRatio } from './reader/reading-progress';

export {
  computeReadingActivityDays,
  computeReadingStats,
  sortAnnotations,
  sortArticles,
  timestamp,
} from './reader/reading';
export type { ReadingActivityDay, ReadingStats, ReadingStatsPeriod } from './reader/reading';

export { epubReadableTextRanges, selectionThreadSpoilerPolicy } from './reader/reading-context';
export type { ReadingContextTextRange } from './reader/reading-context';

export {
  annotationHasPublishedDistillation,
  articlePublishedDistillationCount,
  buildTocAnnotationStats,
} from './reader/reader-annotations';
export type { TocAnnotationStats } from './reader/reader-annotations';

export { parseReadingMemoryEntryPayload } from './reading-memory/reading-memory-entry-payload';
export type { ParsedReadingMemoryEntryPayload } from './reading-memory/reading-memory-entry-payload';

export {
  applySupersededEntryFilter,
  normalizeReadingMemoryEntry,
  readingMemoryEntriesFromAnnotationThread,
  readingMemoryEntrySearchText,
} from './reading-memory/reading-memory-entries';

export {
  materializeReadingEvidence,
  projectableReadingCommentAuthorKind,
  projectReadingEvidenceThread,
  selectProjectableReadingJudgments,
} from './reading-memory/reading-evidence-projection';
export type { ProjectedReadingEvidenceEntry } from './reading-memory/reading-evidence-projection';

export {
  mergeReadingEvidenceCandidates,
  rankReadingEvidenceCandidates,
} from './reading-memory/reading-evidence-ranking';

export { validateReadingJudgment } from './reading-memory/reading-judgment-validation';
export { foldReadingReviews } from './reading-memory/reading-review-fold';
export {
  deriveReadingReviewSignals,
  rankReadingReviewCandidates,
  readingReviewSignalLimits,
} from './reading-memory/reading-review-signals';
export type {
  ReadingReviewSignalCandidate,
  ReadingReviewSignals,
  ReadingReviewSignalVector,
} from './reading-memory/reading-review-signals';

export { selectReadingRelationEvidence } from './reading-memory/reading-relation-evidence';

export {
  activeTocIndexForOffset,
  annotationIdsAtHighlightPoint,
  articleTitleTocItems,
  buildHighlightSegments,
  extractTocItems,
  findCurrentTocTarget,
  findTocTargets,
  getArticleSelection,
  highlightSegmentStyle,
  highlightStyle,
  isPrimaryTocItem,
  isRangeInsideArticle,
  offsetFromArticleStart,
  offsetFromArticleStartIgnoringSelector,
  prepareTextOffsetRangeResolver,
  rangeFromOffsets,
  rangeFromOffsetsIgnoringSelector,
  rangeHighlightBoxes,
  scrollReaderSurfaceToRect,
  selectionActionPosition,
} from './reader/reader-dom';
export type {
  ExtractTocOptions,
  HighlightBox,
  HighlightPoint,
  HighlightSegment,
  PreparedTextOffsetRangeResolver,
  TocItem,
} from './reader/reader-dom';

export { createReaderSearch, findReaderSearchMatches } from './reader/search';
export type { ReaderSearchMatch, ReaderSearchOptions, ReaderSearchResult } from './reader/search';
