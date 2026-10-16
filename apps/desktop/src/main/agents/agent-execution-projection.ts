import type {
  Agent,
  AgentDistillationReviewPayload,
  AssistantRuntimeProgressEvent,
  AnnotationDistillationReviewMessage,
} from '@yomitomo/shared';
import { annotationAgentAuthorRef } from '@yomitomo/core';

export type AgentRuntimeExecutionEvent =
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent };

export function pendingDistillationReviewMessage(input: {
  agent: Agent;
  payload: AgentDistillationReviewPayload;
  id: string;
  createdAt: string;
}): AnnotationDistillationReviewMessage {
  return {
    id: input.payload.reviewMessageId || input.id,
    author: annotationAgentAuthorRef(input.agent),
    content: '',
    createdAt: input.createdAt,
  };
}
