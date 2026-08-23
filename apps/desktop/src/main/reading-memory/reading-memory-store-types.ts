import type {
  MemoryViewType,
  ReaderProgress,
  ReadingMemoryEntry,
  TextRange,
} from '@yomitomo/shared';
import type { SqliteValue } from './reading-memory-row-mapper';

export type ReadingMemoryPerformanceLogger = (
  event: string,
  data?: Record<string, unknown>,
) => void;

type SqliteStatement = {
  run: (...values: SqliteValue[]) => unknown;
  get: (...values: SqliteValue[]) => unknown;
  all: (...values: SqliteValue[]) => unknown[];
};

export type ReadingMemorySqliteExecutor = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
};

export type ReadReadingMemoryEntriesOptions = {
  articleId: string;
  kind?: ReadingMemoryEntry['kind'];
  scope?: ReadingMemoryEntry['scope'];
  agentId?: string;
  excludeAgentId?: string;
  requireAgentId?: boolean;
  visibility?: ReadingMemoryEntry['visibility'][];
  chapterId?: string;
  segmentId?: string;
  includeDeleted?: boolean;
  applySupersedes?: boolean;
  performanceLogger?: ReadingMemoryPerformanceLogger;
  executor?: ReadingMemorySqliteExecutor;
};

export type SearchReadingMemoryEntriesOptions = {
  articleId: string;
  query: string;
  agentId?: string;
  excludeAgentId?: string;
  requireAgentId?: boolean;
  visibility?: ReadingMemoryEntry['visibility'][];
  fallbackToSubstring?: boolean;
  limit?: number;
  performanceLogger?: ReadingMemoryPerformanceLogger;
  executor?: ReadingMemorySqliteExecutor;
};

export type BuildReadingMemoryViewOptions = {
  articleId: string;
  viewType: Extract<
    MemoryViewType,
    'selection' | 'selection_thread' | 'article_section' | 'segment' | 'chapter'
  >;
  chapterId?: string;
  segmentId?: string;
  textRange?: TextRange;
  query?: string;
  readerProgress?: ReaderProgress;
  structuredLimit?: number;
  ftsLimit?: number;
  performanceLogger?: ReadingMemoryPerformanceLogger;
  executor?: ReadingMemorySqliteExecutor;
};

export type SoftDeleteReadingMemoryEntriesBySourceOptions = {
  articleId: string;
  sourceAnnotationId?: string;
  sourceCommentId?: string;
  sourceType?: ReadingMemoryEntry['sourceType'];
  sourceId?: string;
  deletedAt?: string;
  deletionReason: string;
  executor?: ReadingMemorySqliteExecutor;
  useTransaction?: boolean;
};
