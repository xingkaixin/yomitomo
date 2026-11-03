import type { AgentReadingIntent, PublicAgent } from './agent-types';
import type { Annotation, Comment } from '../annotation-types';
import type { EpubBookIndex } from '../sources/ebook-types';
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
