import type {
  AgentAnnotatePayload,
  AgentMessagePayload,
  Annotation,
  TextRange,
} from '@yomitomo/shared';
import { locateEpubTextAnchor, rangeDistance } from '@yomitomo/core';

export const epubEvaluationBookTypes = [
  'fiction',
  'social_business',
  'theory',
  'technical',
] as const;

export const epubEvaluationChapterLengths = ['short', 'medium', 'ultra_long'] as const;

export const epubEvaluationTaskTypes = [
  'selection_annotation',
  'selection_thread_reply',
  'segment_annotation',
] as const;

export const epubEvaluationControlGroups = [
  'selection_only',
  'full_text_truncated',
  'structured_context',
] as const;

export const epubEvaluationFailureLabels = [
  'context_insufficient',
  'summary_drift',
  'trace_pollution',
  'retrieval_missing',
  'selection_mispoint',
  'persona_homogenization',
  'anchor_failure',
] as const;

export type EpubEvaluationBookType = (typeof epubEvaluationBookTypes)[number];
export type EpubEvaluationChapterLength = (typeof epubEvaluationChapterLengths)[number];
export type EpubEvaluationTaskType = (typeof epubEvaluationTaskTypes)[number];
export type EpubEvaluationControlGroup = (typeof epubEvaluationControlGroups)[number];
export type EpubEvaluationFailureLabel = (typeof epubEvaluationFailureLabels)[number];

export type EpubEvaluationManualScores = Partial<{
  contextAwareness: number;
  textualGrounding: number;
  annotationValue: number;
  noiseControl: number;
  personaDistinctiveness: number;
}>;

export type EpubEvaluationTaskInput =
  | {
      taskType: 'selection_annotation';
      payload: AgentAnnotatePayload;
    }
  | {
      taskType: 'selection_thread_reply';
      payload: AgentMessagePayload;
    }
  | {
      taskType: 'segment_annotation';
      payload: AgentAnnotatePayload;
    };

export type EpubEvaluationExpectation = {
  acceptableAnchorExacts?: string[];
  requiredEvidence?: string[];
  metricRange?: TextRange;
  segmentIds?: string[];
  p1MayFail?: boolean;
  retrievalTriggerLabels?: EpubEvaluationFailureLabel[];
};

export type EpubEvaluationCase = {
  id: string;
  title: string;
  description: string;
  bookType: EpubEvaluationBookType;
  chapterLength: EpubEvaluationChapterLength;
  controls: EpubEvaluationControlGroup[];
  input: EpubEvaluationTaskInput;
  densityLimitPer1000Chars?: number;
  expected: EpubEvaluationExpectation;
  allowedFailureLabels: EpubEvaluationFailureLabel[];
};

export type EpubEvaluationUsage = Partial<{
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}>;

export type EpubEvaluationToolLoopDecision = {
  status: 'final' | 'fallback' | 'kept_without_runtime';
  actionType?: string;
  failureReason?: string;
};

export type EpubEvaluationSegmentOutput = {
  segmentId: string;
  annotations: Annotation[];
  toolLoopDecisions?: EpubEvaluationToolLoopDecision[];
};

export type EpubEvaluationRun = {
  caseId: string;
  controlGroup: EpubEvaluationControlGroup;
  annotations?: Annotation[];
  segmentOutputs?: EpubEvaluationSegmentOutput[];
  toolLoopDecisions?: EpubEvaluationToolLoopDecision[];
  replyText?: string;
  manualScores?: EpubEvaluationManualScores;
  failureLabels?: EpubEvaluationFailureLabel[];
  latencyMs?: number;
  usage?: EpubEvaluationUsage;
};

export type EpubEvaluationMetrics = {
  annotationCount: number;
  anchorHitRate: number | null;
  duplicateAnnotationRate: number | null;
  annotationsPer1000Chars: number;
  emptySegmentRate: number | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  toolLoopDecisionCount: number;
  toolLoopFilteredRate: number | null;
  toolLoopFallbackRate: number | null;
};

export type EpubEvaluationCaseResult = {
  case: EpubEvaluationCase;
  run: EpubEvaluationRun;
  metrics: EpubEvaluationMetrics;
  failureLabels: EpubEvaluationFailureLabel[];
};

