import type { AgentReadingIntent } from './agent-types';

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
