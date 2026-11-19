import type { AssistantRuntimeProgressStep } from '../annotation-types';

export type AssistantChannel =
  | { kind: 'thread'; annotationId: string; threadId: string }
  | { kind: 'annotation'; annotationId: string }
  | { kind: 'chat'; sessionId: string };

export type AssistantDeliveryRequest = {
  articleId: string;
  channel: AssistantChannel;
  agentId: string;
  triggerId: string;
  instruction?: string;
  reviewTargetCommentId?: string;
  allowDisabledAgentForRule?: boolean;
};

export type AssistantCancelRequest = {
  articleId: string;
  channel: AssistantChannel;
  runKey?: string;
};

export type AssistantRunEvent = {
  runKey: string;
  articleId: string;
  agentId: string;
  channel: AssistantChannel;
  settledDeliveryIds?: string[];
  status: 'running' | 'done' | 'failed';
  text: string;
  steps?: AssistantRuntimeProgressStep[];
  commentId?: string;
  error?: string;
  errorDetail?: string;
};

export type AssistantPassageRevealRequest = {
  articleId: string;
  start: number;
  end: number;
};
