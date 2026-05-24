import type { AgentReadingIntent } from './agent-types';
import type { AnnotationAuthor, AnnotationConfidence } from './annotation-types';
import type { ArticleSourceType } from './article-types';
import type { TextAnchor } from './anchor-types';
import type { EpubBookIndex } from './ebook-types';

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

export type BudgetPolicy = {
  maxTokens: number;
  blockTypeOrder?: ContextSourceType[];
  reserveTokensByType?: Partial<Record<ContextSourceType, number>>;
};

export type EvidencePolicy = {
  spoilerPolicy: SpoilerPolicy;
  allowedSourceTypes?: ContextSourceType[];
};

export type TextRange = {
  textStart: number;
  textEnd: number;
};

export type TextSummaryScope = 'segment' | 'chapter' | 'book';

export type TextSummary = {
  scope: TextSummaryScope;
  sourceRange: TextRange;
  chapterId?: string;
  segmentId?: string;
  summary: string;
  keyTerms: string[];
  updatedAt: string;
};

export type TraceItemType =
  | 'claim'
  | 'question'
  | 'agent_observation'
  | 'reader_interest'
  | 'cross_reference_candidate';

export type TraceItem = {
  type: TraceItemType;
  content: string;
  evidenceAnchors: TextAnchor[];
  agentId?: string;
  confidence: AnnotationConfidence;
  createdFromTask: string;
};

export type ReadingTraceScope = 'segment' | 'chapter' | 'agent' | 'reader';

export type ReadingTrace = {
  scope: ReadingTraceScope;
  sourceRange?: TextRange;
  chapterId?: string;
  segmentId?: string;
  agentId?: string;
  items: TraceItem[];
  updatedAt: string;
};

export type ReadingMemory = {
  textSummaries: TextSummary[];
  readingTraces: ReadingTrace[];
  updatedAt: string;
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
  budget: BudgetPolicy;
  evidencePolicy: EvidencePolicy;
};

export type ParagraphWindow = {
  anchor?: TextAnchor;
  blocks: SourceLabeledContextBlock[];
};

export type AnnotationSummary = {
  annotationId: string;
  anchor?: TextAnchor;
  text: string;
  source: ContextSourceLabel;
};

export type ThreadMessageContext = {
  commentId: string;
  author: AnnotationAuthor;
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

export type ChapterMemory = {
  chapterId: string;
  summary: string;
  source: ContextSourceLabel;
};

export type SegmentText = {
  segmentId: string;
  text: string;
  textRange?: TextRange;
  source: ContextSourceLabel;
};

export type SegmentMemory = {
  segmentId: string;
  summary: string;
  source: ContextSourceLabel;
};

export type ChapterTrace = {
  chapterId: string;
  events: string[];
  source: ContextSourceLabel;
};

export type SegmentTraceMemory = {
  segmentId: string;
  events: string[];
  source: ContextSourceLabel;
};

export type DedupContext = {
  recentAnchors: TextAnchor[];
  recentComments?: string[];
  source: ContextSourceLabel;
};

export type SelectionAnnotationContext = BaseReadingContext & {
  task: 'selection_annotation';
  selection: TextAnchor;
  localWindow: ParagraphWindow;
  nearbyAnnotations: AnnotationSummary[];
  retrievedEvidence: RelatedPassage[];
  chapterMemory?: ChapterMemory;
};

export type SelectionThreadContext = BaseReadingContext & {
  task: 'selection_thread_reply';
  originalSelection: TextAnchor;
  thread: ThreadContext;
  localWindow: ParagraphWindow;
  retrievedEvidence: RelatedPassage[];
};

export type ChapterRouteContext = BaseReadingContext & {
  task: 'chapter_route';
  toc: ChapterDescriptor[];
  readerGoal?: string;
  agents: AgentRoleCard[];
};

export type SegmentAnnotationContext = BaseReadingContext & {
  task: 'chapter_segment_annotation';
  currentSegment: SegmentText;
  retrievedEvidence: RelatedPassage[];
  previousMemory?: SegmentMemory;
  previousTrace?: SegmentTraceMemory;
  nextPreview?: string;
  chapterTrace?: ChapterTrace;
  allowedAnchorRange: TextRange;
  dedupContext: DedupContext;
};

export type ReadingTaskContext =
  | SelectionAnnotationContext
  | SelectionThreadContext
  | ChapterRouteContext
  | SegmentAnnotationContext;
