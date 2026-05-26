import { describe, expect, it } from 'vitest';
import type { Annotation, TextAnchor } from '@yomitomo/shared';
import { createEpubTextAnchor } from '@yomitomo/core';
import {
  aggregateEpubEvaluation,
  epubEvaluationBookTypes,
  epubEvaluationChapterLengths,
  epubEvaluationControlGroups,
  epubEvaluationTaskTypes,
  evaluateEpubPhaseOne,
  evaluateEpubRun,
  type EpubEvaluationCase,
  type EpubEvaluationRun,
} from './evaluation';
import { epubEvaluationCases } from './evaluation-fixtures';

describe('epub evaluation fixtures', () => {
  it('covers the minimum RD-347 matrix', () => {
    expect(sortedUnique(epubEvaluationCases.map((item) => item.bookType))).toEqual(
      sorted(epubEvaluationBookTypes),
    );
    expect(sortedUnique(epubEvaluationCases.map((item) => item.chapterLength))).toEqual(
      sorted(epubEvaluationChapterLengths),
    );
    expect(sortedUnique(epubEvaluationCases.map((item) => item.input.taskType))).toEqual(
      sorted(epubEvaluationTaskTypes),
    );
    for (const evaluationCase of epubEvaluationCases) {
      expect(evaluationCase.controls).toEqual([...epubEvaluationControlGroups]);
    }

    const crossChapterCase = caseById('thread-cross-chapter-fiction-ultra');
    expect(crossChapterCase.expected.p1MayFail).toBe(true);
    expect(crossChapterCase.expected.retrievalTriggerLabels).toContain('retrieval_missing');
  });
});

