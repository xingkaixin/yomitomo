import type {
  AgentReadingIntent,
  Annotation,
  AnnotationAuthor,
  AnnotationDistillation,
  AnnotationDistillationProposal,
  AnnotationDistillationProposalKind,
  AnnotationDistillationProposalStatus,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  AnnotationDistillationStatus,
  AnnotationEvidenceSource,
  AnnotationType,
  AssistantRuntimeProgressStepStatus,
  AssistantRuntimeProgressSummary,
  Comment,
  PdfRect,
  PdfTextAnchor,
  TextAnchor,
} from '@yomitomo/shared';
import {
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeReviewOpinionLabel,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import {
  normalizeFiniteNumber,
  normalizeNonNegativeInteger,
  normalizePositiveNumber,
  recordValue,
  stringValue,
} from './store-normalizers-common';

export function rowToComment(row: typeof schema.comments.$inferSelect): Comment {
  return {
    id: row.id,
    author: normalizeAnnotationAuthor(row.author),
    content: row.content,
    createdAt: row.createdAt,
    replyTo: row.replyTo || undefined,
    agentId: row.agentId || undefined,
    agentUsername: row.agentUsername || undefined,
    agentNickname: row.agentNickname || undefined,
    agentAvatar: row.agentAvatar || undefined,
    agentAnnotationColor: row.agentAnnotationColor || undefined,
    readingIntent: normalizeAgentReadingIntent(row.readingIntent) || undefined,
    reviewLabel: normalizeReviewOpinionLabel(row.reviewLabel) || undefined,
    assistantProgress: normalizeAssistantRuntimeProgress(row.assistantProgress),
    userId: row.userId || undefined,
    userUsername: row.userUsername || undefined,
    userNickname: row.userNickname || undefined,
    userAvatar: row.userAvatar || undefined,
    userAnnotationColor: row.userAnnotationColor || undefined,
    pending: row.pending || undefined,
  };
}

export function rowToAnnotation(
  row: typeof schema.annotations.$inferSelect,
  comments: Comment[],
): Annotation {
  return {
    id: row.id,
    anchor: normalizeTextAnchor(row.anchor),
    author: normalizeAnnotationAuthor(row.author),
    annotationType: normalizeAnnotationType(row.annotationType) || undefined,
    readingIntent: normalizeAgentReadingIntent(row.readingIntent) || undefined,
    moveType: normalizeAnnotationMove(row.moveType) || undefined,
    whyHere: row.whyHere || undefined,
    evidenceUsed: normalizeAnnotationEvidenceUsed(row.evidenceUsed),
    confidence: normalizeAnnotationConfidence(row.confidence) || undefined,
    shouldShow: row.shouldShow ?? undefined,
    color: row.color,
    agentId: row.agentId || undefined,
    agentUsername: row.agentUsername || undefined,
    agentNickname: row.agentNickname || undefined,
    agentAvatar: row.agentAvatar || undefined,
    agentAnnotationColor: row.agentAnnotationColor || undefined,
    userId: row.userId || undefined,
    userUsername: row.userUsername || undefined,
    userNickname: row.userNickname || undefined,
    userAvatar: row.userAvatar || undefined,
    userAnnotationColor: row.userAnnotationColor || undefined,
    comments,
    distillation: normalizeAnnotationDistillation(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeAnnotationAuthor(value: unknown): AnnotationAuthor {
  return value === 'ai' ? 'ai' : 'user';
}

function normalizeAnnotationDistillation(
  row: typeof schema.annotations.$inferSelect,
): AnnotationDistillation | undefined {
  const status = normalizeAnnotationDistillationStatus(row.distillationStatus);
  if (!status && !row.distillationContent) return undefined;
  return {
    status: status || 'unpublished',
    content: row.distillationContent || '',
    publishedAt: row.distillationPublishedAt || undefined,
    updatedAt: row.distillationUpdatedAt || undefined,
    reviewSessions: normalizeAnnotationDistillationReviewSessions(row.distillationReviewSessions),
  };
}

function normalizeAnnotationDistillationStatus(
  value: unknown,
): AnnotationDistillationStatus | null {
  return value === 'published' || value === 'unpublished' ? value : null;
}

function normalizeAnnotationDistillationReviewSessions(
  value: unknown,
): AnnotationDistillationReviewSession[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sessions = value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const session = recordValue(item);
    const id = stringValue(session.id);
    const agentId = stringValue(session.agentId);
    if (!id || !agentId) return [];
    return [
      {
        id,
        agentId,
        agentUsername: stringValue(session.agentUsername) || undefined,
        agentNickname: stringValue(session.agentNickname) || undefined,
        agentAvatar: stringValue(session.agentAvatar) || undefined,
        messages: normalizeAnnotationDistillationReviewMessages(session.messages),
        createdAt: stringValue(session.createdAt),
        updatedAt: stringValue(session.updatedAt),
      },
    ];
  });
  return sessions.length > 0 ? sessions : undefined;
}

function normalizeAnnotationDistillationReviewMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const message = recordValue(item);
    const id = stringValue(message.id);
    const content = stringValue(message.content);
    const errorMessage = stringValue(message.errorMessage);
    if (!id || (!content && !errorMessage)) return [];
    return [
      {
        id,
        author: normalizeAnnotationAuthor(message.author),
        content,
        createdAt: stringValue(message.createdAt),
        status: normalizeAnnotationDistillationReviewMessageStatus(message.status) || undefined,
        errorMessage: errorMessage || undefined,
        agentId: stringValue(message.agentId) || undefined,
        agentUsername: stringValue(message.agentUsername) || undefined,
        agentNickname: stringValue(message.agentNickname) || undefined,
        agentAvatar: stringValue(message.agentAvatar) || undefined,
        assistantProgress: normalizeAssistantRuntimeProgress(message.assistantProgress),
        proposals: normalizeAnnotationDistillationProposals(message.proposals),
      },
    ];
  });
}

