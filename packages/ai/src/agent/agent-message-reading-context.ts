import type { ReadingMemorySourceType, TextAnchor } from '@yomitomo/shared';

export type ReadingEvidence = {
  summary: string;
  text?: string;
  provenance: {
    articleId: string;
    sourceType: ReadingMemorySourceType;
    sourceAnnotationId?: string;
    sourceCommentId?: string;
    agentId?: string;
    authorType?: 'user' | 'ai' | 'system';
    anchor?: TextAnchor;
    textStart?: number;
    textEnd?: number;
    createdAt?: string;
  };
};

export type AgentMessageReadingContextSnapshot = {
  memoryEvidence?: ReadingEvidence[];
};

export type AgentMessageRunOptions = {
  readingContext?: AgentMessageReadingContextSnapshot;
  signal?: AbortSignal;
};
