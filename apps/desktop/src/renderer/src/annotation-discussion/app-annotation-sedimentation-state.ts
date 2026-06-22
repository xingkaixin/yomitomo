import type {
  Annotation,
  AnnotationDistillationProposal,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  ArticleRecord,
  PublicAgent,
} from '@yomitomo/shared';
import { hashText, makeId } from '@yomitomo/shared';
import {
  composeDistillationProposalDraftChangeSetEntries,
  updateReviewProposalStatusMap,
  type DistillationProposalDraftChangeSet,
} from './app-annotation-sedimentation-proposals';

export type DraftPreviewDecision = 'pending' | 'accepted' | 'rejected';
export type DraftPreviewDecisions = Record<string, DraftPreviewDecision>;

export type ReviewTimelineItem = {
  key: string;
  message: AnnotationDistillationReviewMessage;
};

export type DistillationProposalSource = Required<
  Pick<
    AnnotationDistillationProposal,
    'sourceDraftHash' | 'sourceReviewSessionId' | 'sourceReviewMessageId' | 'sourceAgentId'
  >
>;

export function pendingReviewProposals(proposals: AnnotationDistillationProposal[]) {
  return proposals.filter((proposal) => proposal.status === 'pending');
}

export function pendingOrganizeProposals(
  proposals: AnnotationDistillationProposal[],
  appliedProposalIds: Set<string>,
  dismissedProposalIds: Set<string>,
) {
  return proposals.filter(
    (proposal) =>
      proposal.status === 'pending' &&
      !appliedProposalIds.has(proposal.id) &&
      !dismissedProposalIds.has(proposal.id),
  );
}

export function draftPreviewDecisionsForProposals(
  proposals: AnnotationDistillationProposal[],
): DraftPreviewDecisions {
  return Object.fromEntries(proposals.map((proposal) => [proposal.id, 'pending']));
}

export function hasPendingDraftPreviewDecisions(decisions: DraftPreviewDecisions) {
  return Object.values(decisions).some((value) => value === 'pending');
}

export function draftPreviewStatusesFromDecisions(decisions: DraftPreviewDecisions) {
  return Object.fromEntries(
    Object.entries(decisions).map(([proposalId, decision]) => [
      proposalId,
      decision === 'accepted' ? 'accepted' : 'ignored',
    ]),
  ) as Record<string, AnnotationDistillationProposal['status']>;
}

export function acceptedDraftPreviewChanges(
  changeSet: DistillationProposalDraftChangeSet,
  decisions: DraftPreviewDecisions,
) {
  return changeSet.changes.filter((change) => decisions[change.proposalId] === 'accepted');
}

export function draftPreviewDraft(
  changeSet: DistillationProposalDraftChangeSet,
  decisions: DraftPreviewDecisions,
) {
  return composeDistillationProposalDraftChangeSetEntries(
    changeSet.baseDraft,
    acceptedDraftPreviewChanges(changeSet, decisions),
  );
}

export function organizeProposalDecisionSets({
  appliedProposalIds,
  decisions,
  dismissedProposalIds,
}: {
  appliedProposalIds: Set<string>;
  decisions: DraftPreviewDecisions;
  dismissedProposalIds: Set<string>;
}) {
  const applied = new Set(appliedProposalIds);
  const dismissed = new Set(dismissedProposalIds);

  for (const [proposalId, decision] of Object.entries(decisions)) {
    if (decision === 'accepted') applied.add(proposalId);
    if (decision === 'rejected') dismissed.add(proposalId);
  }

  return { appliedProposalIds: applied, dismissedProposalIds: dismissed };
}

export function publishedDistillationArticle({
  annotationId,
  article,
  content,
  now,
}: {
  annotationId: string;
  article: ArticleRecord;
  content: string;
  now: string;
}) {
  return updateArticleAnnotation(
    article,
    annotationId,
    (current) => ({
      ...current,
      distillation: {
        ...current.distillation,
        status: 'published',
        content,
        publishedAt: current.distillation?.publishedAt || now,
        updatedAt: now,
        reviewSessions: current.distillation?.reviewSessions,
      },
      updatedAt: now,
    }),
    now,
  );
}

export function unpublishedDistillationArticle({
  annotationId,
  article,
  fallbackContent,
  now,
}: {
  annotationId: string;
  article: ArticleRecord;
  fallbackContent: string;
  now: string;
}) {
  return updateArticleAnnotation(
    article,
    annotationId,
    (current) => ({
      ...current,
      distillation: {
        ...current.distillation,
        status: 'unpublished',
        content: current.distillation?.content || fallbackContent,
        publishedAt: current.distillation?.publishedAt,
        updatedAt: now,
        reviewSessions: current.distillation?.reviewSessions,
      },
      updatedAt: now,
    }),
    now,
  );
}

