import type { TextAnchor } from './anchor-types';
import type { TextRange, TraceItem } from './reader-context-types';

export type ReadingMemoryEntryKind =
  | 'summary'
  | 'trace'
  | 'anchor'
  | 'correction'
  | 'reader_signal'
  | 'progress'
  | 'preference'
  | 'retrieval_note';

export type ReadingMemoryScope = 'segment' | 'chapter' | 'book' | 'reader' | 'agent';

export type ReadingMemoryVisibility = 'default' | 'hidden' | 'agent_private' | 'debug_only';

export type ReadingMemorySourceType =
  | 'original_text'
  | 'ai_task'
  | 'annotation'
  | 'comment'
  | 'progress'
  | 'correction'
  | 'import';

export type ReadingMemorySummaryPayload = {
  summary: string;
  keyTerms: string[];
};

export type ReadingMemoryTracePayload = {
  items: TraceItem[];
};

export type ReadingMemoryAnchorPayload = {
  anchor: TextAnchor;
  label?: string;
};

export type ReadingMemoryCorrectionPayload = {
  reason: string;
  replacement?: unknown;
};

export type ReadingMemoryEntryPayload =
  | ReadingMemorySummaryPayload
  | ReadingMemoryTracePayload
  | ReadingMemoryAnchorPayload
  | ReadingMemoryCorrectionPayload
  | Record<string, unknown>;

export type ReadingMemoryEntry = {
  id: string;
  articleId: string;
  kind: ReadingMemoryEntryKind;
  scope: ReadingMemoryScope;
  visibility: ReadingMemoryVisibility;
  payloadVersion: number;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  textRange?: TextRange;
  agentId?: string;
  readerId?: string;
  sourceType: ReadingMemorySourceType;
  sourceId?: string;
  sourceAnnotationId?: string;
  sourceCommentId?: string;
  sourceTaskId?: string;
  sourceEntryIds: string[];
  supersedesEntryId?: string;
  anchor?: TextAnchor;
  payload: ReadingMemoryEntryPayload;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletionReason?: string;
};

export type MemoryViewType = 'selection' | 'segment' | 'chapter' | 'agent' | 'legacy';

export type ReadingMemoryProjection = {
  id: string;
  articleId: string;
  viewType: MemoryViewType;
  viewKey: string;
  payload: Record<string, unknown>;
  sourceEntryIds: string[];
  updatedAt: string;
};
