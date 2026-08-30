export {
  annotationColor,
  annotationCommentThreads,
  annotationAgentAuthorRef,
  annotationAuthorName,
  annotationPersona,
  annotationPrimaryComment,
  annotationToPublicAgent,
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
export {
  mergeAgentAnnotationAsThought,
  type MergedAgentAnnotationResult,
} from './reader/agent-annotations';

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

export {
  buildCurrentChapterLexicalRelatedPassages,
  createLexicalRelatedPassageCache,
} from './reader/lexical-related-passages';
export type {
  BuildCurrentChapterLexicalRelatedPassagesInput,
  LexicalRelatedPassageCache,
  LexicalRelatedPassageScope,
} from './reader/lexical-related-passages';

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

export {
  buildEpubReadingContextScope,
  buildReadingContextBundle,
  readingContextTextForRange,
  segmentAnnotationSpoilerPolicy,
  selectionAnnotationSpoilerPolicy,
  selectionThreadSpoilerPolicy,
  wholeBookSpoilerPolicy,
} from './reader/reading-context';
export { intersectTextRanges, rangeDistance } from './reader/reading-context-ranges';
export type {
  BuildReadingContextBundleInput,
  ReadingContextBundle,
  ReadingContextChapterSummaryInput,
  ReadingContextPassageInput,
  ReadingContextScope,
  ReadingContextTextRange,
} from './reader/reading-context';

export {
  annotationHasPublishedDistillation,
  articlePublishedDistillationCount,
  buildTocAnnotationStats,
} from './reader/reader-annotations';
export type { TocAnnotationStats } from './reader/reader-annotations';

export { mergeReadingMemory } from './reading-memory/reading-memory-merge';

export { parseReadingMemoryEntryPayload } from './reading-memory/reading-memory-entry-payload';
export type { ParsedReadingMemoryEntryPayload } from './reading-memory/reading-memory-entry-payload';

export {
  applySupersededEntryFilter,
  normalizeReadingMemoryEntry,
  readingMemoryAnchorCheckpointEntries,
  readingMemoryEntriesFromAnnotationThread,
  readingMemoryEntriesFromMemoryDelta,
  readingMemoryEntrySearchText,
  readingMemoryFromEntries,
} from './reading-memory/reading-memory-entries';

export {
  readingMemoryViewRequestForAnnotatePayload,
  readingMemoryViewRequestForMessagePayload,
} from './reading-memory/reading-memory-view-request';
export type { ReadingMemoryViewRequest } from './reading-memory/reading-memory-view-request';

export {
  materializeReadingEvidence,
  projectReadingEvidenceThread,
} from './reading-memory/reading-evidence-projection';
export type { ProjectedReadingEvidenceEntry } from './reading-memory/reading-evidence-projection';

export {
  mergeReadingEvidenceCandidates,
  rankReadingEvidenceCandidates,
} from './reading-memory/reading-evidence-ranking';

export { validateReadingJudgment } from './reading-memory/reading-judgment-validation';

export { selectReadingRelationEvidence } from './reading-memory/reading-relation-evidence';

export {
  activeTocIndexForOffset,
  annotationIdsAtHighlightPoint,
  articleTitleTocItems,
  buildHighlightSegments,
  cursorPositionFromOffset,
  extractTocItems,
  findCurrentTocTarget,
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

export { findReaderSearchMatches } from './reader/search';
export type { ReaderSearchMatch, ReaderSearchOptions, ReaderSearchResult } from './reader/search';
