import i18next from 'i18next';
import {
  hashText,
  type AnnotationDistillationProposal,
  type AnnotationDistillationProposalStatus,
  type AnnotationDistillationReviewSession,
} from '@yomitomo/shared';

export type DraftSelectionSnapshot = {
  start: number;
  end: number;
};

export type ProposalApplyFailureReason =
  | 'missing_insert_content'
  | 'missing_replace_target'
  | 'missing_delete_target'
  | 'target_not_found'
  | 'target_ambiguous'
  | 'insert_anchor_not_found'
  | 'duplicate_insert';

export type ProposalApplyResult =
  | {
      ok: true;
      draft: string;
      changeOffset: number;
      changeLength: number;
    }
  | {
      ok: false;
      reason: ProposalApplyFailureReason;
    };

export function proposalApplyFailureMessage(reason: ProposalApplyFailureReason) {
  if (reason === 'missing_insert_content') {
    return i18next.t('sedimentation.proposalErrors.missingInsertContent');
  }
  if (reason === 'missing_replace_target') {
    return i18next.t('sedimentation.proposalErrors.missingReplaceTarget');
  }
  if (reason === 'missing_delete_target') {
    return i18next.t('sedimentation.proposalErrors.missingDeleteTarget');
  }
  if (reason === 'target_ambiguous') {
    return i18next.t('sedimentation.proposalErrors.targetAmbiguous');
  }
  if (reason === 'insert_anchor_not_found') {
    return i18next.t('sedimentation.proposalErrors.insertAnchorNotFound');
  }
  if (reason === 'duplicate_insert') {
    return i18next.t('sedimentation.proposalErrors.duplicateInsert');
  }
  return i18next.t('sedimentation.proposalErrors.targetNotFound');
}

export function applyDistillationProposalToDraft(
  draft: string,
  proposal: AnnotationDistillationProposal,
  selection: DraftSelectionSnapshot | null,
): ProposalApplyResult {
  if (proposal.kind === 'insert') {
    const content = proposal.content?.trim();
    if (!content) return { ok: false, reason: 'missing_insert_content' };
    if (draftContainsContent(draft, content)) return { ok: false, reason: 'duplicate_insert' };
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
      return {
        ok: false,
        reason:
          match.reason === 'target_ambiguous' ? 'target_ambiguous' : 'insert_anchor_not_found',
      };
    }
    if (proposal.sourceDraftHash && proposal.sourceDraftHash === hashText(draft)) {
      const result = insertTextAt(draft, content, draft.length);
      return { ok: true, ...result };
    }
    return { ok: false, reason: 'insert_anchor_not_found' };
  }

  if (proposal.kind === 'replace') {
    const targetText = proposal.targetText?.trim();
    const replacementText = proposal.replacementText?.trim();
    if (!targetText || !replacementText) return { ok: false, reason: 'missing_replace_target' };
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
  if (!targetText) return { ok: false, reason: 'missing_delete_target' };
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
  if (index < 0) return uniqueCompactTextMatch(draft, text);
  if (draft.indexOf(text, index + text.length) >= 0) {
    return {
      ok: false as const,
      reason: 'target_ambiguous' as const,
    };
  }
  return { ok: true as const, index, text };
}

function uniqueCompactTextMatch(draft: string, text: string) {
  const target = compactText(text);
  if (!target) {
    return {
      ok: false as const,
      reason: 'target_not_found' as const,
    };
  }
  const source = compactDraft(draft);
  const compactIndex = source.text.indexOf(target);
  if (compactIndex < 0) {
    return {
      ok: false as const,
      reason: 'target_not_found' as const,
    };
  }
  if (source.text.indexOf(target, compactIndex + target.length) >= 0) {
    return {
      ok: false as const,
      reason: 'target_ambiguous' as const,
    };
  }
  const start = source.offsets[compactIndex];
  const last = source.offsets[compactIndex + target.length - 1];
  if (start === undefined || last === undefined) {
    return {
      ok: false as const,
      reason: 'target_not_found' as const,
    };
  }
  return {
    ok: true as const,
    index: start,
    text: draft.slice(start, last + 1),
  };
}

function compactDraft(value: string) {
  const offsets: number[] = [];
  let text = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) continue;
    text += char;
    offsets.push(index);
  }
  return { text, offsets };
}

function compactText(value: string) {
  return value.replace(/\s+/g, '');
}

function draftContainsContent(draft: string, content: string) {
  const target = compactText(content);
  return Boolean(target && compactText(draft).includes(target));
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
