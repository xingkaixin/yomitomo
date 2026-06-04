import type { TextAnchor } from '@yomitomo/shared';
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
  const type = stringField(value.type);
  const evidenceIds = evidenceIdArray(value);
  if (!evidenceIds) return { ok: false, reason: 'invalid_evidence_ids' };
  const unknownEvidenceId = evidenceIds.find((id) => !context.evidenceIds.has(id));
  if (unknownEvidenceId) return { ok: false, reason: `unknown_evidence:${unknownEvidenceId}` };
  const confidence = numberField(value.confidence);
  if (confidence === undefined || confidence < 0 || confidence > 1) {
    return { ok: false, reason: 'invalid_confidence' };
  }
  const reason = stringField(value.reason);
  if (!reason) return { ok: false, reason: 'missing_reason' };

  if (type === 'reply_to_thread') {
    const annotationId = stringField(value.annotationId);
    const content = stringField(value.content);
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
    const thought = stringField(value.thought);
    if (!thought) return { ok: false, reason: 'missing_thought' };
    return {
      ok: true,
      action: { type, anchor, thought, evidenceIds, confidence, reason },
    };
  }

  if (type === 'create_thread_thought') {
    const annotationId = stringField(value.annotationId);
    const thought = stringField(value.thought);
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
    const annotationId = stringField(value.annotationId);
    const content = stringField(value.content);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!content) return { ok: false, reason: 'missing_review_content' };
    return {
      ok: true,
      action: { type, annotationId, content, evidenceIds, confidence, reason },
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
  const start = numberField(value.start);
  const end = numberField(value.end);
  return (
    typeof value.exact === 'string' &&
    typeof value.prefix === 'string' &&
    typeof value.suffix === 'string' &&
    start !== undefined &&
    end !== undefined &&
    start <= end
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
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

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