function normalizeAnnotationDistillationReviewMessageStatus(
  value: unknown,
): AnnotationDistillationReviewMessage['status'] | null {
  return value === 'pending' || value === 'done' || value === 'failed' ? value : null;
}

function normalizeAnnotationDistillationProposals(
  value: unknown,
): AnnotationDistillationProposal[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const proposal = recordValue(item);
    const id = stringValue(proposal.id);
    const kind = normalizeAnnotationDistillationProposalKind(proposal.kind);
    if (!id || !kind) return [];

    const content = stringValue(proposal.content);
    const targetText = stringValue(proposal.targetText);
    const replacementText = stringValue(proposal.replacementText);
    if (!validAnnotationDistillationProposalFields(kind, content, targetText, replacementText)) {
      return [];
    }

    return [
      {
        id,
        kind,
        status: normalizeAnnotationDistillationProposalStatus(proposal.status),
        title: stringValue(proposal.title) || proposalTitleFallback(kind, content, targetText),
        rationale: stringValue(proposal.rationale) || undefined,
        insertAfterText: stringValue(proposal.insertAfterText) || undefined,
        targetText: targetText || undefined,
        replacementText: kind === 'replace' ? replacementText : undefined,
        content: kind === 'insert' ? content : undefined,
        acceptedAt: stringValue(proposal.acceptedAt) || undefined,
        ignoredAt: stringValue(proposal.ignoredAt) || undefined,
        updatedAt: stringValue(proposal.updatedAt),
      },
    ];
  });
}

function normalizeAnnotationDistillationProposalKind(
  value: unknown,
): AnnotationDistillationProposalKind | null {
  return value === 'insert' || value === 'replace' || value === 'delete' ? value : null;
}

function normalizeAnnotationDistillationProposalStatus(
  value: unknown,
): AnnotationDistillationProposalStatus {
  return value === 'accepted' || value === 'ignored' || value === 'pending' ? value : 'pending';
}

