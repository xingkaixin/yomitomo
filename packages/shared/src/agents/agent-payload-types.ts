import type { AgentReadingIntent, PublicAgent } from './agent-types';
import type { Annotation, Comment } from '../annotation-types';
import type { TextAnchor } from '../anchor-types';
import type { EpubBookIndex } from '../sources/ebook-types';
import type { ReadingMemoryView } from '../reading-memory/reading-memory-entry-types';
import type { ReaderProgress, SpoilerPolicy } from '../reader-context-types';
import type { UiLanguage } from '../locale-types';

export type AgentMessagePayload = {
  agentId?: string;
  agentUsername: string;
  uiLanguage?: UiLanguage;
  responseMode?: 'thread_reply' | 'create_thought' | 'distillation_review';
  distillationReviewMode?: 'review' | 'organize_discussion';
  distillationDraft?: string;
  distillationReviewRequest?: string;
  distillationReviewTranscript?: string;
  readingIntent?: AgentReadingIntent;
  instruction?: string;
  reviewTargetCommentId?: string;
  allowDisabledAgentForRule?: boolean;
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