export function articleWithReviewProposalStatuses({
  annotation,
  article,
  messageId,
  now,
  proposalStatusById,
}: {
  annotation: Annotation;
  article: ArticleRecord;
  messageId: string;
  now: string;
  proposalStatusById: Record<string, AnnotationDistillationProposal['status']>;
}) {
  const nextSessions = updateReviewProposalStatusMap(
    annotation.distillation?.reviewSessions || [],
    messageId,
    proposalStatusById,
    now,
  );

  return updateArticleAnnotation(
    article,
    annotation.id,
    (current) => ({
      ...current,
      distillation: {
        status: current.distillation?.status || 'unpublished',
        content: current.distillation?.content || '',
        publishedAt: current.distillation?.publishedAt,
        updatedAt: now,
        reviewSessions: nextSessions,
      },
      updatedAt: now,
    }),
    now,
  );
}

export function updateArticleAnnotation(
  article: ArticleRecord,
  annotationId: string,
  update: (annotation: Annotation) => Annotation,
  updatedAt: string,
) {
  return {
    ...article,
    annotations: article.annotations.map((item) =>
      item.id === annotationId ? update(item) : item,
    ),
    updatedAt,
  };
}

export function annotationWithReviewSession({
  annotation,
  now,
  session,
}: {
  annotation: Annotation;
  now: string;
  session: AnnotationDistillationReviewSession;
}) {
  const sessions = annotation.distillation?.reviewSessions || [];
  const nextSessions = sessions.some((item) => item.id === session.id)
    ? sessions.map((item) => (item.id === session.id ? session : item))
    : [...sessions, session];

  return {
    ...annotation,
    distillation: {
      status: annotation.distillation?.status || 'unpublished',
      content: annotation.distillation?.content || '',
      publishedAt: annotation.distillation?.publishedAt,
      updatedAt: now,
      reviewSessions: nextSessions,
    },
  } satisfies Annotation;
}

export function existingSessionForAgent(
  sessions: AnnotationDistillationReviewSession[],
  agent: PublicAgent,
) {
  return sessions.find((session) => session.agentId === agent.id);
}

export function createReviewSession(
  agent: PublicAgent,
  now: string,
  id = makeId('distillation_review'),
): AnnotationDistillationReviewSession {
  return {
    id,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSessionMessage(
  session: AnnotationDistillationReviewSession,
  messageId: string,
  update: (message: AnnotationDistillationReviewMessage) => AnnotationDistillationReviewMessage,
  updatedAt: string,
) {
  return {
    ...session,
    messages: session.messages.map((message) =>
      message.id === messageId ? update(message) : message,
    ),
    updatedAt,
  };
}

export function appendReviewItemToMessage(
  message: AnnotationDistillationReviewMessage,
  item: AnnotationDistillationReviewItem,
) {
  return Object.assign({}, message, {
    items: [...(message.items || []), item],
    proposals:
      item.type === 'proposal'
        ? [...(message.proposals || []), item.proposal]
        : message.proposals || [],
  });
}

export function distillationProposalSource({
  agentId,
  draft,
  messageId,
  sessionId,
}: {
  agentId: string;
  draft: string;
  messageId: string;
  sessionId: string;
}): DistillationProposalSource {
  return {
    sourceDraftHash: hashText(draft),
    sourceReviewSessionId: sessionId,
    sourceReviewMessageId: messageId,
    sourceAgentId: agentId,
  };
}

export function reviewMessageWithProposalSource(
  message: AnnotationDistillationReviewMessage,
  source: DistillationProposalSource,
) {
  return {
    ...message,
    items: message.items?.map((item) => reviewItemWithProposalSource(item, source)),
    proposals: message.proposals?.map((proposal) => proposalWithSource(proposal, source)),
  };
}

export function reviewItemWithProposalSource(
  item: AnnotationDistillationReviewItem,
  source: DistillationProposalSource,
): AnnotationDistillationReviewItem {
  if (item.type !== 'proposal') return item;
  return {
    ...item,
    proposal: proposalWithSource(item.proposal, source),
  };
}

export function proposalWithSource(
  proposal: AnnotationDistillationProposal,
  source: DistillationProposalSource,
) {
  return {
    ...proposal,
    ...source,
  };
}

export function reviewTimelineMessages(
  sessions: AnnotationDistillationReviewSession[],
  agents: PublicAgent[],
): ReviewTimelineItem[] {
  const seenUserMessages = new Set<string>();
  const items: ReviewTimelineItem[] = [];

  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.author === 'user') {
        const userKey = `user:${message.id}`;
        if (seenUserMessages.has(userKey)) continue;
        seenUserMessages.add(userKey);
        items.push({ key: userKey, message });
        continue;
      }

      const agentId = message.agentId || session.agentId;
      const agent = agents.find((item) => item.id === agentId);
      items.push({
        key: `assistant:${session.id}:${message.id}`,
        message: {
          ...message,
          agentId,
          agentUsername: agent?.username || message.agentUsername || session.agentUsername,
          agentNickname: agent?.nickname || message.agentNickname || session.agentNickname,
          agentAvatar: agent?.avatar || message.agentAvatar || session.agentAvatar,
        },
      });
    }
  }

  return items.toSorted((left, right) => {
    const timeDelta = timestamp(left.message.createdAt) - timestamp(right.message.createdAt);
    if (timeDelta !== 0) return timeDelta;
    if (left.message.author !== right.message.author)
      return left.message.author === 'user' ? -1 : 1;
    return left.key.localeCompare(right.key);
  });
}

function timestamp(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
