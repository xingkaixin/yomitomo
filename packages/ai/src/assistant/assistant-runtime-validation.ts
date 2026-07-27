import type {
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationReviewFindingCategory,
  AnnotationDistillationReviewFindingSeverity,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewStance,
  TextAnchor,
} from '@yomitomo/shared';
import { finiteNumberField, isRecord, trimmedStringField } from '@yomitomo/shared';
import type { AssistantFinalAction } from './assistant-runtime-types';

export function validateAssistantFinalAction(
  value: unknown,
  context: {
    articleId: string;
    evidenceIds: Set<string>;
    allowedAnnotationIds?: string[];
    addAnnotationAnchor?: TextAnchor;
  },
): { ok: true; action: AssistantFinalAction } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'final_action_not_object' };
  const type = trimmedStringField(value.type);
  const evidenceIds = evidenceIdArray(value);
  if (!evidenceIds) return { ok: false, reason: 'invalid_evidence_ids' };
  const unknownEvidenceId = evidenceIds.find((id) => !context.evidenceIds.has(id));
  if (unknownEvidenceId) return { ok: false, reason: `unknown_evidence:${unknownEvidenceId}` };
  const confidence = finiteNumberField(value.confidence);
  if (confidence === undefined || confidence < 0 || confidence > 1) {
    return { ok: false, reason: 'invalid_confidence' };
  }
  const reason = trimmedStringField(value.reason);
  if (!reason) return { ok: false, reason: 'missing_reason' };

  if (type === 'reply_to_thread') {
    const annotationId = trimmedStringField(value.annotationId);
    const content = trimmedStringField(value.content);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!content) return { ok: false, reason: 'missing_reply_content' };
    return {
      ok: true,
      action: { type, annotationId, content, evidenceIds, confidence, reason },
    };
  }

  if (type === 'add_annotation') {
    const anchor = isTextAnchor(value.anchor) ? value.anchor : context.addAnnotationAnchor;
    if (!anchor) return { ok: false, reason: 'invalid_anchor' };
    const thought = trimmedStringField(value.thought);
    if (!thought) return { ok: false, reason: 'missing_thought' };
    return {
      ok: true,
      action: { type, anchor, thought, evidenceIds, confidence, reason },
    };
  }

  if (type === 'create_thread_thought') {
    const annotationId = trimmedStringField(value.annotationId);
    const thought = trimmedStringField(value.thought);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!thought) return { ok: false, reason: 'missing_thought' };
    return {
      ok: true,
      action: { type, annotationId, thought, evidenceIds, confidence, reason },
    };
  }

  if (type === 'review_distillation') {
    const annotationId = trimmedStringField(value.annotationId);
    const content = trimmedStringField(value.content);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!content) return { ok: false, reason: 'missing_review_content' };
    return {
      ok: true,
      action: {
        type,
        annotationId,
        content,
        items: reviewItemArray(value.items),
        proposals: proposalArray(value.proposals),
        evidenceIds,
        confidence,
        reason,
      },
    };
  }

  if (type === 'no_action') {
    if (
      hasWritableValue(value.content) ||
      hasWritableValue(value.thought) ||
      hasWritableValue(value.anchor) ||
      hasWritableValue(value.annotationId)
    ) {
      return { ok: false, reason: 'no_action_cannot_write' };
    }
    return {
      ok: true,
      action: { type, reason, evidenceIds, confidence },
    };
  }

  return { ok: false, reason: 'unknown_action_type' };
}

function isTextAnchor(value: unknown): value is TextAnchor {
  if (!isRecord(value)) return false;
  const start = finiteNumberField(value.start);
  const end = finiteNumberField(value.end);
  return (
    typeof value.exact === 'string' &&
    typeof value.prefix === 'string' &&
    typeof value.suffix === 'string' &&
    start !== undefined &&
    end !== undefined &&
    start <= end
  );
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

function proposalArray(value: unknown): AnnotationDistillationProposal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const kind = proposalKind(item.kind);
    if (!kind) return [];
    const content = trimmedStringField(item.content);
    const targetText = trimmedStringField(item.targetText);
    const replacementText = trimmedStringField(item.replacementText);
    if (!validProposalFields(kind, content, targetText, replacementText)) return [];
    return [
      {
        id: trimmedStringField(item.id) || `${kind}_${index + 1}`,
        kind,
        status: 'pending',
        title: trimmedStringField(item.title) || proposalTitle(kind, content, targetText),
        rationale: trimmedStringField(item.rationale) || undefined,
        insertAfterText: trimmedStringField(item.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
        sourceDraftHash: trimmedStringField(item.sourceDraftHash) || undefined,
        sourceReviewSessionId: trimmedStringField(item.sourceReviewSessionId) || undefined,
        sourceReviewMessageId: trimmedStringField(item.sourceReviewMessageId) || undefined,
        sourceAgentId: trimmedStringField(item.sourceAgentId) || undefined,
        updatedAt: trimmedStringField(item.updatedAt),
      },
    ];
  });
}

function proposalKind(value: unknown): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function reviewItemArray(value: unknown): AnnotationDistillationReviewItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap<AnnotationDistillationReviewItem>(
    (item): AnnotationDistillationReviewItem[] => {
      if (!isRecord(item)) return [];
      const id = trimmedStringField(item.id);
      if (!id) return [];
      if (item.type === 'overview') {
        const content = trimmedStringField(item.content);
        if (!content) return [];
        return [
          {
            id,
            type: 'overview' as const,
            stance: reviewStance(item.stance),
            content,
          },
        ];
      }
      if (item.type === 'finding') {
        const title = trimmedStringField(item.title);
        const content = trimmedStringField(item.content);
        if (!title || !content) return [];
        return [
          {
            id,
            type: 'finding' as const,
            category: reviewFindingCategory(item.category),
            severity: reviewFindingSeverity(item.severity),
            title,
            content,
            draftTargetText: trimmedStringField(item.draftTargetText) || undefined,
          },
        ];
      }
      if (item.type === 'proposal') {
        const proposal = proposalArray([item.proposal])[0];
        return proposal ? [{ id, type: 'proposal' as const, proposal }] : [];
      }
      return [];
    },
  );
}

function reviewStance(value: unknown): AnnotationDistillationReviewStance {
  return value === 'solid' || value === 'weak' || value === 'mixed' ? value : 'mixed';
}

function reviewFindingCategory(value: unknown): AnnotationDistillationReviewFindingCategory {
  if (
    value === 'evidence' ||
    value === 'logic' ||
    value === 'coverage' ||
    value === 'clarity' ||
    value === 'actionability'
  ) {
    return value;
  }
  return 'evidence';
}

function reviewFindingSeverity(value: unknown): AnnotationDistillationReviewFindingSeverity {
  return value === 'low' || value === 'high' || value === 'medium' ? value : 'medium';
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

function evidenceIdArray(value: Record<string, unknown>) {
  const raw = value.evidenceIds || value.evidence_ids || value.evidenceId || value.evidence_id;
  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  return stringArray(raw);
}

function hasWritableValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}