describe('epub evaluation metrics', () => {
  it('measures anchor hits, duplicate annotations and empty segments', () => {
    const evaluationCase = caseById('segment-point-business-ultra');
    const segmentIds = evaluationCase.expected.segmentIds || [];
    const valid = annotationFromExact(evaluationCase, '第二个可批注点指出', 'annotation-1');
    const duplicate = {
      ...annotationFromExact(evaluationCase, '第二个可批注点指出', 'annotation-2'),
      moveType: 'explain_concept' as const,
    };
    const invalid = annotationFromAnchor('annotation-3', {
      exact: '不存在的锚点',
      prefix: '',
      suffix: '',
      start: 0,
      end: 6,
    });

    const metrics = evaluateEpubRun(evaluationCase, {
      caseId: evaluationCase.id,
      controlGroup: 'structured_context',
      segmentOutputs: [
        { segmentId: segmentIds[0]!, annotations: [] },
        {
          segmentId: segmentIds[1]!,
          annotations: [valid, duplicate],
          toolLoopDecisions: [
            { status: 'final', actionType: 'add_annotation' },
            { status: 'final', actionType: 'no_action' },
            { status: 'fallback', failureReason: 'provider_failed' },
          ],
        },
        { segmentId: segmentIds[2]!, annotations: [invalid] },
      ],
    });

    expect(metrics.annotationCount).toBe(3);
    expect(metrics.anchorHitRate).toBeCloseTo(2 / 3);
    expect(metrics.duplicateAnnotationRate).toBeCloseTo(1 / 3);
    expect(metrics.emptySegmentRate).toBeCloseTo(2 / 3);
    expect(metrics.annotationsPer1000Chars).toBeGreaterThan(0);
    expect(metrics.toolLoopDecisionCount).toBe(3);
    expect(metrics.toolLoopFilteredRate).toBeCloseTo(1 / 3);
    expect(metrics.toolLoopFallbackRate).toBeCloseTo(1 / 3);
  });

  it('aggregates control groups and evaluates phase-one gates', () => {
    const selectionCase = caseById('selection-local-fiction-short');
    const threadCase = caseById('thread-continuity-business-medium');
    const segmentCase = caseById('segment-point-business-ultra');
    const segmentIds = segmentCase.expected.segmentIds || [];
    const runs: EpubEvaluationRun[] = [
      {
        caseId: selectionCase.id,
        controlGroup: 'selection_only',
        annotations: [annotationFromExact(selectionCase, '渡桥的灯不是为了照亮路面', 'a-1')],
        manualScores: { contextAwareness: 2.5 },
      },
      {
        caseId: selectionCase.id,
        controlGroup: 'structured_context',
        annotations: [annotationFromExact(selectionCase, '渡桥的灯不是为了照亮路面', 'a-2')],
        manualScores: { contextAwareness: 4.5 },
        usage: { inputTokens: 900, outputTokens: 120, costUsd: 0.01 },
        latencyMs: 1200,
      },
      {
        caseId: threadCase.id,
        controlGroup: 'full_text_truncated',
        replyText: '这和选择压力有关。',
        manualScores: { textualGrounding: 3 },
      },
      {
        caseId: threadCase.id,
        controlGroup: 'structured_context',
        replyText: '前文把人口红利界定为供给优势，后文把压力落到机会取舍。',
        manualScores: { textualGrounding: 4.2 },
      },
      {
        caseId: segmentCase.id,
        controlGroup: 'structured_context',
        segmentOutputs: [
          {
            segmentId: segmentIds[0]!,
            annotations: [
              annotationFromExact(segmentCase, '规模优势不是护城河', 'a-3', 'challenge_argument'),
            ],
          },
          {
            segmentId: segmentIds[1]!,
            annotations: [
              annotationFromExact(segmentCase, '第二个可批注点指出', 'a-4', 'ask_question'),
            ],
            toolLoopDecisions: [
              { status: 'final', actionType: 'add_annotation' },
              { status: 'final', actionType: 'no_action' },
            ],
          },
          { segmentId: segmentIds[2]!, annotations: [] },
        ],
      },
    ];

    const report = aggregateEpubEvaluation(epubEvaluationCases, runs);
    const structured = report.controlSummaries.find(
      (summary) => summary.controlGroup === 'structured_context',
    );
    const phaseOne = evaluateEpubPhaseOne(report);

    expect(structured?.anchorHitRate).toBe(1);
    expect(structured?.selectionContextScore).toBe(4.5);
    expect(structured?.threadGroundingScore).toBe(4.2);
    expect(structured?.emptySegmentRate).toBeCloseTo(1 / 3);
    expect(structured?.toolLoopFilteredRate).toBeCloseTo(1 / 2);
    expect(structured?.toolLoopFallbackRate).toBe(0);
    expect(structured?.totalInputTokens).toBe(900);
    expect(phaseOne.passed).toBe(true);
  });
});

function caseById(id: string) {
  const evaluationCase = epubEvaluationCases.find((item) => item.id === id);
  if (!evaluationCase) throw new Error(`Missing evaluation case: ${id}`);
  return evaluationCase;
}

function annotationFromExact(
  evaluationCase: EpubEvaluationCase,
  exact: string,
  id: string,
  moveType: Annotation['moveType'] = 'explain_concept',
) {
  const article = evaluationCase.input.payload.article;
  const index = article.ebookIndex;
  if (!index) throw new Error('EPUB fixture should include an index');
  const start = article.text.indexOf(exact);
  if (start < 0) throw new Error(`Missing annotation exact: ${exact}`);
  return annotationFromAnchor(
    id,
    createEpubTextAnchor(index, article.text, start, start + exact.length),
    moveType,
  );
}

function annotationFromAnchor(
  id: string,
  anchor: TextAnchor,
  moveType: Annotation['moveType'] = 'explain_concept',
): Annotation {
  return {
    id,
    author: 'ai',
    anchor,
    annotationType: 'key_point',
    moveType,
    shouldShow: true,
    color: '#6fa48f',
    comments: [],
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z',
  };
}

function sorted(values: readonly string[]) {
  return values.toSorted();
}

function sortedUnique(values: string[]) {
  return sorted(values.filter((value, index, list) => list.indexOf(value) === index));
}
