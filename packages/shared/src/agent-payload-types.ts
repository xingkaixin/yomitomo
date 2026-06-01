import type { AgentAnnotationDensity, AgentReadingIntent, PublicAgent } from './agent-types';
import type { Annotation, AnnotationType, Comment } from './annotation-types';
import type { TextAnchor } from './anchor-types';
import type { EpubBookIndex } from './ebook-types';
import type { ReadingMemoryView } from './reading-memory-entry-types';
import type { ReaderProgress, ReadingMemory, SpoilerPolicy } from './reader-context-types';

export type AgentMessagePayload = {
  agentId?: string;
  agentUsername: string;
  responseMode?: 'thread_reply' | 'create_thought' | 'distillation_review';
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  reviewTargetCommentId?: string;
  agentRoster?: PublicAgent[];
  readerProgress?: ReaderProgress;
  readingMemoryView?: ReadingMemoryView;
  spoilerPolicy?: SpoilerPolicy;
  article: {
    id?: string;
    title: string;
    url: string;
    text: string;
    ebookIndex?: EpubBookIndex;
  };
  annotation: Annotation;
  userComment: Comment;
};

export type AgentDistillationReviewPayload = Omit<AgentMessagePayload, 'responseMode'> & {
  responseMode?: 'distillation_review';
  reviewMessageId?: string;
};

export type AgentReviewPayload = {
  agentId?: string;
  agentUsername: string;
  agentRoster?: PublicAgent[];
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  article: {
    id?: string;
    title: string;
    url: string;
    text: string;
    ebookIndex?: EpubBookIndex;
  };
  annotation: Annotation;
};

export type AgentAnnotatePayload = {
  agentId?: string;
  agentUsername: string;
  annotationType?: AnnotationType;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  annotations?: Annotation[];
  readingMemory?: ReadingMemory;
  readingMemoryView?: ReadingMemoryView;
  readingPlan?: AgentReadingPlanItem[];
  targetAnchor?: TextAnchor;
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  article: {
    id?: string;
    title: string;
    url: string;
    text: string;
    ebookIndex?: EpubBookIndex;
  };
};

export type AgentAnnotateResult = {
  annotations: Annotation[];
  readingMemory?: ReadingMemory;
};

export type AgentReadingPlanItem = {
  sectionId: string;
  sectionTitle: string;
  sectionStart: number;
  sectionEnd: number;
  readingIntent?: AgentReadingIntent;
  sectionSummary?: string;
  sectionTag?: string;
  targetDensity?: AgentAnnotationDensity;
  messages?: AgentReadingPlanMessage[];
};

export type AgentReadingPlanMessage = {
  content: string;
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentIds?: string[];
  agentUsernames?: string[];
  agentNicknames?: string[];
};

export type AgentMentionInstructionPayload = {
  note: string;
  targetAnchor?: TextAnchor;
  targetSection?: {
    sectionId?: string;
    sectionTitle?: string;
    text: string;
  };
  allowedActions?: AgentMentionAction[];
  agents: PublicAgent[];
  article: {
    title: string;
    url: string;
    text: string;
  };
};

export type AgentMentionAction = 'comment' | 'create_thought';

export type AgentMentionDirective = {
  agentId?: string;
  agentUsername: string;
  action: AgentMentionAction;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
};

export type AgentMentionRoutePlan = {
  createUserThought: boolean;
  directives: AgentMentionDirective[];
};

export type AgentMentionInstruction = AgentMentionDirective;