export type EpubEvaluationControlSummary = {
  controlGroup: EpubEvaluationControlGroup;
  runCount: number;
  anchorHitRate: number | null;
  duplicateAnnotationRate: number | null;
  annotationsPer1000Chars: number | null;
  emptySegmentRate: number | null;
  selectionContextScore: number | null;
  threadGroundingScore: number | null;
  manualScoreAverage: number | null;
  averageLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  toolLoopFilteredRate: number | null;
  toolLoopFallbackRate: number | null;
  failureCounts: Partial<Record<EpubEvaluationFailureLabel, number>>;
};

export type EpubEvaluationReport = {
  caseResults: EpubEvaluationCaseResult[];
  controlSummaries: EpubEvaluationControlSummary[];
};

export type EpubPhaseOneCriteria = {
  anchorHitRateMin: number;
  duplicateAnnotationRateMax: number;
  segmentEmptyRateMin: number;
  segmentEmptyRateMax: number;
};

export type EpubPhaseOneCheck = {
  id: string;
  passed: boolean;
  actual: number | null;
  expected: string;
};

export const epubPhaseOneCriteria: EpubPhaseOneCriteria = {
  anchorHitRateMin: 0.98,
  duplicateAnnotationRateMax: 0.15,
  segmentEmptyRateMin: 0.2,
  segmentEmptyRateMax: 0.6,
};

export function evaluateEpubRun(
  evaluationCase: EpubEvaluationCase,
  run: EpubEvaluationRun,
): EpubEvaluationMetrics {
  const annotations = visibleAnnotations(runAnnotations(run));
  const textLength = metricTextLength(evaluationCase);
  const toolLoopDecisions = runToolLoopDecisions(run);
  const hitCount = annotations.filter((annotation) =>
    annotationAnchorResolves(evaluationCase, annotation),
  ).length;
  const segmentIds = evaluationSegmentIds(evaluationCase);

  return {
    annotationCount: annotations.length,
    anchorHitRate: annotations.length > 0 ? hitCount / annotations.length : null,
    duplicateAnnotationRate:
      annotations.length > 1 ? duplicateAnnotationRate(evaluationCase, annotations) : 0,
    annotationsPer1000Chars: (annotations.length / Math.max(1, textLength)) * 1000,
    emptySegmentRate:
      segmentIds.length > 0 ? emptySegmentRate(evaluationCase, run, segmentIds) : null,
    latencyMs: numericValue(run.latencyMs),
    inputTokens: numericValue(run.usage?.inputTokens),
    outputTokens: numericValue(run.usage?.outputTokens),
    costUsd: numericValue(run.usage?.costUsd),
    toolLoopDecisionCount: toolLoopDecisions.length,
    toolLoopFilteredRate:
      toolLoopDecisions.length > 0
        ? toolLoopDecisions.filter((decision) => decision.actionType === 'no_action').length /
          toolLoopDecisions.length
        : null,
    toolLoopFallbackRate:
      toolLoopDecisions.length > 0
        ? toolLoopDecisions.filter((decision) => decision.status === 'fallback').length /
          toolLoopDecisions.length
        : null,
  };
}

export function aggregateEpubEvaluation(
  cases: EpubEvaluationCase[],
  runs: EpubEvaluationRun[],
): EpubEvaluationReport {
  const casesById = new Map(cases.map((item) => [item.id, item]));
  const caseResults = runs.map((run) => {
    const evaluationCase = casesById.get(run.caseId);
    if (!evaluationCase) throw new Error(`Unknown EPUB evaluation case: ${run.caseId}`);
    const metrics = evaluateEpubRun(evaluationCase, run);
    return {
      case: evaluationCase,
      run,
      metrics,
      failureLabels: evaluationFailureLabels(evaluationCase, run, metrics),
    };
  });

  return {
    caseResults,
    controlSummaries: epubEvaluationControlGroups.map((controlGroup) =>
      summarizeControlGroup(
        controlGroup,
        caseResults.filter((result) => result.run.controlGroup === controlGroup),
      ),
    ),
  };
}

