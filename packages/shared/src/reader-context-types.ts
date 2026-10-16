import type { AgentReadingIntent } from './agents/agent-types';
import type { AnnotationAuthorRef } from './annotation-types';
import type { ArticleSourceType } from './sources/article-types';
import type { TextAnchor } from './anchor-types';
import type { EpubBookIndex } from './sources/ebook-types';
import type { TextRange } from './reading-memory/reading-memory-types';

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

export type ReadingContextTask =
  | 'selection_annotation'
  | 'selection_thread_reply'
  | 'chapter_route'
  | 'chapter_segment_annotation';

export type ContextSourceType =
  | 'article_text'
  | 'selection'
  | 'local_window'
  | 'nearby_annotation'
  | 'thread'
  | 'retrieved_evidence'
  | 'toc'
  | 'agent_role'
  | 'reader_goal'
  | 'segment'
  | 'chapter_memory'
  | 'segment_memory'
  | 'segment_trace'
  | 'next_preview'
  | 'chapter_trace'
  | 'memory_view'
  | 'dedup';

export type ContextSourceLabel = {
  type: ContextSourceType;
  articleId?: string;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  score?: number;
  source?: string;
};

export type RelatedPassageSource =
  | 'none'
  | 'local-window'
  | 'current-chapter-lexical'
  | 'chapter-trace';

export type SourceLabeledContextBlock = {
  id: string;
  text: string;
  source: ContextSourceLabel;
};

export type ReadingContextBudgetPolicy = {
  maxTokens: number;
  blockTypeOrder?: ContextSourceType[];
  reserveTokensByType?: Partial<Record<ContextSourceType, number>>;
};

export type EvidencePolicy = {
  spoilerPolicy: SpoilerPolicy;
  allowedSourceTypes?: ContextSourceType[];
};

export type BookContext = {
  articleId: string;
  title: string;
  url?: string;
  sourceType?: ArticleSourceType;
  textLength?: number;
  ebookIndex?: EpubBookIndex;
};

export type LocationContext = {
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  textRange?: TextRange;
  readerProgress?: ReaderProgress;
};

export type AgentContext = {
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  readingIntent?: AgentReadingIntent;
};

export type BaseReadingContext = {
  book: BookContext;
  location: LocationContext;
  agent?: AgentContext;
  budget: ReadingContextBudgetPolicy;
  evidencePolicy: EvidencePolicy;
};

export type ParagraphWindow = {
  anchor?: TextAnchor;
  blocks: SourceLabeledContextBlock[];
};

export type ThreadMessageContext = {
  commentId: string;
  author: AnnotationAuthorRef;
  text: string;
  source: ContextSourceLabel;
};

export type ThreadContext = {
  annotationId: string;
  messages: ThreadMessageContext[];
};

export type RelatedPassage = {
  id: string;
  text: string;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  reason?: string;
  passageSource?: RelatedPassageSource;
  score?: number;
  anchor?: TextAnchor;
  source: ContextSourceLabel;
};

export type RelatedPassageInput = {
  id?: string;
  title?: string;
  text: string;
  textStart?: number;
  textEnd?: number;
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  source?: RelatedPassageSource;
  reason?: string;
  score?: number;
  anchor?: TextAnchor;
};

export type ChapterDescriptor = {
  chapterId: string;
  title: string;
  indexInBook: number;
  textLength: number;
  segmentCount?: number;
  previewStart?: string;
  previewEnd?: string;
  existingSummary?: string;
  source: ContextSourceLabel;
};

export type AgentRoleCard = {
  agentId: string;
  agentUsername: string;
  nickname: string;
  roleCard: string;
  source: ContextSourceLabel;
};

export type SelectionThreadContext = BaseReadingContext & {
  task: 'selection_thread_reply';
  originalSelection: TextAnchor;
  thread: ThreadContext;
  localWindow: ParagraphWindow;
  memoryViewBlocks?: SourceLabeledContextBlock[];
  retrievedEvidence: RelatedPassage[];
};

export type ChapterRouteContext = BaseReadingContext & {
  task: 'chapter_route';
  toc: ChapterDescriptor[];
  readerGoal?: string;
  agents: AgentRoleCard[];
};

export type ReadingTaskContext = SelectionThreadContext | ChapterRouteContext;

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