function validAnnotationDistillationProposalFields(
  kind: AnnotationDistillationProposalKind,
  content: string,
  targetText: string,
  replacementText: string,
) {
  if (kind === 'insert') return Boolean(content);
  if (kind === 'replace') return Boolean(targetText && replacementText);
  return Boolean(targetText);
}

function proposalTitleFallback(
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

export function normalizeAssistantRuntimeProgress(
  value: unknown,
): AssistantRuntimeProgressSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = recordValue(value);
  const steps = Array.isArray(progress.steps)
    ? progress.steps.flatMap((item) => {
        if (!item || typeof item !== 'object') return [];
        const step = recordValue(item);
        const id = stringValue(step.id);
        const label = stringValue(step.label);
        const status = normalizeAssistantRuntimeProgressStepStatus(step.status);
        if (!id || !label || !status) return [];
        return [{ id, label, status }];
      })
    : [];
  const fallbackMessage = stringValue(progress.fallbackMessage);
  if (steps.length === 0 && !fallbackMessage) return undefined;
  return {
    steps,
    fallbackMessage: fallbackMessage || undefined,
  };
}

export function normalizeAssistantRuntimeProgressStepStatus(
  value: unknown,
): AssistantRuntimeProgressStepStatus | null {
  return value === 'active' || value === 'done' || value === 'failed' ? value : null;
}

export function normalizeTextAnchor(value: unknown): TextAnchor {
  const anchor = value && typeof value === 'object' ? recordValue(value) : {};
  const textAnchor: TextAnchor = {
    exact: stringValue(anchor.exact),
    prefix: stringValue(anchor.prefix),
    suffix: stringValue(anchor.suffix),
    start: normalizeNonNegativeInteger(anchor.start),
    end: normalizeNonNegativeInteger(anchor.end),
    paragraphId: stringValue(anchor.paragraphId) || undefined,
    chapterId: stringValue(anchor.chapterId) || undefined,
    segmentId: stringValue(anchor.segmentId) || undefined,
    textStartInParagraph:
      anchor.textStartInParagraph === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textStartInParagraph),
    textEndInParagraph:
      anchor.textEndInParagraph === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textEndInParagraph),
    textStartInBook:
      anchor.textStartInBook === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textStartInBook),
    textEndInBook:
      anchor.textEndInBook === undefined
        ? undefined
        : normalizeNonNegativeInteger(anchor.textEndInBook),
    quoteHash: stringValue(anchor.quoteHash) || undefined,
  };
  if (anchor.kind !== 'pdf-text') return textAnchor;

  const pdfAnchor: PdfTextAnchor = {
    ...textAnchor,
    kind: 'pdf-text',
    pageIndex: normalizeNonNegativeInteger(anchor.pageIndex),
    pageWidth: normalizePositiveNumber(anchor.pageWidth),
    pageHeight: normalizePositiveNumber(anchor.pageHeight),
    rects: normalizePdfRects(anchor.rects),
  };
  return pdfAnchor;
}

function normalizePdfRects(value: unknown): PdfRect[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const rect = recordValue(item);
    return [
      {
        x: normalizeFiniteNumber(rect.x),
        y: normalizeFiniteNumber(rect.y),
        width: normalizeFiniteNumber(rect.width),
        height: normalizeFiniteNumber(rect.height),
      },
    ];
  });
}

function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === 'key_point' ||
    value === 'assumption' ||
    value === 'concept' ||
    value === 'question' ||
    value === 'quote'
    ? value
    : null;
}

function normalizeAnnotationEvidenceUsed(value: unknown): AnnotationEvidenceSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value
    .map((item) => normalizeAnnotationEvidenceSource(item))
    .filter((item): item is AnnotationEvidenceSource => Boolean(item));
  return sources.length > 0 ? Array.from(new Set(sources)) : undefined;
}

function normalizeAgentReadingIntent(value: unknown): AgentReadingIntent | null {
  return value === 'explain' ||
    value === 'decompose' ||
    value === 'challenge' ||
    value === 'question' ||
    value === 'connect'
    ? value
    : null;
}
