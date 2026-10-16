import type { AgentReadingIntent } from './agent-types';
import type { ArticleTextSnapshot } from '../reader-context-types';

export type AssistantChannel =
  | { kind: 'thread'; annotationId: string; threadId: string }
  | { kind: 'annotation'; annotationId: string };

export type AssistantDeliveryRequest = {
  articleId: string;
  channel: AssistantChannel;
  agentId: string;
  triggerId: string;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
  reviewTargetCommentId?: string;
  allowDisabledAgentForRule?: boolean;
  /** Used only until the reader window has saved the article's own text snapshot. */
  fallbackText?: ArticleTextSnapshot;
};

export type AssistantRunEvent = {
  runKey: string;
  articleId: string;
  agentId: string;
  channel: AssistantChannel;
  status: 'running' | 'done' | 'failed';
  text: string;
  activeTool?: string;
  commentId?: string;
  error?: string;
};
