import { useEffect, useMemo, useRef } from 'react';
import { Eye, MessageCircleQuestion, RotateCcw, X } from 'lucide-react';
import type {
  AnnotationDistillationProposal,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewSession,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import { formatAbsoluteTime, formatRelativeTime } from './app-annotation-discussion-utils';
import { AvatarBadge, ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';
import {
  pendingReviewProposals,
  reviewTimelineMessages,
  type ReviewTimelineItem,
} from './app-annotation-sedimentation-state';

export function SedimentationReviewTimeline({
  agents,
  onProposalAnchorEnter,
  onProposalAnchorLeave,
  onProposalIgnore,
  onProposalPreview,
  onProposalRestore,
  pendingProposalIds,
  sessions,
  userProfile,
}: {
  agents: PublicAgent[];
  onProposalAnchorEnter: (proposal: AnnotationDistillationProposal) => void;
  onProposalAnchorLeave: () => void;
  onProposalPreview: (
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) => void | Promise<void>;
  onProposalIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onProposalRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  pendingProposalIds: string[];
  sessions: AnnotationDistillationReviewSession[];
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const messages = reviewTimelineMessages(sessions, agents);
  const listRef = useRef<HTMLElement | null>(null);
  const scrollSignal = messages
    .map(
      (item) =>
        `${item.key}:${item.message.content.length}:${item.message.items?.length || 0}:${
          item.message.proposals?.length || 0
        }`,
    )
    .join('|');

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') {
      list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [scrollSignal]);

  if (sessions.length === 0) {
    return (
      <section className="annotation-sedimentation-review-empty">
        <MessageCircleQuestion size={22} />
        <strong>{t('sedimentation.noReviewTitle')}</strong>
        <p>{t('sedimentation.noReviewDescription')}</p>
      </section>
    );
  }

  return (
    <section
      ref={listRef}
      className={[
        'annotation-sedimentation-review-list',
        'annotation-discussion-messages',
        'is-left-aligned',
      ].join(' ')}
      aria-label={t('sedimentation.reviewSessions')}
    >
      {messages.map((message) => (
        <ReviewTimelineMessage
          item={message}
          key={message.key}
          agents={agents}
          userProfile={userProfile}
          onProposalAnchorEnter={onProposalAnchorEnter}
          onProposalAnchorLeave={onProposalAnchorLeave}
          onProposalIgnore={onProposalIgnore}
          onProposalPreview={onProposalPreview}
          onProposalRestore={onProposalRestore}
          pendingProposalIds={pendingProposalIds}
        />
      ))}
    </section>
  );
}

function ReviewTimelineMessage({
  agents,
  item,
  onProposalAnchorEnter,
  onProposalAnchorLeave,
  onProposalIgnore,
  onProposalPreview,
  onProposalRestore,
  pendingProposalIds,
  userProfile,
}: {
  agents: PublicAgent[];
  item: ReviewTimelineItem;
  onProposalAnchorEnter: (proposal: AnnotationDistillationProposal) => void;
  onProposalAnchorLeave: () => void;
  onProposalPreview: (
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) => void | Promise<void>;
  onProposalIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onProposalRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  pendingProposalIds: string[];
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const { message } = item;
  const isUser = message.author === 'user';
  const agent = isUser ? undefined : agents.find((candidate) => candidate.id === message.agentId);
  const avatar = isUser ? userProfile.avatar : agent?.avatar || message.agentAvatar;
  const nickname = isUser
    ? userProfile.nickname
    : agent?.nickname ||
      message.agentNickname ||
      message.agentUsername ||
      t('sedimentation.reviewAssistant');
  const isFailed = message.status === 'failed';
  const fallback = isUser
    ? userProfile.nickname.slice(0, 1) || t('common.me')
    : nickname.slice(0, 1) || t('sedimentation.reviewAssistantFallback');
  const className = [
    'annotation-discussion-message',
    'annotation-sedimentation-review-message',
    isUser ? 'is-user' : 'is-assistant',
    isFailed ? 'is-failed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const reviewingLabel = t('sedimentation.reviewing');
  const errorMessage = message.errorMessage || t('sedimentation.reviewFailed');
  const structuredItems = (message.items || []).filter(
    (reviewItem) => reviewItem.type !== 'proposal',
  );
  const html = useMemo(
    () => renderSafeMarkdown(message.content || (isFailed ? errorMessage : reviewingLabel)),
    [errorMessage, isFailed, message.content, reviewingLabel],
  );

  return (
    <article className={className}>
      <AvatarBadge avatar={avatar} fallback={fallback} />
      <div className="annotation-discussion-message-bubble">
        <header>
          <strong>{nickname}</strong>
          <ReaderTooltip content={formatAbsoluteTime(message.createdAt)}>
            <time dateTime={message.createdAt} tabIndex={0}>
              {formatRelativeTime(message.createdAt)}
            </time>
          </ReaderTooltip>
        </header>
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        {structuredItems.length > 0 ? (
          <StructuredReviewItems items={structuredItems} />
        ) : (
          <div
            className="annotation-discussion-markdown"
            dangerouslySetInnerHTML={{
              __html: html,
            }}
          />
        )}
        {isFailed && message.content ? (
          <p className="annotation-sedimentation-review-error">{errorMessage}</p>
        ) : null}
        {!isUser && message.proposals?.length ? (
          <ReviewProposalList
            messageId={message.id}
            proposals={message.proposals}
            pendingProposalIds={pendingProposalIds}
            onAnchorEnter={onProposalAnchorEnter}
            onAnchorLeave={onProposalAnchorLeave}
            onIgnore={onProposalIgnore}
            onPreview={onProposalPreview}
            onRestore={onProposalRestore}
          />
        ) : null}
      </div>
    </article>
  );
}

export function StructuredReviewItems({ items }: { items: AnnotationDistillationReviewItem[] }) {
  const visibleItems = items.filter((item) => item.type !== 'proposal');
  if (visibleItems.length === 0) return null;
  return (
    <div className="annotation-sedimentation-review-items">
      {visibleItems.map((item) => {
        if (item.type === 'overview') {
          return (
            <article
              className={`annotation-sedimentation-review-item is-overview is-${item.stance}`}
              key={item.id}
            >
              <span>{reviewStanceLabel(item.stance)}</span>
              <p>{item.content}</p>
            </article>
          );
        }
        return (
          <article
            className={`annotation-sedimentation-review-item is-finding is-${item.severity}`}
            key={item.id}
          >
            <header>
              <span>
                {reviewFindingCategoryLabel(item.category)} ·{' '}
                {reviewFindingSeverityLabel(item.severity)}
              </span>
              <strong>{item.title}</strong>
            </header>
            <p>{item.content}</p>
            {item.draftTargetText ? <blockquote>{item.draftTargetText}</blockquote> : null}
          </article>
        );
      })}
    </div>
  );
}

function ReviewProposalList({
  messageId,
  onAnchorEnter,
  onAnchorLeave,
  onIgnore,
  onPreview,
  onRestore,
  pendingProposalIds,
  proposals,
}: {
  messageId: string;
  onAnchorEnter: (proposal: AnnotationDistillationProposal) => void;
  onAnchorLeave: () => void;
  onPreview: (
    messageId: string,
    proposals: AnnotationDistillationProposal[],
  ) => void | Promise<void>;
  onIgnore: (messageId: string, proposalId: string) => void | Promise<void>;
  onRestore: (messageId: string, proposalId: string) => void | Promise<void>;
  pendingProposalIds: string[];
  proposals: AnnotationDistillationProposal[];
}) {
  const { t } = useTranslation();
  const pendingProposals = pendingReviewProposals(proposals);
  return (
    <section
      className="annotation-sedimentation-proposals"
      aria-label={t('sedimentation.proposals')}
    >
      {proposals.map((proposal) => {
        const previewing = pendingProposalIds.includes(proposal.id);
        return (
          <article
            className={[
              'annotation-sedimentation-proposal',
              `is-${proposal.status}`,
              `is-${proposal.kind}`,
            ].join(' ')}
            key={proposal.id}
            onBlur={(event) => {
              if (!focusStayedInside(event.currentTarget, event.relatedTarget)) {
                onAnchorLeave();
              }
            }}
            onFocus={() => onAnchorEnter(proposal)}
            onMouseEnter={() => onAnchorEnter(proposal)}
            onMouseLeave={onAnchorLeave}
          >
            <div className="annotation-sedimentation-proposal-main">
              <header>
                <span>{proposalKindLabel(proposal.kind)}</span>
                <strong>{proposal.title}</strong>
              </header>
              {proposal.rationale ? <p>{proposal.rationale}</p> : null}
              <ProposalDiffPreview proposal={proposal} />
            </div>
            <div className="annotation-sedimentation-proposal-actions">
              {proposal.status === 'pending' ? (
                previewing ? (
                  <span className="annotation-sedimentation-proposal-state">
                    {t('sedimentation.previewingProposal')}
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void onPreview(messageId, pendingProposals)}
                    >
                      <Eye size={14} />
                      <span>{t('sedimentation.previewProposal')}</span>
                    </button>
                    <button
                      className="is-secondary"
                      type="button"
                      onClick={() => void onIgnore(messageId, proposal.id)}
                    >
                      <X size={14} />
                      <span>{t('sedimentation.ignoreProposal')}</span>
                    </button>
                  </>
                )
              ) : null}
              {proposal.status === 'ignored' ? (
                <button
                  className="is-secondary"
                  type="button"
                  onClick={() => void onRestore(messageId, proposal.id)}
                >
                  <RotateCcw size={14} />
                  <span>{t('sedimentation.restoreProposal')}</span>
                </button>
              ) : null}
              {proposal.status === 'accepted' ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.acceptedProposal')}
                </span>
              ) : null}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function reviewStanceLabel(
  value: Extract<AnnotationDistillationReviewItem, { type: 'overview' }>['stance'],
) {
  if (i18next.language.startsWith('zh')) {
    if (value === 'solid') return '基本站得住';
    if (value === 'weak') return '仍需补强';
    return '有亮点也有缺口';
  }
  if (value === 'solid') return 'Solid';
  if (value === 'weak') return 'Needs work';
  return 'Mixed';
}

function reviewFindingCategoryLabel(
  value: Extract<AnnotationDistillationReviewItem, { type: 'finding' }>['category'],
) {
  const zh = i18next.language.startsWith('zh');
  if (value === 'evidence') return zh ? '证据' : 'Evidence';
  if (value === 'logic') return zh ? '逻辑' : 'Logic';
  if (value === 'coverage') return zh ? '覆盖' : 'Coverage';
  if (value === 'clarity') return zh ? '表达' : 'Clarity';
  return zh ? '行动' : 'Action';
}

function reviewFindingSeverityLabel(
  value: Extract<AnnotationDistillationReviewItem, { type: 'finding' }>['severity'],
) {
  const zh = i18next.language.startsWith('zh');
  if (value === 'high') return zh ? '关键' : 'High';
  if (value === 'low') return zh ? '轻微' : 'Low';
  return zh ? '一般' : 'Medium';
}

export function proposalKindLabel(kind: AnnotationDistillationProposal['kind']) {
  if (kind === 'insert') return i18next.t('sedimentation.proposalKind.insert');
  if (kind === 'replace') return i18next.t('sedimentation.proposalKind.replace');
  return i18next.t('sedimentation.proposalKind.delete');
}

export function ProposalDiffPreview({ proposal }: { proposal: AnnotationDistillationProposal }) {
  if (proposal.kind === 'insert') {
    return (
      <blockquote className="proposal-diff">
        <ins className="proposal-diff-insert">{proposal.content || ''}</ins>
      </blockquote>
    );
  }
  if (proposal.kind === 'replace') {
    return (
      <blockquote className="proposal-diff">
        <del className="proposal-diff-delete">{proposal.targetText || ''}</del>
        <ins className="proposal-diff-insert">{proposal.replacementText || ''}</ins>
      </blockquote>
    );
  }
  return (
    <blockquote className="proposal-diff">
      <del className="proposal-diff-delete">{proposal.targetText || ''}</del>
    </blockquote>
  );
}

function focusStayedInside(currentTarget: EventTarget, relatedTarget: EventTarget | null) {
  return relatedTarget instanceof Node && currentTarget instanceof Node
    ? currentTarget.contains(relatedTarget)
    : false;
}
