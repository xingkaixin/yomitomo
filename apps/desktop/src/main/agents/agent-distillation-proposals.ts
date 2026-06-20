import type {
  Agent,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationReviewMessage,
  AppSettings,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { publicCommentAgents } from './agent-runtime-routing';

export function distillationReviewMessagePayload(
  payload: AgentDistillationReviewPayload,
  agents: Agent[],
  settings: AppSettings,
): AgentMessagePayload {
  return {
    ...payload,
    uiLanguage: normalizeUiLanguage(settings.uiLanguage),
    responseMode: 'distillation_review',
    agentRoster:
      payload.agentRoster || publicCommentAgents(agents, normalizeUiLanguage(settings.uiLanguage)),
  };
}

export function messageWithReviewId(
  message: AnnotationDistillationReviewMessage,
  reviewMessageId: string | undefined,
) {
  return reviewMessageId ? { ...message, id: reviewMessageId } : message;
}