export function evaluateEpubPhaseOne(
  report: EpubEvaluationReport,
  criteria: EpubPhaseOneCriteria = epubPhaseOneCriteria,
) {
  const structured = controlSummary(report, 'structured_context');
  const selectionOnly = controlSummary(report, 'selection_only');
  const fullTextTruncated = controlSummary(report, 'full_text_truncated');
  const densityPassed = report.caseResults
    .filter((result) => result.run.controlGroup === 'structured_context')
    .every((result) => {
      const limit = result.case.densityLimitPer1000Chars;
      return limit === undefined || result.metrics.annotationsPer1000Chars <= limit;
    });
  const densityActual = maxNumber(
    report.caseResults
      .filter((result) => result.run.controlGroup === 'structured_context')
      .map((result) => result.metrics.annotationsPer1000Chars),
  );
  const checks: EpubPhaseOneCheck[] = [
    {
      id: 'anchor_hit_rate',
      passed:
        structured.anchorHitRate !== null && structured.anchorHitRate >= criteria.anchorHitRateMin,
      actual: structured.anchorHitRate,
      expected: `>= ${criteria.anchorHitRateMin}`,
    },
    {
      id: 'duplicate_annotation_rate',
      passed:
        structured.duplicateAnnotationRate !== null &&
        structured.duplicateAnnotationRate <= criteria.duplicateAnnotationRateMax,
      actual: structured.duplicateAnnotationRate,
      expected: `<= ${criteria.duplicateAnnotationRateMax}`,
    },
    {
      id: 'average_annotations_per_1000_chars',
      passed: densityPassed,
      actual: densityActual,
      expected: '<= case densityLimitPer1000Chars',
    },
    {
      id: 'selection_context_score',
      passed:
        structured.selectionContextScore !== null &&
        selectionOnly.selectionContextScore !== null &&
        structured.selectionContextScore > selectionOnly.selectionContextScore,
      actual: structured.selectionContextScore,
      expected: '> selection_only baseline',
    },
    {
      id: 'thread_grounding_score',
      passed:
        structured.threadGroundingScore !== null &&
        fullTextTruncated.threadGroundingScore !== null &&
        structured.threadGroundingScore > fullTextTruncated.threadGroundingScore,
      actual: structured.threadGroundingScore,
      expected: '> full_text_truncated baseline',
    },
    {
      id: 'segment_empty_allowed_rate',
      passed:
        structured.emptySegmentRate !== null &&
        structured.emptySegmentRate >= criteria.segmentEmptyRateMin &&
        structured.emptySegmentRate <= criteria.segmentEmptyRateMax,
      actual: structured.emptySegmentRate,
      expected: `${criteria.segmentEmptyRateMin} - ${criteria.segmentEmptyRateMax}`,
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}

function summarizeControlGroup(
  controlGroup: EpubEvaluationControlGroup,
  results: EpubEvaluationCaseResult[],
): EpubEvaluationControlSummary {
  const failureCounts: Partial<Record<EpubEvaluationFailureLabel, number>> = {};
  for (const result of results) {
    for (const label of result.failureLabels) {
      failureCounts[label] = (failureCounts[label] || 0) + 1;
    }
  }

  return {
    controlGroup,
    runCount: results.length,
    anchorHitRate: averageNullable(results.map((result) => result.metrics.anchorHitRate)),
    duplicateAnnotationRate: averageNullable(
      results.map((result) => result.metrics.duplicateAnnotationRate),
    ),
    annotationsPer1000Chars: averageNullable(
      results.map((result) => result.metrics.annotationsPer1000Chars),
    ),
    emptySegmentRate: averageNullable(results.map((result) => result.metrics.emptySegmentRate)),
    selectionContextScore: averageNullable(
      results
        .filter((result) => result.case.input.taskType === 'selection_annotation')
        .map((result) => result.run.manualScores?.contextAwareness),
    ),
    threadGroundingScore: averageNullable(
      results
        .filter((result) => result.case.input.taskType === 'selection_thread_reply')
        .map((result) => result.run.manualScores?.textualGrounding),
    ),
    manualScoreAverage: averageNullable(
      results.flatMap((result) => Object.values(result.run.manualScores || {})),
    ),
    averageLatencyMs: averageNullable(results.map((result) => result.metrics.latencyMs)),
    totalInputTokens: sumNumbers(results.map((result) => result.metrics.inputTokens)),
    totalOutputTokens: sumNumbers(results.map((result) => result.metrics.outputTokens)),
    totalCostUsd: sumNumbers(results.map((result) => result.metrics.costUsd)),
    toolLoopFilteredRate: averageNullable(
      results.map((result) => result.metrics.toolLoopFilteredRate),
    ),
    toolLoopFallbackRate: averageNullable(
      results.map((result) => result.metrics.toolLoopFallbackRate),
    ),
    failureCounts,
  };
}

function evaluationFailureLabels(
  evaluationCase: EpubEvaluationCase,
  run: EpubEvaluationRun,
  metrics: EpubEvaluationMetrics,
) {
  const labels = new Set<EpubEvaluationFailureLabel>(run.failureLabels || []);
  if (
    metrics.anchorHitRate !== null &&
    metrics.anchorHitRate < epubPhaseOneCriteria.anchorHitRateMin
  ) {
    labels.add('anchor_failure');
  }
  if (
    evaluationCase.input.taskType === 'selection_annotation' &&
    selectionMispointed(evaluationCase, run)
  ) {
    labels.add('selection_mispoint');
  }
  if (
    numericValue(run.manualScores?.personaDistinctiveness) !== null &&
    Number(run.manualScores?.personaDistinctiveness) <= 2
  ) {
    labels.add('persona_homogenization');
  }
  return Array.from(labels);
}

function selectionMispointed(evaluationCase: EpubEvaluationCase, run: EpubEvaluationRun) {
  if (evaluationCase.input.taskType !== 'selection_annotation') return false;
  const targetExact = normalizeText(evaluationCase.input.payload.targetAnchor?.exact || '');
  if (!targetExact) return false;
  return visibleAnnotations(runAnnotations(run)).some(
    (annotation) => normalizeText(annotation.anchor.exact) !== targetExact,
  );
}

function controlSummary(report: EpubEvaluationReport, controlGroup: EpubEvaluationControlGroup) {
  return (
    report.controlSummaries.find((summary) => summary.controlGroup === controlGroup) ||
    summarizeControlGroup(controlGroup, [])
  );
}

function runAnnotations(run: EpubEvaluationRun) {
  return run.segmentOutputs?.flatMap((segment) => segment.annotations) || run.annotations || [];
}

function runToolLoopDecisions(run: EpubEvaluationRun) {
  return (
    run.toolLoopDecisions ||
    run.segmentOutputs?.flatMap((segment) => segment.toolLoopDecisions || []) ||
    []
  );
}

function visibleAnnotations(annotations: Annotation[]) {
  return annotations.filter((annotation) => annotation.shouldShow !== false);
}

function annotationAnchorResolves(evaluationCase: EpubEvaluationCase, annotation: Annotation) {
  const article = caseArticle(evaluationCase);
  const index = article.ebookIndex;
  if (!index) {
    return (
      Number.isInteger(annotation.anchor.start) &&
      Number.isInteger(annotation.anchor.end) &&
      normalizeText(article.text.slice(annotation.anchor.start, annotation.anchor.end)) ===
        normalizeText(annotation.anchor.exact)
    );
  }

  const location = locateEpubTextAnchor(index, article.text, annotation.anchor);
  if (!location) return false;
  return (
    normalizeText(article.text.slice(location.textStart, location.textEnd)) ===
    normalizeText(annotation.anchor.exact)
  );
}

function duplicateAnnotationRate(evaluationCase: EpubEvaluationCase, annotations: Annotation[]) {
  const duplicateIndexes = new Set<number>();
  for (let leftIndex = 0; leftIndex < annotations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < annotations.length; rightIndex += 1) {
      if (annotationsDuplicate(evaluationCase, annotations[leftIndex], annotations[rightIndex])) {
        duplicateIndexes.add(rightIndex);
      }
    }
  }
  return duplicateIndexes.size / annotations.length;
}

function annotationsDuplicate(
  evaluationCase: EpubEvaluationCase,
  left: Annotation,
  right: Annotation,
) {
  const sameExact = normalizeText(left.anchor.exact) === normalizeText(right.anchor.exact);
  const sameSegment =
    left.anchor.segmentId &&
    right.anchor.segmentId &&
    left.anchor.segmentId === right.anchor.segmentId;
  const sameChapter =
    left.anchor.chapterId &&
    right.anchor.chapterId &&
    left.anchor.chapterId === right.anchor.chapterId;
  const leftRange = annotationTextRange(evaluationCase, left);
  const rightRange = annotationTextRange(evaluationCase, right);
  const distance =
    leftRange && rightRange ? rangeDistance(leftRange, rightRange) : Number.POSITIVE_INFINITY;

  if (sameExact && (sameSegment || sameChapter || distance <= 2400)) return true;
  return Boolean(left.moveType && left.moveType === right.moveType && distance <= 240);
}

function annotationTextRange(
  evaluationCase: EpubEvaluationCase,
  annotation: Annotation,
): TextRange | null {
  const article = caseArticle(evaluationCase);
  const index = article.ebookIndex;
  if (index) {
    const location = locateEpubTextAnchor(index, article.text, annotation.anchor);
    return location ? { textStart: location.textStart, textEnd: location.textEnd } : null;
  }
  if (
    Number.isInteger(annotation.anchor.start) &&
    Number.isInteger(annotation.anchor.end) &&
    annotation.anchor.end > annotation.anchor.start
  ) {
    return { textStart: annotation.anchor.start, textEnd: annotation.anchor.end };
  }
  return null;
}

function emptySegmentRate(
  evaluationCase: EpubEvaluationCase,
  run: EpubEvaluationRun,
  segmentIds: string[],
) {
  const expected = new Set(segmentIds);
  const nonEmpty = new Set<string>();
  if (run.segmentOutputs) {
    for (const segment of run.segmentOutputs) {
      const anchoredAnnotations = visibleAnnotations(segment.annotations).filter((annotation) =>
        annotationAnchorResolves(evaluationCase, annotation),
      );
      if (expected.has(segment.segmentId) && anchoredAnnotations.length > 0) {
        nonEmpty.add(segment.segmentId);
      }
    }
  } else {
    for (const annotation of visibleAnnotations(runAnnotations(run))) {
      const segmentId =
        annotation.anchor.segmentId || annotationTextLocationSegmentId(evaluationCase, annotation);
      if (segmentId && expected.has(segmentId)) nonEmpty.add(segmentId);
    }
  }
  return (segmentIds.length - nonEmpty.size) / segmentIds.length;
}

function annotationTextLocationSegmentId(
  evaluationCase: EpubEvaluationCase,
  annotation: Annotation,
) {
  const article = caseArticle(evaluationCase);
  const index = article.ebookIndex;
  if (!index) return undefined;
  return locateEpubTextAnchor(index, article.text, annotation.anchor)?.segment.id;
}

function evaluationSegmentIds(evaluationCase: EpubEvaluationCase) {
  if (evaluationCase.expected.segmentIds?.length) return evaluationCase.expected.segmentIds;
  if (evaluationCase.input.taskType !== 'segment_annotation') return [];

  const index = evaluationCase.input.payload.article.ebookIndex;
  const readingPlan = evaluationCase.input.payload.readingPlan || [];
  if (!index || readingPlan.length === 0) return [];

  return uniqueStrings(
    readingPlan.flatMap((plan) =>
      index.segments
        .filter(
          (segment) => segment.textStart < plan.sectionEnd && segment.textEnd > plan.sectionStart,
        )
        .map((segment) => segment.id),
    ),
  );
}

function metricTextLength(evaluationCase: EpubEvaluationCase) {
  const metricRange = evaluationCase.expected.metricRange;
  if (metricRange) return Math.max(1, metricRange.textEnd - metricRange.textStart);
  if (
    evaluationCase.input.taskType === 'segment_annotation' ||
    evaluationCase.input.taskType === 'selection_annotation'
  ) {
    const planLength = (evaluationCase.input.payload.readingPlan || []).reduce(
      (sum, item) => sum + Math.max(0, item.sectionEnd - item.sectionStart),
      0,
    );
    if (planLength > 0) return planLength;
    const targetAnchor = evaluationCase.input.payload.targetAnchor;
    if (targetAnchor) return Math.max(1, targetAnchor.exact.length);
  }
  return Math.max(1, caseArticle(evaluationCase).text.length);
}

function caseArticle(evaluationCase: EpubEvaluationCase) {
  return evaluationCase.input.payload.article;
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function averageNullable(values: Array<number | null | undefined>) {
  const numbers = finiteNumbers(values);
  if (numbers.length === 0) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function sumNumbers(values: Array<number | null | undefined>) {
  return finiteNumbers(values).reduce((sum, value) => sum + value, 0);
}

function maxNumber(values: Array<number | null | undefined>) {
  const numbers = finiteNumbers(values);
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function finiteNumbers(values: Array<number | null | undefined>) {
  const numbers: number[] = [];
  for (const value of values) {
    const number = numericValue(value);
    if (number !== null) numbers.push(number);
  }
  return numbers;
}
