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
  | 'duplicate_insert'
  | 'conflicting_changes';

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

export type DistillationProposalDraftChange =
  | {
      kind: 'insert';
      baseDraft: string;
      draft: string;
      range: { start: number; end: number };
      insertedText: string;
      changeOffset: number;
      changeLength: number;
    }
  | {
      kind: 'replace';
      baseDraft: string;
      draft: string;
      range: { start: number; end: number };
      deletedText: string;
      insertedText: string;
      changeOffset: number;
      changeLength: number;
    }
  | {
      kind: 'delete';
      baseDraft: string;
      draft: string;
      range: { start: number; end: number };
      deletedText: string;
      changeOffset: number;
      changeLength: number;
    };

export type ProposalDraftChangeResult =
  | { ok: true; change: DistillationProposalDraftChange }
  | { ok: false; reason: ProposalApplyFailureReason };

export type DistillationProposalDraftChangeSet = {
  baseDraft: string;
  draft: string;
  changes: DistillationProposalDraftChangeSetEntry[];
};

export type DistillationProposalDraftChangeSetEntry = DistillationProposalDraftChange & {
  proposalId: string;
  originalInsertedText?: string;
};

export type ProposalDraftChangeSetResult =
  | { ok: true; changeSet: DistillationProposalDraftChangeSet }
  | { ok: false; reason: ProposalApplyFailureReason };

export type DistillationProposalDraftAnchorStatus = 'resolved' | 'drifted' | 'stale' | 'ambiguous';

export type DistillationProposalDraftAnchorResult =
  | {
      ok: true;
      status: Extract<DistillationProposalDraftAnchorStatus, 'resolved' | 'drifted'>;
      anchorKind: 'text' | 'point';
      range: { start: number; end: number };
      text: string;
    }
  | {
      ok: false;
      status: Extract<DistillationProposalDraftAnchorStatus, 'stale' | 'ambiguous'>;
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
  if (reason === 'conflicting_changes') {
    return i18next.t('sedimentation.proposalErrors.conflictingChanges');
  }
  return i18next.t('sedimentation.proposalErrors.targetNotFound');
}

export function applyDistillationProposalToDraft(
  draft: string,
  proposal: AnnotationDistillationProposal,
  selection: DraftSelectionSnapshot | null,
): ProposalApplyResult {
  const result = planDistillationProposalChange(draft, proposal, selection);
  if (!result.ok) return result;
  return {
    ok: true,
    draft: result.change.draft,
    changeOffset: result.change.changeOffset,
    changeLength: result.change.changeLength,
  };
}

export function planDistillationProposalChange(
  draft: string,
  proposal: AnnotationDistillationProposal,
  selection: DraftSelectionSnapshot | null,
): ProposalDraftChangeResult {
  if (proposal.kind === 'insert') {
    const insertProposal = normalizeInsertProposalInput(proposal);
    const content = insertProposal.content;
    if (!content) return { ok: false, reason: 'missing_insert_content' };
    if (draftContainsContent(draft, content)) return { ok: false, reason: 'duplicate_insert' };
    const selectionIndex = validSelectionEnd(draft, selection);
    if (selectionIndex !== null) {
      const result = insertTextAt(draft, content, selectionIndex);
      return {
        ok: true,
        change: {
          kind: 'insert',
          baseDraft: draft,
          ...result,
        },
      };
    }
    if (insertProposal.insertAfterText) {
      const match = uniqueTextMatch(draft, insertProposal.insertAfterText);
      if (match.ok) {
        const result = insertTextAt(draft, content, insertIndexAfterAnchor(draft, match));
        return {
          ok: true,
          change: {
            kind: 'insert',
            baseDraft: draft,
            ...result,
          },
        };
      }
      return {
        ok: false,
        reason:
          match.reason === 'target_ambiguous' ? 'target_ambiguous' : 'insert_anchor_not_found',
      };
    }
    if (proposal.sourceDraftHash && proposal.sourceDraftHash === hashText(draft)) {
      const result = insertTextAt(draft, content, draft.length);
      return {
        ok: true,
        change: {
          kind: 'insert',
          baseDraft: draft,
          ...result,
        },
      };
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
      change: {
        kind: 'replace',
        baseDraft: draft,
        draft: `${draft.slice(0, match.index)}${replacementText}${draft.slice(match.index + match.text.length)}`,
        range: { start: match.index, end: match.index + match.text.length },
        deletedText: match.text,
        insertedText: replacementText,
        changeOffset: match.index,
        changeLength: replacementText.length,
      },
    };
  }

  const targetText = proposal.targetText?.trim();
  if (!targetText) return { ok: false, reason: 'missing_delete_target' };
  const match = uniqueTextMatch(draft, targetText);
  if (!match.ok) return { ok: false, reason: match.reason };
  return {
    ok: true,
    change: {
      kind: 'delete',
      baseDraft: draft,
      draft: `${draft.slice(0, match.index)}${draft.slice(match.index + match.text.length)}`,
      range: { start: match.index, end: match.index + match.text.length },
      deletedText: match.text,
      changeOffset: match.index,
      changeLength: 0,
    },
  };
}

