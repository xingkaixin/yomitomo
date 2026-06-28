import type {
  AgentDistillationReviewPayload,
  Annotation,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  AssistantRuntimeProgressEvent,
  Comment,
  PublicAgent,
  UiLanguage,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import i18next from 'i18next';
import {
  applyAssistantRuntimeProgress,
  assistantRuntimeErrorMessage,
} from '../shell/app-assistant-runtime-progress';
import {
  annotationWithReviewSession,
  appendReviewItemToMessage,
  createReviewSession,
  distillationProposalSource,
  existingSessionForAgent,
  reviewItemWithProposalSource,
  reviewMessageWithProposalSource,
  updateSessionMessage,
} from './app-annotation-sedimentation-state';

export type AgentDistillationReviewStreamEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'delta'; delta: string }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent };

export type RequestAgentDistillationReviewStream = (
  payload: AgentDistillationReviewPayload,
  onEvent: (event: AgentDistillationReviewStreamEvent) => void,
) => Promise<AnnotationDistillationReviewMessage>;

export async function requestAgentReviewRound({
  agent,
  annotation,
  articlePrompt,
  createMessageId = () => makeId('distillation_review_message'),
  createRequestCommentId = () => makeId('distillation_review_request'),
  createSessionId = () => makeId('distillation_review'),
  draft,
  now = () => new Date().toISOString(),
  onOptimisticSession,
  requestReviewStream,
  reviewDraft,
  reviewMode,
  sessions,
  uiLanguage,
  userMessage,
}: {
  agent: PublicAgent;
  annotation: Annotation;
  articlePrompt: AgentDistillationReviewPayload['article'];
  createMessageId?: () => string;
  createRequestCommentId?: () => string;
  createSessionId?: () => string;
  draft: string;
  now?: () => string;
  onOptimisticSession: (session: AnnotationDistillationReviewSession) => void;
  requestReviewStream: RequestAgentDistillationReviewStream;
  reviewDraft: string;
  reviewMode: 'review' | 'organize_discussion';
  sessions: AnnotationDistillationReviewSession[];
  uiLanguage?: UiLanguage;
  userMessage?: AnnotationDistillationReviewMessage;
}) {
  const startedAt = now();
  const session =
    existingSessionForAgent(sessions, agent) ||
    createReviewSession(agent, startedAt, createSessionId());
  const assistantMessage: AnnotationDistillationReviewMessage = {
    id: createMessageId(),
    author: 'ai',
    content: '',
    createdAt: startedAt,
    status: 'pending',
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
  };
  const proposalSource = distillationProposalSource({
    draft,
    sessionId: session.id,
    messageId: assistantMessage.id,
    agentId: agent.id,
  });
  let workingSession = {
    ...session,
    messages: [...session.messages, ...(userMessage ? [userMessage] : []), assistantMessage],
    updatedAt: startedAt,
  };
  onOptimisticSession(workingSession);

  const finalMessage = await requestReviewStream(
    {
      agentId: agent.id,
      agentUsername: agent.username,
      uiLanguage,
      reviewMessageId: assistantMessage.id,
      distillationReviewMode: reviewMode,
      ...distillationReviewPayloadFields(draft, reviewDraft, session),
      article: articlePrompt,
      annotation,
      userComment: reviewRequestComment(userMessage, startedAt, createRequestCommentId),
    },
    (event) => {
      if (event.type === 'start') return;
      if (event.type === 'progress') {
        workingSession = updateSessionMessage(
          workingSession,
          assistantMessage.id,
          (message) =>
            Object.assign({}, message, {
              assistantProgress: applyAssistantRuntimeProgress(
                message.assistantProgress,
                event.progress,
              ),
            }),
          now(),
        );
        onOptimisticSession(workingSession);
        return;
      }
      if (event.type === 'item') {
        const item = reviewItemWithProposalSource(event.item, proposalSource);
        workingSession = updateSessionMessage(
          workingSession,
          assistantMessage.id,
          (message) => appendReviewItemToMessage(message, item),
          now(),
        );
        onOptimisticSession(workingSession);
        return;
      }
      workingSession = updateSessionMessage(
        workingSession,
        assistantMessage.id,
        (message) => Object.assign({}, message, { content: `${message.content}${event.delta}` }),
        now(),
      );
      onOptimisticSession(workingSession);
    },
  ).catch((error: unknown) => {
    const errorMessage = assistantRuntimeErrorMessage(error, 'sedimentation.reviewFailed');
    workingSession = updateSessionMessage(
      workingSession,
      assistantMessage.id,
      (message) =>
        Object.assign({}, message, {
          errorMessage,
          status: 'failed' as const,
        }),
      now(),
    );
    onOptimisticSession(workingSession);
    throw error;
  });
  const sourcedFinalMessage = reviewMessageWithProposalSource(finalMessage, proposalSource);
  workingSession = updateSessionMessage(
    workingSession,
    assistantMessage.id,
    (message) =>
      Object.assign({}, message, {
        content:
          sourcedFinalMessage.content ||
          workingSession.messages.find((item) => item.id === assistantMessage.id)?.content ||
          '',
        errorMessage: undefined,
        items: sourcedFinalMessage.items || message.items || [],
        proposals: sourcedFinalMessage.proposals || message.proposals || [],
        status: 'done' as const,
      }),
    now(),
  );
  const completedMessage =
    workingSession.messages.find((message) => message.id === assistantMessage.id) ||
    assistantMessage;

  return {
    annotation: annotationWithReviewSession({
      annotation,
      session: workingSession,
      now: now(),
    }),
    message: completedMessage,
  };
}

function reviewRequestComment(
  message: AnnotationDistillationReviewMessage | undefined,
  createdAt: string,
  createRequestCommentId: () => string,
): Comment {
  return {
    id: message?.id || createRequestCommentId(),
    author: 'user',
    content: message?.content || i18next.t('sedimentation.reviewPrompt.defaultRequest'),
    createdAt: message?.createdAt || createdAt,
  };
}

export function distillationReviewPayloadFields(
  draft: string,
  reviewDraft: string,
  session: AnnotationDistillationReviewSession,
) {
  return {
    instruction: draft,
    distillationDraft: draft,
    distillationReviewRequest:
      reviewDraft.trim() || i18next.t('sedimentation.reviewPrompt.defaultReviewRequest'),
    distillationReviewTranscript: distillationReviewTranscript(session),
  };
}

function distillationReviewTranscript(session: AnnotationDistillationReviewSession) {
  return session.messages
    .map((message) =>
      i18next.t('sedimentation.reviewPrompt.transcriptLine', {
        role:
          message.author === 'user'
            ? i18next.t('sedimentation.reviewPrompt.userRole')
            : i18next.t('sedimentation.reviewPrompt.assistantRole'),
        content: message.content,
      }),
    )
    .join('\n');
}
