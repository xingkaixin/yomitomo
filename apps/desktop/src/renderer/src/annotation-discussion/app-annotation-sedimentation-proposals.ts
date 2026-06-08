import i18next from 'i18next';
import type {
  AnnotationDistillationProposal,
  AnnotationDistillationProposalStatus,
  AnnotationDistillationReviewSession,
} from '@yomitomo/shared';

export type DraftSelectionSnapshot = {
  start: number;
  end: number;
};

export type ProposalApplyResult =
  | {
      ok: true;
      draft: string;
      changeOffset: number;
      changeLength: number;
    }
  | {
      ok: false;
      reason: string;
    };

export function applyDistillationProposalToDraft(
  draft: string,
  proposal: AnnotationDistillationProposal,
  selection: DraftSelectionSnapshot | null,
): ProposalApplyResult {
  if (proposal.kind === 'insert') {
    const content = proposal.content?.trim();
    if (!content)
      return { ok: false, reason: i18next.t('sedimentation.proposalErrors.missingInsertContent') };
    const selectionIndex = validSelectionEnd(draft, selection);
    if (selectionIndex !== null) {
      const result = insertTextAt(draft, content, selectionIndex);
      return { ok: true, ...result };
    }
    if (proposal.insertAfterText) {
      const match = uniqueTextMatch(draft, proposal.insertAfterText);
      if (match.ok) {
        const result = insertTextAt(draft, content, match.index + match.text.length);
        return { ok: true, ...result };
      }
    }
    const result = insertTextAt(draft, content, draft.length);
    return { ok: true, ...result };
  }

  if (proposal.kind === 'replace') {
    const targetText = proposal.targetText?.trim();
    const replacementText = proposal.replacementText?.trim();
    if (!targetText || !replacementText)
      return { ok: false, reason: i18next.t('sedimentation.proposalErrors.missingReplaceTarget') };
    const match = uniqueTextMatch(draft, targetText);
    if (!match.ok) return { ok: false, reason: match.reason };
    return {
      ok: true,
      draft: `${draft.slice(0, match.index)}${replacementText}${draft.slice(match.index + match.text.length)}`,
      changeOffset: match.index,
      changeLength: replacementText.length,
    };
  }

  const targetText = proposal.targetText?.trim();
  if (!targetText)
    return { ok: false, reason: i18next.t('sedimentation.proposalErrors.missingDeleteTarget') };
  const match = uniqueTextMatch(draft, targetText);
  if (!match.ok) return { ok: false, reason: match.reason };
  return {
    ok: true,
    draft: `${draft.slice(0, match.index)}${draft.slice(match.index + match.text.length)}`,
    changeOffset: match.index,
    changeLength: 0,
  };
}

export function updateReviewProposalStatus(
  sessions: AnnotationDistillationReviewSession[],
  messageId: string,
  proposalId: string,
  status: AnnotationDistillationProposalStatus,
  now: string,
) {
  return sessions.map((session) => {
    const nextSession = Object.assign({}, session, {
      messages: session.messages.map((message) => {
        if (message.id !== messageId) return message;
        return Object.assign({}, message, {
          proposals: (message.proposals || []).map((proposal) => {
            if (proposal.id !== proposalId) return proposal;
            return Object.assign({}, proposal, {
              status,
              acceptedAt: status === 'accepted' ? now : proposal.acceptedAt,
              ignoredAt: status === 'ignored' ? now : undefined,
              updatedAt: now,
            });
          }),
        });
      }),
      updatedAt: session.messages.some((message) => message.id === messageId)
        ? now
        : session.updatedAt,
    });
    return nextSession;
  });
}

function validSelectionEnd(draft: string, selection: DraftSelectionSnapshot | null) {
  if (!selection) return null;
  if (selection.start < 0 || selection.end < selection.start || selection.end > draft.length) {
    return null;
  }
  return selection.end;
}

function uniqueTextMatch(draft: string, text: string) {
  const index = draft.indexOf(text);
  if (index < 0)
    return {
      ok: false as const,
      reason: i18next.t('sedimentation.proposalErrors.targetNotFound'),
    };
  if (draft.indexOf(text, index + text.length) >= 0) {
    return {
      ok: false as const,
      reason: i18next.t('sedimentation.proposalErrors.targetAmbiguous'),
    };
  }
  return { ok: true as const, index, text };
}

function insertTextAt(
  draft: string,
  content: string,
  index: number,
): { draft: string; changeOffset: number; changeLength: number } {
  const before = draft.slice(0, index);
  const after = draft.slice(index);
  const prefix = before && !/\s$/.test(before) ? '\n' : '';
  const suffix = after && !/^\s/.test(after) ? '\n' : '';
  const changeOffset = before.length + prefix.length;
  return {
    draft: `${before}${prefix}${content}${suffix}${after}`,
    changeOffset,
    changeLength: content.length,
  };
}
