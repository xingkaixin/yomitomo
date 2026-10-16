import type {
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationReviewFindingCategory,
  AnnotationDistillationReviewFindingSeverity,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewStance,
} from '@yomitomo/shared';
import { isRecord, makeId, trimmedStringField } from '@yomitomo/shared';

export type GeneratedDistillationReviewItem =
  | {
      type: 'overview';
      stance: AnnotationDistillationReviewStance;
      content: string;
    }
  | {
      type: 'finding';
      category: AnnotationDistillationReviewFindingCategory;
      severity: AnnotationDistillationReviewFindingSeverity;
      title: string;
      content: string;
      draftTargetText?: string;
    }
  | {
      type: 'proposal';
      kind: AnnotationDistillationProposalKind;
      title: string;
      rationale?: string;
      insertAfterText?: string;
      targetText?: string;
      replacementText?: string;
      content?: string;
    };

export function distillationReviewContentFromItems(items: AnnotationDistillationReviewItem[]) {
  return items
    .flatMap((item) => {
      if (item.type === 'overview') return [item.content];
      if (item.type === 'finding') return [`${item.title}\n${item.content}`];
      const text = [item.proposal.title, item.proposal.rationale].filter(Boolean).join('\n');
      return text ? [text] : [];
    })
    .join('\n\n')
    .trim();
}

export function distillationReviewProposalsFromItems(items: AnnotationDistillationReviewItem[]) {
  return items.flatMap((item) => (item.type === 'proposal' ? [item.proposal] : []));
}

export function parseDistillationReviewItem(
  value: unknown,
  now?: () => string,
): { item: AnnotationDistillationReviewItem } | { error: string } {
  const result = validateGeneratedDistillationReviewItem(value);
  return result.success
    ? { item: normalizeGeneratedDistillationReviewItem(result.value, now) }
    : { error: result.error.message };
}

function normalizeGeneratedDistillationReviewItem(
  item: GeneratedDistillationReviewItem,
  now: () => string = () => new Date().toISOString(),
): AnnotationDistillationReviewItem {
  if (item.type === 'overview') {
    return {
      id: makeId('distillation_review_item'),
      type: 'overview',
      stance: item.stance,
      content: item.content.trim(),
    };
  }
  if (item.type === 'finding') {
    return {
      id: makeId('distillation_review_item'),
      type: 'finding',
      category: item.category,
      severity: item.severity,
      title: item.title.trim(),
      content: item.content.trim(),
      draftTargetText: item.draftTargetText?.trim() || undefined,
    };
  }
  return {
    id: makeId('distillation_review_item'),
    type: 'proposal',
    proposal: generatedProposalToProposal(item, now()),
  };
}

function generatedProposalToProposal(
  item: Extract<GeneratedDistillationReviewItem, { type: 'proposal' }>,
  updatedAt: string,
): AnnotationDistillationProposal {
  const content = item.content?.trim() || '';
  const targetText = item.targetText?.trim() || '';
  const replacementText = item.replacementText?.trim() || '';
  return {
    id: makeId('distillation_proposal'),
    kind: item.kind,
    status: 'pending',
    title: item.title.trim() || proposalTitle(item.kind, content, targetText),
    rationale: item.rationale?.trim() || undefined,
    insertAfterText: item.insertAfterText?.trim() || undefined,
    targetText: targetText || undefined,
    replacementText: item.kind === 'replace' ? replacementText : undefined,
    content: item.kind === 'insert' ? content : undefined,
    updatedAt,
  };
}

function validateGeneratedDistillationReviewItem(
  value: unknown,
): { success: true; value: GeneratedDistillationReviewItem } | { success: false; error: Error } {
  if (!isRecord(value)) return invalidGeneratedItem('item must be an object');
  if (value.type === 'overview') {
    const content = trimmedStringField(value.content);
    const stance = reviewStance(value.stance);
    if (!content) return invalidGeneratedItem('overview.content is required');
    if (!stance) return invalidGeneratedItem('overview.stance is invalid');
    return { success: true, value: { type: 'overview', stance, content } };
  }
  if (value.type === 'finding') {
    const title = trimmedStringField(value.title);
    const content = trimmedStringField(value.content);
    const category = reviewFindingCategory(value.category);
    const severity = reviewFindingSeverity(value.severity);
    if (!title) return invalidGeneratedItem('finding.title is required');
    if (!content) return invalidGeneratedItem('finding.content is required');
    if (!category) return invalidGeneratedItem('finding.category is invalid');
    if (!severity) return invalidGeneratedItem('finding.severity is invalid');
    return {
      success: true,
      value: {
        type: 'finding',
        category,
        severity,
        title,
        content,
        draftTargetText: trimmedStringField(value.draftTargetText) || undefined,
      },
    };
  }
  if (value.type === 'proposal') {
    const kind = proposalKind(value.kind);
    const title = trimmedStringField(value.title);
    const content = trimmedStringField(value.content);
    const targetText = trimmedStringField(value.targetText);
    const replacementText = trimmedStringField(value.replacementText);
    if (!kind) return invalidGeneratedItem('proposal.kind is invalid');
    if (!title) return invalidGeneratedItem('proposal.title is required');
    if (!validProposalFields(kind, content, targetText, replacementText)) {
      return invalidGeneratedItem('proposal fields do not match kind');
    }
    return {
      success: true,
      value: {
        type: 'proposal',
        kind,
        title,
        rationale: trimmedStringField(value.rationale) || undefined,
        insertAfterText: trimmedStringField(value.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
      },
    };
  }
  return invalidGeneratedItem('item.type is invalid');
}

function invalidGeneratedItem(message: string) {
  return {
    success: false as const,
    error: new Error(`Invalid distillation review item: ${message}`),
  };
}

function reviewStance(value: unknown): AnnotationDistillationReviewStance | null {
  return value === 'solid' || value === 'weak' || value === 'mixed' ? value : null;
}

function reviewFindingCategory(value: unknown): AnnotationDistillationReviewFindingCategory | null {
  if (
    value === 'evidence' ||
    value === 'logic' ||
    value === 'coverage' ||
    value === 'clarity' ||
    value === 'actionability'
  ) {
    return value;
  }
  return null;
}

function reviewFindingSeverity(value: unknown): AnnotationDistillationReviewFindingSeverity | null {
  return value === 'low' || value === 'high' || value === 'medium' ? value : null;
}

function proposalKind(value: unknown): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function validProposalFields(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  replacementText: string,
) {
  if (kind === 'insert') return Boolean(content);
  if (kind === 'replace') return Boolean(targetText && replacementText);
  return Boolean(targetText);
}

function proposalTitle(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
) {
  const text = kind === 'insert' ? content : targetText;
  const preview = text.length > 18 ? `${text.slice(0, 18)}...` : text;
  if (kind === 'insert') return preview ? `新增：${preview}` : '新增内容';
  if (kind === 'replace') return preview ? `修改：${preview}` : '修改内容';
  return preview ? `删除：${preview}` : '删除内容';
}
