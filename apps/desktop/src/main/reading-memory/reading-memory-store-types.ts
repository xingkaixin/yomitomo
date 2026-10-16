import type { ReadingMemoryEntry, TextRange } from '@yomitomo/shared';
import type { SqliteValue } from './reading-memory-row-mapper';

export type ReadingMemoryPerformanceLogger = (
  event: string,
  data?: Record<string, unknown>,
) => void;

type SqliteStatement = {
  run(...values: SqliteValue[]): unknown;
  get(...values: SqliteValue[]): unknown;
  all(...values: SqliteValue[]): unknown[];
};

export type ReadingMemorySqliteExecutor = {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
};

export type ReadingMemoryDatabase = <T>(
  operation: (executor: ReadingMemorySqliteExecutor, generation: number) => T,
) => Promise<T>;

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
  nearTextRange?: TextRange;
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
  nearTextRange?: TextRange;
  fallbackToSubstring?: boolean;
  limit?: number;
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
