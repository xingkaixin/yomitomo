import type { AnnotationEvidenceSource } from '@yomitomo/shared';
import {
  normalizeAgentReadingIntent,
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
  normalizeAnnotationType,
} from '@yomitomo/shared';
import type { AnnotationSuggestion } from './annotation-generation-types';

export function parseAnnotationSuggestions(content: string): AnnotationSuggestion[] {
  return parseAnnotationSuggestionInputs(content)
    .map(normalizeAnnotationSuggestion)
    .filter((item): item is AnnotationSuggestion => item !== null);
}

export function parseAnnotationSuggestionInputs(content: string): unknown[] {
  const json = content.match(/\[[\s\S]*\]/)?.[0] || content;
  const parsed: unknown = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [];
}

export function normalizeAnnotationSuggestion(input: unknown): AnnotationSuggestion | null {
  if (!isAnnotationSuggestionInput(input)) return null;
  const exact = typeof input.exact === 'string' ? input.exact : '';
  if (!exact.trim()) return null;

  const suggestion: AnnotationSuggestion = {
    exact,
    prefix: typeof input.prefix === 'string' ? input.prefix : undefined,
    suffix: typeof input.suffix === 'string' ? input.suffix : undefined,
    context: typeof input.context === 'string' ? input.context : undefined,
    comment: typeof input.comment === 'string' ? input.comment : '',
    annotationType: normalizeAnnotationType(input.type),
    readingIntent: normalizeAgentReadingIntent(input.readingIntent),
  };
  const moveType = normalizeAnnotationMove(input.moveType);
  const evidenceUsed = normalizeAnnotationEvidenceUsed(input.evidenceUsed);
  const confidence = normalizeAnnotationConfidence(input.confidence);
  if (moveType) suggestion.moveType = moveType;
  if (typeof input.whyHere === 'string') suggestion.whyHere = input.whyHere;
  if (evidenceUsed) suggestion.evidenceUsed = evidenceUsed;
  if (confidence) suggestion.confidence = confidence;
  if (typeof input.shouldShow === 'boolean') suggestion.shouldShow = input.shouldShow;
  return suggestion;
}

function isAnnotationSuggestionInput(value: unknown): value is {
  exact?: unknown;
  prefix?: unknown;
  suffix?: unknown;
  context?: unknown;
  comment?: unknown;
  type?: unknown;
  readingIntent?: unknown;
  moveType?: unknown;
  whyHere?: unknown;
  evidenceUsed?: unknown;
  confidence?: unknown;
  shouldShow?: unknown;
} {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeAnnotationEvidenceUsed(value: unknown): AnnotationEvidenceSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value
    .map((item) => normalizeAnnotationEvidenceSource(item))
    .filter((item): item is AnnotationEvidenceSource => Boolean(item));
  return sources.length > 0 ? Array.from(new Set(sources)) : undefined;
}
