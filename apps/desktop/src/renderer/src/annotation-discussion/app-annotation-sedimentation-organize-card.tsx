import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, RotateCcw, Sparkles, X } from 'lucide-react';
import type {
  AnnotationDistillationProposal,
  AnnotationDistillationReviewMessage,
  PublicAgent,
} from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import { AvatarBadge } from '@yomitomo/reader-ui/reader-component-primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';
import { pendingOrganizeProposals } from './app-annotation-sedimentation-state';
import {
  ProposalDiffPreview,
  StructuredReviewItems,
  proposalKindLabel,
} from './app-annotation-sedimentation-review-timeline';

export type OrganizeDiscussionState =
  | { type: 'idle' }
  | {
      type: 'running' | 'done' | 'failed';
      agent: PublicAgent;
      message: AnnotationDistillationReviewMessage;
      notice?: string;
    };

export function OrganizeDiscussionConfirmDialog({
  disabled,
  open,
  onCancel,
  onConfirm,
}: {
  disabled: boolean;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <DialogPortal>
        <DialogOverlay className="annotation-sedimentation-confirm-overlay">
          <DialogContent
            aria-describedby="annotation-sedimentation-organize-confirm-description"
            aria-labelledby="annotation-sedimentation-organize-confirm-title"
            className="annotation-sedimentation-confirm"
          >
            <header>
              <span className="annotation-sedimentation-confirm-icon" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div>
                <DialogTitle id="annotation-sedimentation-organize-confirm-title">
                  {t('sedimentation.organizeConfirmTitle')}
                </DialogTitle>
                <DialogDescription id="annotation-sedimentation-organize-confirm-description">
                  {t('sedimentation.organizeConfirmDescription')}
                </DialogDescription>
              </div>
            </header>
            <footer>
              <button type="button" onClick={onCancel}>
                {t('sedimentation.organizeConfirmCancel')}
              </button>
              <button className="is-primary" type="button" disabled={disabled} onClick={onConfirm}>
                {t('sedimentation.organizeConfirmSubmit')}
              </button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

export function OrganizeDiscussionCard({
  appliedProposalIds,
  dismissedProposalIds,
  onClose,
  onProposalAnchorEnter,
  onProposalAnchorLeave,
  onPreviewProposals,
  onRetry,
  pendingProposalIds,
  state,
}: {
  appliedProposalIds: Set<string>;
  dismissedProposalIds: Set<string>;
  onClose: () => void;
  onProposalAnchorEnter: (proposal: AnnotationDistillationProposal) => void;
  onProposalAnchorLeave: () => void;
  onPreviewProposals: (proposals: AnnotationDistillationProposal[]) => void;
  onRetry: () => void;
  pendingProposalIds: string[];
  state: Exclude<OrganizeDiscussionState, { type: 'idle' }>;
}) {
  const { t } = useTranslation();
  const { agent, message } = state;
  const isRunning = state.type === 'running';
  const isFailed = state.type === 'failed';
  const minimized = pendingProposalIds.length > 0;
  const structuredItems = (message.items || []).filter((item) => item.type !== 'proposal');
  const proposals = message.proposals || [];
  const appendableProposalCount = pendingOrganizeProposals(
    proposals,
    appliedProposalIds,
    dismissedProposalIds,
  ).length;
  const statusLabel = minimized
    ? t('sedimentation.previewingProposal')
    : isFailed
      ? t('sedimentation.organizeCardFailed')
      : isRunning
        ? t('sedimentation.organizeCardRunning')
        : appendableProposalCount > 0
          ? t('sedimentation.organizeCardDoneWithProposals', { count: appendableProposalCount })
          : structuredItems.length > 0
            ? t('sedimentation.organizeCardDoneWithFindings', { count: structuredItems.length })
            : t('sedimentation.organizeCardDone');
  const errorMessage = message.errorMessage || t('sedimentation.reviewFailed');
  const fallback = isFailed ? errorMessage : t('sedimentation.organizeCardEmpty');
  const shouldShowMarkdown =
    structuredItems.length === 0 && (Boolean(message.content.trim()) || proposals.length === 0);
  const html = useMemo(
    () => renderSafeMarkdown(message.content || fallback),
    [fallback, message.content],
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [hasScrollMore, setHasScrollMore] = useState(false);

  function updateScrollHint() {
    const body = bodyRef.current;
    if (!body) {
      setHasScrollMore(false);
      return;
    }
    setHasScrollMore(body.scrollTop + body.clientHeight < body.scrollHeight - 3);
  }

  useEffect(() => {
    updateScrollHint();
    const body = bodyRef.current;
    if (!body || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(body);
    return () => observer.disconnect();
  }, [
    message.assistantProgress,
    message.content,
    message.items,
    message.proposals,
    state.notice,
    state.type,
  ]);

  if (minimized) {
    return (
      <article className={`annotation-sedimentation-organize-card is-${state.type} is-minimized`}>
        <header>
          <div className="annotation-sedimentation-organize-title">
            <span className="annotation-sedimentation-organize-icon">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>{t('sedimentation.organizeCardTitle')}</strong>
              <span>{statusLabel}</span>
            </div>
          </div>
          <div className="annotation-sedimentation-organize-meta">
            <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
            <span>{agent.nickname}</span>
          </div>
        </header>
      </article>
    );
  }

  return (
    <article className={`annotation-sedimentation-organize-card is-${state.type}`}>
      <header>
        <div className="annotation-sedimentation-organize-title">
          <span className="annotation-sedimentation-organize-icon">
            <Sparkles size={15} />
          </span>
          <div>
            <strong>{t('sedimentation.organizeCardTitle')}</strong>
            <span>{statusLabel}</span>
          </div>
        </div>
        <div className="annotation-sedimentation-organize-meta">
          <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
          <span>{agent.nickname}</span>
          {isFailed ? (
            <button type="button" onClick={onRetry}>
              <RotateCcw size={14} />
              <span>{t('sedimentation.organizeCardRetry')}</span>
            </button>
          ) : null}
          {!isRunning ? (
            <button
              className="is-icon"
              type="button"
              aria-label={t('sedimentation.organizeCardClose')}
              onClick={onClose}
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      </header>
      <div
        ref={bodyRef}
        className={[
          'annotation-sedimentation-organize-body',
          hasScrollMore ? 'has-scroll-more' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onScroll={updateScrollHint}
      >
        <AssistantRuntimeProgressList progress={message.assistantProgress} />
        {structuredItems.length > 0 ? (
          <StructuredReviewItems items={structuredItems} />
        ) : shouldShowMarkdown ? (
          <div
            className="annotation-discussion-markdown"
            dangerouslySetInnerHTML={{
              __html: html,
            }}
          />
        ) : null}
        {isFailed && message.content ? (
          <p className="annotation-sedimentation-review-error">{errorMessage}</p>
        ) : null}
        {proposals.length > 0 ? (
          <OrganizeProposalList
            appliedProposalIds={appliedProposalIds}
            dismissedProposalIds={dismissedProposalIds}
            pendingProposalIds={pendingProposalIds}
            proposals={proposals}
            onProposalAnchorEnter={onProposalAnchorEnter}
            onProposalAnchorLeave={onProposalAnchorLeave}
            onPreviewProposals={onPreviewProposals}
          />
        ) : null}
        {state.notice ? (
          <p className="annotation-sedimentation-organize-notice">{state.notice}</p>
        ) : null}
        <span className="annotation-sedimentation-organize-scroll-glow" aria-hidden="true" />
      </div>
    </article>
  );
}

function OrganizeProposalList({
  appliedProposalIds,
  dismissedProposalIds,
  onProposalAnchorEnter,
  onProposalAnchorLeave,
  onPreviewProposals,
  pendingProposalIds,
  proposals,
}: {
  appliedProposalIds: Set<string>;
  dismissedProposalIds: Set<string>;
  onProposalAnchorEnter: (proposal: AnnotationDistillationProposal) => void;
  onProposalAnchorLeave: () => void;
  onPreviewProposals: (proposals: AnnotationDistillationProposal[]) => void;
  pendingProposalIds: string[];
  proposals: AnnotationDistillationProposal[];
}) {
  const { t } = useTranslation();
  const pendingProposals = pendingOrganizeProposals(
    proposals,
    appliedProposalIds,
    dismissedProposalIds,
  );
  return (
    <section
      className="annotation-sedimentation-proposals annotation-sedimentation-organize-proposals"
      aria-label={t('sedimentation.proposals')}
    >
      {proposals.map((proposal) => {
        const applied = appliedProposalIds.has(proposal.id);
        const dismissed = dismissedProposalIds.has(proposal.id);
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
                onProposalAnchorLeave();
              }
            }}
            onFocus={() => onProposalAnchorEnter(proposal)}
            onMouseEnter={() => onProposalAnchorEnter(proposal)}
            onMouseLeave={onProposalAnchorLeave}
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
              {applied ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.organizeAddedToDraft')}
                </span>
              ) : dismissed ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.discardedProposal')}
                </span>
              ) : previewing ? (
                <span className="annotation-sedimentation-proposal-state">
                  {t('sedimentation.previewingProposal')}
                </span>
              ) : (
                <button type="button" onClick={() => onPreviewProposals(pendingProposals)}>
                  <Eye size={14} />
                  <span>{t('sedimentation.previewProposal')}</span>
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

function focusStayedInside(currentTarget: EventTarget, relatedTarget: EventTarget | null) {
  return relatedTarget instanceof Node && currentTarget instanceof Node
    ? currentTarget.contains(relatedTarget)
    : false;
}
