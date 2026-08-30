import { isRecord } from '@yomitomo/shared';
import type {
  ReadingEvidence,
  ReadingEvidenceRelation,
  ReadingJudgmentClaim,
  ReadingJudgmentInput,
  ReadingJudgmentOutput,
} from '@yomitomo/shared';

const maximumTextLength = 8_192;
const maximumSectionItems = 12;
const claimSections = ['judgments', 'supporting', 'opposingOrLimiting', 'gaps'] as const;

export function validateReadingJudgment(
  kind: ReadingJudgmentInput['kind'],
  value: unknown,
  sent: ReadonlyMap<string, ReadingEvidence>,
  current: readonly ReadingEvidence[],
): ReadingJudgmentOutput | null {
  const currentById = new Map(current.map((evidence) => [evidence.id, evidence]));
  const validIds = new Map<string, string>();
  for (const [reference, evidence] of sent) {
    const latest = currentById.get(evidence.id);
    if (
      latest &&
      latest.sourceVersion === evidence.sourceVersion &&
      latest.source.ref.id === evidence.source.ref.id &&
      latest.location.annotationId === evidence.location.annotationId &&
      latest.location.commentId === evidence.location.commentId
    ) {
      validIds.set(reference, evidence.id);
    }
  }

  if (kind === 'library-answer') {
    if (!hasExactFields(value, claimSections)) return null;
    const citedJudgments = validateClaims(value.judgments, validIds, sent.size);
    const supporting = validateClaims(value.supporting, validIds, sent.size);
    const opposingOrLimiting = validateClaims(value.opposingOrLimiting, validIds, sent.size);
    const gaps = validateClaims(value.gaps, validIds, sent.size);
    if (!citedJudgments || !supporting || !opposingOrLimiting || !gaps) return null;
    const userJudgmentIds = new Set(
      [...sent.values()]
        .filter((evidence) => evidence.role === 'judgment' && evidence.authorKind === 'user')
        .map((evidence) => evidence.id),
    );
    const judgments = citedJudgments.filter((claim) =>
      claim.evidenceIds.some((id) => userJudgmentIds.has(id)),
    );
    if (judgments.length + supporting.length + opposingOrLimiting.length + gaps.length === 0) {
      return null;
    }
    return { kind, judgments, supporting, opposingOrLimiting, gaps };
  }

  if (kind !== 'reading-relations' && kind !== 'evidence-comparison') return null;
  if (!hasExactFields(value, ['relations']) || !isBoundedArray(value.relations)) return null;
  const referenceCounts = new Map<string, number>();
  // Invalid duplicate items must not choose which relation survives for the same evidence.
  for (const item of value.relations) {
    if (!isRecord(item) || typeof item.evidenceId !== 'string') continue;
    const evidence = sent.get(item.evidenceId);
    if (evidence) referenceCounts.set(evidence.id, (referenceCounts.get(evidence.id) ?? 0) + 1);
  }
  const relations: ReadingEvidenceRelation[] = [];
  for (const item of value.relations) {
    if (!hasExactFields(item, ['evidenceId', 'relation', 'explanation'])) continue;
    const evidenceId = typeof item.evidenceId === 'string' ? validIds.get(item.evidenceId) : null;
    const explanation = boundedText(item.explanation);
    if (!evidenceId || !explanation || referenceCounts.get(evidenceId) !== 1) continue;
    const relation = item.relation;
    if (relation !== 'same' && relation !== 'complementary' && relation !== 'opposite') continue;
    relations.push({ evidenceId, relation, explanation });
  }
  if (value.relations.length > 0 && relations.length === 0) return null;
  return { kind, relations };
}

function validateClaims(
  value: unknown,
  validIds: ReadonlyMap<string, string>,
  sentCount: number,
): ReadingJudgmentClaim[] | null {
  if (!isBoundedArray(value)) return null;
  return value.flatMap((item) => {
    if (!hasExactFields(item, ['text', 'evidenceIds'])) return [];
    const text = boundedText(item.text);
    if (
      !text ||
      !Array.isArray(item.evidenceIds) ||
      item.evidenceIds.length === 0 ||
      item.evidenceIds.length > sentCount
    ) {
      return [];
    }
    const evidenceIds: string[] = [];
    const seen = new Set<string>();
    for (const reference of item.evidenceIds) {
      const id = typeof reference === 'string' ? validIds.get(reference) : null;
      if (!id || seen.has(id)) return [];
      seen.add(id);
      evidenceIds.push(id);
    }
    return [{ text, evidenceIds }];
  });
}

function hasExactFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

function isBoundedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= maximumSectionItems;
}

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > maximumTextLength) return null;
  return value.trim() || null;
}