export function planDistillationProposalChangeSet(
  draft: string,
  proposals: AnnotationDistillationProposal[],
  selection: DraftSelectionSnapshot | null,
): ProposalDraftChangeSetResult {
  const changes: DistillationProposalDraftChangeSetEntry[] = [];
  for (const proposal of proposals) {
    const result = planDistillationProposalChange(draft, proposal, selection);
    if (!result.ok) return result;
    changes.push(
      result.change.kind === 'insert'
        ? {
            ...result.change,
            proposalId: proposal.id,
            originalInsertedText: result.change.insertedText,
          }
        : { ...result.change, proposalId: proposal.id },
    );
  }

  const orderedChanges = orderDraftChanges(normalizeSamePositionInsertSpacing(draft, changes));
  if (hasConflictingDraftChanges(orderedChanges)) {
    return { ok: false, reason: 'conflicting_changes' };
  }

  return {
    ok: true,
    changeSet: {
      baseDraft: draft,
      draft: composeDistillationProposalDraftChanges(draft, orderedChanges),
      changes: orderedChanges,
    },
  };
}

export function planDistillationProposalDraftAnchor(
  draft: string,
  proposal: AnnotationDistillationProposal,
): DistillationProposalDraftAnchorResult {
  if (proposal.kind === 'insert') {
    const insertProposal = normalizeInsertProposalInput(proposal);
    if (insertProposal.insertAfterText) {
      return anchorMatchResult(
        draft,
        insertProposal.insertAfterText,
        proposal.sourceDraftHash,
        'text',
      );
    }
    if (proposal.sourceDraftHash && proposal.sourceDraftHash === hashText(draft)) {
      return {
        ok: true,
        status: 'resolved',
        anchorKind: 'point',
        range: { start: draft.length, end: draft.length },
        text: '',
      };
    }
    return { ok: false, status: 'stale' };
  }

  const targetText = proposal.targetText?.trim();
  if (!targetText) return { ok: false, status: 'stale' };
  return anchorMatchResult(draft, targetText, proposal.sourceDraftHash, 'text');
}

export function updateReviewProposalStatus(
  sessions: AnnotationDistillationReviewSession[],
  messageId: string,
  proposalId: string,
  status: AnnotationDistillationProposalStatus,
  now: string,
) {
  return updateReviewProposalStatuses(sessions, messageId, [proposalId], status, now);
}

export function updateReviewProposalStatuses(
  sessions: AnnotationDistillationReviewSession[],
  messageId: string,
  proposalIds: string[],
  status: AnnotationDistillationProposalStatus,
  now: string,
) {
  return updateReviewProposalStatusMap(
    sessions,
    messageId,
    Object.fromEntries(proposalIds.map((proposalId) => [proposalId, status])),
    now,
  );
}

