import type { AssistantRuntimeStreamEvent } from '@yomitomo/ai';
import type {
  Agent,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AssistantRuntimeProgressEvent,
  AssistantRuntimeProgressSummary,
  Comment,
  AnnotationDistillationReviewMessage,
} from '@yomitomo/shared';
import { annotationAgentAuthorRef } from '@yomitomo/core';

export type AgentRuntimeExecutionEvent =
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent };

type RuntimeProjectionState = {
  content: string;
  assistantProgress?: AssistantRuntimeProgressSummary;
};

export function pendingAgentComment(input: {
  agent: Agent;
  payload: AgentMessagePayload;
  id: string;
  createdAt: string;
}): Comment {
  return {
    id: input.id,
    author: annotationAgentAuthorRef(input.agent),
    content: '',
    createdAt: input.createdAt,
    replyTo: agentMessageReplyTo(input.payload),
    readingIntent: input.payload.readingIntent,
    pending: true,
  };
}

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

export function reduceAssistantRuntimeEvent<State extends RuntimeProjectionState>(
  state: State,
  event: AssistantRuntimeStreamEvent,
): { state: State; emitted?: AgentRuntimeExecutionEvent } {
  if (event.type === 'text_delta') {
    return {
      state: { ...state, content: state.content + event.delta },
      emitted: { type: 'delta', delta: event.delta },
    };
  }

  const progress = runtimeProgressEvent(event);
  if (!progress) return { state };
  return {
    state: {
      ...state,
      assistantProgress: reduceAssistantRuntimeProgress(state.assistantProgress, progress),
    },
    emitted: { type: 'progress', progress },
  };
}

export function reduceAssistantRuntimeProgress(
  current: AssistantRuntimeProgressSummary | undefined,
  event: AssistantRuntimeProgressEvent,
): AssistantRuntimeProgressSummary {
  const summary = current || { steps: [] };
  if (event.type === 'fallback') {
    return { ...summary, fallbackMessage: event.message };
  }
  const steps = summary.steps.filter((step) => step.id !== event.step.id);
  return { ...summary, steps: [...steps, event.step] };
}

function runtimeProgressEvent(
  event: AssistantRuntimeStreamEvent,
): AssistantRuntimeProgressEvent | null {
  if (event.type === 'tool_call') {
    return {
      type: 'step',
      step: {
        id: event.toolName,
        label: event.toolName,
        status: 'active',
      },
    };
  }
  if (event.type === 'tool_result') {
    return {
      type: 'step',
      step: {
        id: event.toolName,
        label: event.toolName,
        status: event.ok ? 'done' : 'failed',
      },
    };
  }
  if (event.type === 'fallback') {
    return { type: 'fallback', message: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE' };
  }
  return null;
}

function agentMessageReplyTo(payload: AgentMessagePayload) {
  if (payload.responseMode === 'create_thought' || payload.responseMode === 'distillation_review') {
    return undefined;
  }
  return payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id;
}
