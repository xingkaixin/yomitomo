export {
  annotationColor,
  annotationPersona,
  annotationPrimaryComment,
  annotationThoughtComments,
  annotationThreadComments,
  annotationToPublicAgent,
  annotationTypeLabel,
  annotationTypeLabels,
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
export { normalizeAnnotationType } from '@yomitomo/shared';
export type {
  AnnotationPersona,
  CreateUserAnnotationOptions,
  MentionQuery,
} from './reader/annotations';
export {
  mergeAgentAnnotationAsThought,
  type MergedAgentAnnotationResult,
} from './reader/agent-annotations';

export { inlineArticleFavicon, inlineArticleImages } from './articles/article-images';
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
  prepareEpubTextAnchorResolver,
  resolveEpubTextAnchor,
} from './epub/ebook-index';
export type {
  BuildEpubBookIndexInput,
  CreateEpubTextAnchorFromQuoteOptions,
  EpubBookIndexChapterInput,
  EpubIndexLocation,
  LocateEpubIndexOptions,
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

export {
  computeReadingActivityDays,
  computeReadingStats,
  sortAnnotations,
  sortArticles,
  timestamp,
} from './reader/reading';
export type { ReadingActivityDay, ReadingStats, ReadingStatsPeriod } from './reader/reading';

export {
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
  ReadingContextTextRange,
} from './reader/reading-context';

export {
  annotationHasPublishedDistillation,
  annotationStoredColor,
  articlePublishedDistillationCount,
  buildTocAnnotationStats,
} from './reader/reader-annotations';
export type { TocAnnotationStats } from './reader/reader-annotations';

export { mergeReadingMemory } from './reading-memory/reading-memory';

export {
  activeReadingMemoryEntries,
  applySupersededEntryFilter,
  normalizeReadingMemoryEntry,
  readingMemoryAnchorCheckpointEntries,
  readingMemoryEntriesFromAnnotationThread,
  readingMemoryEntriesFromMemoryDelta,
  readingMemoryEntryFromAnnotation,
  readingMemoryEntryFromComment,
  readingMemoryEntrySearchText,
  readingMemoryFromEntries,
} from './reading-memory/reading-memory-entries';

export {
  readingMemoryViewRequestForAnnotatePayload,
  readingMemoryViewRequestForMessagePayload,
} from './reading-memory/reading-memory-view-assembly';
export type { ReadingMemoryViewRequest } from './reading-memory/reading-memory-view-assembly';

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
  rangeFromOffsets,
  rangeFromOffsetsIgnoringSelector,
  rangeHighlightBoxes,
  scrollReaderSurfaceToElement,
  scrollReaderSurfaceToRect,
  selectionActionPosition,
} from './reader/reader-dom';
export type {
  ExtractTocOptions,
  HighlightBox,
  HighlightPoint,
  HighlightSegment,
  TocItem,
} from './reader/reader-dom';

export { findReaderSearchMatches } from './reader/search';
export type { ReaderSearchMatch, ReaderSearchOptions, ReaderSearchResult } from './reader/search';
