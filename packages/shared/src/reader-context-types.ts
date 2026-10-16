export type {
  ReadingMemory,
  ReadingTrace,
  ReadingTraceScope,
  TextRange,
  TextSummary,
  TextSummaryScope,
  TraceItem,
  TraceItemType,
} from './reading-memory/reading-memory-types';

export type SpoilerAllowedScope =
  | 'current-selection'
  | 'current-segment'
  | 'current-chapter-so-far'
  | 'current-chapter'
  | 'read-so-far'
  | 'whole-book';

export type SpoilerPolicy = {
  allowedScope: SpoilerAllowedScope;
  allowFutureChapterEvidence: boolean;
  allowFuturePlotEvents: boolean;
  userOverride?: boolean;
};

export type ReaderProgress = {
  currentChapterId: string;
  currentSegmentId?: string;
  readChapterIds: string[];
  readUntilTextOffset?: number;
};

export type ArticleTextSection = {
  id: string;
  title: string;
  depth?: number;
  start: number;
  end: number;
};

export type ArticleTextSnapshot = {
  text: string;
  sections: ArticleTextSection[];
};