export function updateReviewProposalStatusMap(
  sessions: AnnotationDistillationReviewSession[],
  messageId: string,
  proposalStatusById: Record<string, AnnotationDistillationProposalStatus>,
  now: string,
) {
  return sessions.map((session) => {
    const nextSession = Object.assign({}, session, {
      messages: session.messages.map((message) => {
        if (message.id !== messageId) return message;
        return Object.assign({}, message, {
          proposals: (message.proposals || []).map((proposal) => {
            const status = proposalStatusById[proposal.id];
            if (!status) return proposal;
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

export function composeDistillationProposalDraftChanges(
  draft: string,
  changes: DistillationProposalDraftChange[],
) {
  let cursor = 0;
  let nextDraft = '';
  for (const change of changes) {
    nextDraft += draft.slice(cursor, change.range.start);
    if (change.kind === 'insert') {
      nextDraft += change.insertedText;
      cursor = change.range.start;
      continue;
    }
    if (change.kind === 'replace') {
      nextDraft += change.insertedText;
    }
    cursor = change.range.end;
  }
  return `${nextDraft}${draft.slice(cursor)}`;
}

export function composeDistillationProposalDraftChangeSetEntries(
  draft: string,
  changes: DistillationProposalDraftChangeSetEntry[],
) {
  return composeDistillationProposalDraftChanges(
    draft,
    normalizeDistillationProposalDraftChangeSetEntries(draft, changes),
  );
}

export function normalizeDistillationProposalDraftChangeSetEntries(
  draft: string,
  changes: DistillationProposalDraftChangeSetEntry[],
) {
  const rawInsertChanges = changes.map((change) => {
    if (change.kind !== 'insert' || change.originalInsertedText === undefined) return change;
    return Object.assign({}, change, { insertedText: change.originalInsertedText });
  });
  return orderDraftChanges(normalizeSamePositionInsertSpacing(draft, rawInsertChanges));
}

function orderDraftChanges<T extends DistillationProposalDraftChange>(changes: T[]) {
  return changes
    .map((change, index) => ({ change, index }))
    .toSorted((left, right) => {
      if (left.change.range.start !== right.change.range.start) {
        return left.change.range.start - right.change.range.start;
      }
      const priority = draftChangePriority(left.change) - draftChangePriority(right.change);
      return priority || left.index - right.index;
    })
    .map((item) => item.change);
}

function draftChangePriority(change: DistillationProposalDraftChange) {
  return change.kind === 'insert' ? 0 : 1;
}

function normalizeSamePositionInsertSpacing(
  draft: string,
  changes: DistillationProposalDraftChangeSetEntry[],
) {
  const priorInsertTextByOffset = new Map<number, string>();
  return changes.map((change) => {
    if (change.kind !== 'insert') return change;
    const offset = change.range.start;
    const priorInsertText = priorInsertTextByOffset.get(offset) || '';
    const textBeforeInsert = `${draft.slice(0, offset)}${priorInsertText}`;
    const insertedText =
      textBeforeInsert && !/\s$/.test(textBeforeInsert) && !/^\s/.test(change.insertedText)
        ? `\n${change.insertedText}`
        : change.insertedText;
    priorInsertTextByOffset.set(offset, `${priorInsertText}${insertedText}`);
    return Object.assign({}, change, { insertedText });
  });
}

function hasConflictingDraftChanges(changes: DistillationProposalDraftChange[]) {
  for (let leftIndex = 0; leftIndex < changes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < changes.length; rightIndex += 1) {
      if (draftChangesConflict(changes[leftIndex], changes[rightIndex])) return true;
    }
  }
  return false;
}

function draftChangesConflict(
  left: DistillationProposalDraftChange,
  right: DistillationProposalDraftChange,
) {
  if (left.kind !== 'insert' && right.kind !== 'insert') {
    return left.range.start < right.range.end && right.range.start < left.range.end;
  }
  if (left.kind === 'insert' && right.kind === 'insert') return false;
  const insert = left.kind === 'insert' ? left : right;
  const edit = left.kind === 'insert' ? right : left;
  return insert.range.start > edit.range.start && insert.range.start < edit.range.end;
}

function normalizeInsertProposalInput(proposal: AnnotationDistillationProposal) {
  const content = proposal.content?.trim() || '';
  const explicitAnchor = proposal.insertAfterText?.trim();
  if (explicitAnchor || proposal.kind !== 'insert') {
    return { content, insertAfterText: explicitAnchor };
  }
  return parseInsertInstructionContent(content) || { content, insertAfterText: undefined };
}

function parseInsertInstructionContent(content: string) {
  const match = content.match(
    /^在[“"'](.{1,160}?)[”"']之后[，,、\s]*(?:补充|加入|新增|插入)(?:[^：:\n]{0,24})?[：:]\s*([\s\S]+)$/,
  );
  if (!match?.[1] || !match[2]) return null;
  return {
    insertAfterText: match[1].trim(),
    content: unwrapQuotedInstructionText(match[2]),
  };
}

function unwrapQuotedInstructionText(value: string) {
  let text = value.trim();
  const quotePairs = [
    ['“', '”'],
    ['"', '"'],
    ["'", "'"],
    ['‘', '’'],
    ['「', '」'],
    ['『', '』'],
  ] as const;
  for (const [open, close] of quotePairs) {
    if (!text.startsWith(open)) continue;
    if (text.endsWith(close)) {
      text = text.slice(open.length, -close.length).trim();
      break;
    }
    if (text.endsWith(`${close}。`)) {
      text = `${text.slice(open.length, -(close.length + 1)).trim()}。`;
      break;
    }
  }
  return text;
}

function anchorMatchResult(
  draft: string,
  targetText: string,
  sourceDraftHash: string | undefined,
  anchorKind: 'text' | 'point',
): DistillationProposalDraftAnchorResult {
  const match = uniqueTextMatch(draft, targetText);
  if (!match.ok) {
    return { ok: false, status: match.reason === 'target_ambiguous' ? 'ambiguous' : 'stale' };
  }
  return {
    ok: true,
    status: sourceDraftHash && sourceDraftHash !== hashText(draft) ? 'drifted' : 'resolved',
    anchorKind,
    range: { start: match.index, end: match.index + match.text.length },
    text: match.text,
  };
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
  if (index < 0) {
    const compactMatch = uniqueCompactTextMatch(draft, text, isWhitespaceChar);
    if (compactMatch.ok || compactMatch.reason === 'target_ambiguous') return compactMatch;
    return uniqueCompactTextMatch(draft, text, isFlexibleTargetIgnorableChar, true);
  }
  if (draft.indexOf(text, index + text.length) >= 0) {
    return {
      ok: false as const,
      reason: 'target_ambiguous' as const,
    };
  }
  return { ok: true as const, index, text };
}

function uniqueCompactTextMatch(
  draft: string,
  text: string,
  shouldIgnoreChar: (char: string) => boolean,
  includeAdjacentQuoteChars = false,
) {
  const target = compactText(text, shouldIgnoreChar);
  if (!target) {
    return {
      ok: false as const,
      reason: 'target_not_found' as const,
    };
  }
  const source = compactDraft(draft, shouldIgnoreChar);
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
  let matchStart = start;
  let matchEnd = last + 1;
  if (includeAdjacentQuoteChars) {
    while (matchStart > 0 && isQuoteLikeChar(draft[matchStart - 1])) {
      matchStart -= 1;
    }
    while (matchEnd < draft.length && isQuoteLikeChar(draft[matchEnd])) {
      matchEnd += 1;
    }
  }
  return {
    ok: true as const,
    index: matchStart,
    text: draft.slice(matchStart, matchEnd),
  };
}

function compactDraft(value: string, shouldIgnoreChar: (char: string) => boolean) {
  const offsets: number[] = [];
  let text = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (shouldIgnoreChar(char)) continue;
    text += char;
    offsets.push(index);
  }
  return { text, offsets };
}

function compactText(value: string, shouldIgnoreChar = isWhitespaceChar) {
  let text = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (shouldIgnoreChar(char)) continue;
    text += char;
  }
  return text;
}

function isWhitespaceChar(char: string) {
  return /\s/.test(char);
}

function isFlexibleTargetIgnorableChar(char: string) {
  return isWhitespaceChar(char) || isQuoteLikeChar(char);
}

function isQuoteLikeChar(char: string) {
  return /["'“”‘’「」『』]/.test(char);
}

function draftContainsContent(draft: string, content: string) {
  const target = compactText(content);
  return Boolean(target && compactText(draft).includes(target));
}

function insertIndexAfterAnchor(
  draft: string,
  match: {
    index: number;
    text: string;
  },
) {
  let index = match.index + match.text.length;
  while (index < draft.length && isTrailingAnchorPunctuation(draft[index])) {
    index += 1;
  }
  return index;
}

function isTrailingAnchorPunctuation(char: string) {
  return /[，。；：、,.!?！？;:]/.test(char);
}

function insertTextAt(
  draft: string,
  content: string,
  index: number,
): {
  draft: string;
  range: { start: number; end: number };
  insertedText: string;
  changeOffset: number;
  changeLength: number;
} {
  const before = draft.slice(0, index);
  const after = draft.slice(index);
  const prefix = before && !/\s$/.test(before) ? '\n' : '';
  const suffix = after && !/^\s/.test(after) ? '\n' : '';
  const changeOffset = before.length + prefix.length;
  const insertedText = `${prefix}${content}${suffix}`;
  return {
    draft: `${before}${insertedText}${after}`,
    range: { start: index, end: index },
    insertedText,
    changeOffset,
    changeLength: content.length,
  };
}
