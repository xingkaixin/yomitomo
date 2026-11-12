import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import type { Ref } from 'react';
import i18next from 'i18next';
import { renderSafeMarkdown } from '@yomitomo/core/safe-markdown';
import { AssistantReferenceText } from '../shell/app-assistant-references';
import {
  normalizeDistillationProposalDraftChangeSetEntries,
  type DistillationProposalDraftAnchorResult,
  type DistillationProposalDraftChange,
  type DistillationProposalDraftChangeSet,
  type DistillationProposalDraftChangeSetEntry,
} from './app-annotation-sedimentation-proposals';
import {
  type DraftPreviewDecision,
  type DraftPreviewDecisions,
} from './app-annotation-sedimentation-state';

export type HoveredDraftAnchor = Extract<DistillationProposalDraftAnchorResult, { ok: true }>;

export function DraftDocument({ draft }: { draft: string }) {
  return (
    <div
      className="annotation-sedimentation-draft-document annotation-discussion-markdown"
      tabIndex={0}
      dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(draft) }}
    />
  );
}

export function DraftChangePreviewLayer({
  changeSet,
  decisions,
  onDecision,
  onNavigate,
  previewRef,
}: {
  changeSet: DistillationProposalDraftChangeSet;
  decisions: DraftPreviewDecisions;
  onDecision: (proposalId: string, decision: Exclude<DraftPreviewDecision, 'pending'>) => void;
  onNavigate: (direction: -1 | 1) => void;
  previewRef: Ref<HTMLDivElement>;
}) {
  let cursor = 0;
  const visibleChanges = normalizeDistillationProposalDraftChangeSetEntries(
    changeSet.baseDraft,
    changeSet.changes.filter((change) => decisions[change.proposalId] !== 'rejected'),
  );
  const pendingCount = Object.values(decisions).filter((decision) => decision === 'pending').length;
  return (
    <div
      className="annotation-sedimentation-draft-preview-layer"
      aria-label={i18next.t('sedimentation.draftChangePreview')}
      role="region"
    >
      <nav
        className="annotation-sedimentation-draft-preview-navigation"
        aria-label={i18next.t('sedimentation.changeNavigation')}
      >
        <span role="status">
          {i18next.t('sedimentation.pendingChanges', { count: pendingCount })}
        </span>
        <div>
          <button
            type="button"
            onClick={() => onNavigate(-1)}
            aria-label={i18next.t('sedimentation.previousChange')}
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={15} />
          </button>
          <button
            type="button"
            onClick={() => onNavigate(1)}
            aria-label={i18next.t('sedimentation.nextChange')}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} size={15} />
          </button>
        </div>
      </nav>
      <div className="annotation-sedimentation-draft-preview-text" ref={previewRef}>
        {visibleChanges.map((change, index) => {
          const before = changeSet.baseDraft.slice(cursor, change.range.start);
          cursor = change.kind === 'insert' ? change.range.start : change.range.end;
          return (
            <span key={`${change.range.start}-${change.range.end}-${index}`}>
              <AssistantReferenceText text={before} />
              <DraftChangePreviewChange
                change={change}
                decision={decisions[change.proposalId] || 'pending'}
                onDecision={onDecision}
              />
            </span>
          );
        })}
        <AssistantReferenceText text={changeSet.baseDraft.slice(cursor)} />
      </div>
    </div>
  );
}

export function DraftAnchorHighlightLayer({
  anchor,
  draft,
  scrollLeft,
  scrollTop,
}: {
  anchor: HoveredDraftAnchor;
  draft: string;
  scrollLeft: number;
  scrollTop: number;
}) {
  const before = draft.slice(0, anchor.range.start);
  const target = draft.slice(anchor.range.start, anchor.range.end);
  const after = draft.slice(anchor.range.end);
  return (
    <div
      className="annotation-sedimentation-draft-anchor-layer"
      aria-label={i18next.t('sedimentation.draftAnchorHighlight')}
      role="region"
    >
      <div
        className="annotation-sedimentation-draft-anchor-text"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        <span>{before}</span>
        {anchor.anchorKind === 'point' ? (
          <span className="annotation-sedimentation-draft-anchor-point" />
        ) : (
          <mark className={`annotation-sedimentation-draft-anchor-mark is-${anchor.status}`}>
            {target}
          </mark>
        )}
        <span>{after}</span>
      </div>
    </div>
  );
}

function DraftChangePreviewChange({
  change,
  decision,
  onDecision,
}: {
  change: DistillationProposalDraftChangeSetEntry;
  decision: DraftPreviewDecision;
  onDecision: (proposalId: string, decision: Exclude<DraftPreviewDecision, 'pending'>) => void;
}) {
  return (
    <span
      className="annotation-sedimentation-draft-preview-change"
      data-proposal-id={change.proposalId}
      tabIndex={-1}
    >
      <DraftChangePreviewMark change={change} />
      {decision === 'pending' ? (
        <span className="annotation-sedimentation-draft-preview-change-actions">
          <button type="button" onClick={() => onDecision(change.proposalId, 'accepted')}>
            <HugeiconsIcon icon={Tick01Icon} size={13} />
            <span>{i18next.t('sedimentation.keepProposalChange')}</span>
          </button>
          <button
            className="is-secondary"
            type="button"
            onClick={() => onDecision(change.proposalId, 'rejected')}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} />
            <span>{i18next.t('sedimentation.discardProposalChange')}</span>
          </button>
        </span>
      ) : (
        <span className="annotation-sedimentation-draft-preview-change-state">
          <HugeiconsIcon icon={Tick01Icon} size={12} />
          <span>{i18next.t('sedimentation.keptProposalChange')}</span>
        </span>
      )}
    </span>
  );
}

function DraftChangePreviewMark({ change }: { change: DistillationProposalDraftChange }) {
  if (change.kind === 'insert') {
    return (
      <ins className="annotation-sedimentation-draft-preview-insert">
        <AssistantReferenceText text={change.insertedText} />
      </ins>
    );
  }
  if (change.kind === 'delete') {
    return (
      <del className="annotation-sedimentation-draft-preview-delete">
        <AssistantReferenceText text={change.deletedText} />
      </del>
    );
  }
  return (
    <>
      <del className="annotation-sedimentation-draft-preview-delete">
        <AssistantReferenceText text={change.deletedText} />
      </del>
      <ins className="annotation-sedimentation-draft-preview-insert">
        <AssistantReferenceText text={change.insertedText} />
      </ins>
    </>
  );
}
