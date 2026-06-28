import { Check, X } from 'lucide-react';
import i18next from 'i18next';
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

export function DraftChangePreviewLayer({
  changeSet,
  decisions,
  onDecision,
  scrollLeft,
  scrollTop,
}: {
  changeSet: DistillationProposalDraftChangeSet;
  decisions: DraftPreviewDecisions;
  onDecision: (proposalId: string, decision: Exclude<DraftPreviewDecision, 'pending'>) => void;
  scrollLeft: number;
  scrollTop: number;
}) {
  let cursor = 0;
  const visibleChanges = normalizeDistillationProposalDraftChangeSetEntries(
    changeSet.baseDraft,
    changeSet.changes.filter((change) => decisions[change.proposalId] !== 'rejected'),
  );
  return (
    <div
      className="annotation-sedimentation-draft-preview-layer"
      aria-label={i18next.t('sedimentation.draftChangePreview')}
      role="region"
    >
      <div
        className="annotation-sedimentation-draft-preview-text"
        style={{ transform: `translate(${-scrollLeft}px, ${-scrollTop}px)` }}
      >
        {visibleChanges.map((change, index) => {
          const before = changeSet.baseDraft.slice(cursor, change.range.start);
          cursor = change.kind === 'insert' ? change.range.start : change.range.end;
          return (
            <span key={`${change.range.start}-${change.range.end}-${index}`}>
              <span>{before}</span>
              <DraftChangePreviewChange
                change={change}
                decision={decisions[change.proposalId] || 'pending'}
                onDecision={onDecision}
              />
            </span>
          );
        })}
        <span>{changeSet.baseDraft.slice(cursor)}</span>
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
    <span className="annotation-sedimentation-draft-preview-change">
      <DraftChangePreviewMark change={change} />
      {decision === 'pending' ? (
        <span
          className="annotation-sedimentation-draft-preview-change-actions"
          contentEditable={false}
        >
          <button type="button" onClick={() => onDecision(change.proposalId, 'accepted')}>
            <Check size={13} />
            <span>{i18next.t('sedimentation.keepProposalChange')}</span>
          </button>
          <button
            className="is-secondary"
            type="button"
            onClick={() => onDecision(change.proposalId, 'rejected')}
          >
            <X size={13} />
            <span>{i18next.t('sedimentation.discardProposalChange')}</span>
          </button>
        </span>
      ) : (
        <span
          className="annotation-sedimentation-draft-preview-change-state"
          contentEditable={false}
        >
          <Check size={12} />
          <span>{i18next.t('sedimentation.keptProposalChange')}</span>
        </span>
      )}
    </span>
  );
}

function DraftChangePreviewMark({ change }: { change: DistillationProposalDraftChange }) {
  if (change.kind === 'insert') {
    return (
      <ins className="annotation-sedimentation-draft-preview-insert">{change.insertedText}</ins>
    );
  }
  if (change.kind === 'delete') {
    return (
      <del className="annotation-sedimentation-draft-preview-delete">{change.deletedText}</del>
    );
  }
  return (
    <>
      <del className="annotation-sedimentation-draft-preview-delete">{change.deletedText}</del>
      <ins className="annotation-sedimentation-draft-preview-insert">{change.insertedText}</ins>
    </>
  );
}
