import { describe, expect, it } from 'vitest';
import {
  semanticRetrievalLanguages,
  semanticRetrievalRelations,
  semanticRetrievalScenarios,
  type SemanticRetrievalScenario,
} from './semantic-retrieval-fixtures';
import {
  buildSemanticRetrievalCorpus,
  buildSemanticRetrievalQueries,
  evaluateSemanticRetrievalCandidateEligibility,
  evaluateSemanticRetrievalRankings,
  rankSemanticRetrievalCorpus,
  selectSemanticRetrievalCandidate,
  semanticRetrievalDirections,
  validateSemanticRetrievalCoverage,
  validateSemanticRetrievalScenarios,
  type SemanticRetrievalCandidateResult,
  type SemanticRetrievalEvaluationResult,
  type SemanticRetrievalQuery,
  type SemanticRetrievalRanking,
} from './semantic-retrieval-evaluation';

describe('semantic retrieval fixture structure', () => {
  it('derives a mixed corpus and relate/ask queries for all nine language directions', () => {
    validateSemanticRetrievalCoverage(semanticRetrievalScenarios, 20);
    const corpus = buildSemanticRetrievalCorpus(semanticRetrievalScenarios);
    const queries = buildSemanticRetrievalQueries(semanticRetrievalScenarios);

    expect(corpus).toHaveLength(
      semanticRetrievalScenarios.length * semanticRetrievalLanguages.length * 2,
    );
    expect(queries).toHaveLength(
      semanticRetrievalScenarios.length * semanticRetrievalLanguages.length * 2,
    );
    expect(unique(corpus.map((item) => item.id))).toHaveLength(corpus.length);
    expect(unique(corpus.map((item) => item.language))).toEqual(
      [...semanticRetrievalLanguages].toSorted(),
    );
    expect(unique(corpus.map((item) => item.grade))).toEqual(['hardNegative', 'necessary']);
    expect(unique(queries.map((query) => query.direction))).toEqual(
      [...semanticRetrievalDirections].toSorted(),
    );

    for (const direction of semanticRetrievalDirections) {
      const directionQueries = queries.filter((query) => query.direction === direction);
      expect(
        directionQueries.filter((query) => query.kind === 'relate').length,
      ).toBeGreaterThanOrEqual(20);
      expect(
        directionQueries.filter((query) => query.kind === 'ask').length,
      ).toBeGreaterThanOrEqual(20);
      expect(unique(directionQueries.map((query) => query.relation))).toEqual(
        [...semanticRetrievalRelations].toSorted(),
      );
    }
  });

  it('rejects unknown fields, incomplete language records and duplicate text', () => {
    const scenario = cloneScenario(semanticRetrievalScenarios[0]);
    expect(() => validateSemanticRetrievalScenarios([{ ...scenario, extra: true }])).toThrow(
      /contain exactly/,
    );

    const missingLanguage = cloneScenario(scenario) as unknown as {
      evidence: Record<string, unknown>;
    };
    delete missingLanguage.evidence.ja;
    expect(() => validateSemanticRetrievalScenarios([missingLanguage])).toThrow(/contain exactly/);

    const duplicateText = cloneScenario(scenario);
    duplicateText.evidence.en.necessary = duplicateText.evidence.zh.necessary;
    expect(() => validateSemanticRetrievalScenarios([duplicateText])).toThrow(/must be unique/);
  });

  it('rejects duplicate scenario ids and insufficient direction coverage', () => {
    const scenario = cloneScenario(semanticRetrievalScenarios[0]);
    expect(() => validateSemanticRetrievalScenarios([scenario, cloneScenario(scenario)])).toThrow(
      /must be unique/,
    );
    expect(() => validateSemanticRetrievalCoverage([scenario], 20)).toThrow(/needs at least 20/);
  });
});

describe('semantic retrieval cosine ranking', () => {
  it('sorts by cosine score and uses the id as a stable tie breaker', () => {
    expect(
      rankSemanticRetrievalCorpus(
        [2, 0],
        [
          { id: 'b', vector: [1, 0] },
          { id: 'c', vector: [0, 1] },
          { id: 'a', vector: [4, 0] },
        ],
        3,
      ),
    ).toEqual([
      { id: 'a', score: 1 },
      { id: 'b', score: 1 },
      { id: 'c', score: 0 },
    ]);
  });

  it('rejects invalid limits, duplicate ids, dimensions and vectors', () => {
    expect(() => rankSemanticRetrievalCorpus([1], [], -1)).toThrow(/limit/);
    expect(() =>
      rankSemanticRetrievalCorpus(
        [1],
        [
          { id: 'same', vector: [1] },
          { id: 'same', vector: [1] },
        ],
        2,
      ),
    ).toThrow(/unique/);
    expect(() => rankSemanticRetrievalCorpus([1], [{ id: 'wide', vector: [1, 0] }], 1)).toThrow(
      /dimension/,
    );
    expect(() => rankSemanticRetrievalCorpus([0], [], 0)).toThrow(/non-zero norm/);
    expect(() => rankSemanticRetrievalCorpus([Number.NaN], [], 0)).toThrow(/finite/);
  });
});

describe('semantic retrieval evaluation metrics', () => {
  it('reports perfect direction, relation and hard-negative metrics for ideal rankings', () => {
    const evaluationQueries = buildEvaluationQueries();
    const result = evaluateSemanticRetrievalRankings(
      evaluationQueries,
      idealRankings(evaluationQueries),
    );

    expect(result.directions).toHaveLength(9);
    for (const direction of result.directions) {
      expect(direction.relateHitAt3).toBe(1);
      expect(direction.askNecessaryCoverageAt12).toBe(1);
      expect(direction.necessaryBeforeHardNegativeRate).toBe(1);
      expect(direction.hardNegativeComparisonCount).toBe(direction.queryCount);
      for (const relation of semanticRetrievalRelations) {
        expect(direction.relations[relation].queryCount).toBeGreaterThan(0);
        expect(direction.relations[relation].hitAt3).toBe(1);
      }
    }
  });

  it('detects missed top-k evidence and hard negatives ranked before necessary evidence', () => {
    const evaluationQueries = buildEvaluationQueries();
    const targetDirection = semanticRetrievalDirections[0];
    const relate = evaluationQueries.find(
      (query) => query.direction === targetDirection && query.kind === 'relate',
    );
    const ask = evaluationQueries.find(
      (query) => query.direction === targetDirection && query.kind === 'ask',
    );
    if (!relate || !ask) throw new Error('Expected relate and ask fixtures');
    const rankings = idealRankings(evaluationQueries).map((ranking) => {
      if (ranking.queryId === relate.id || ranking.queryId === ask.id) {
        const query = ranking.queryId === relate.id ? relate : ask;
        return delayedNecessaryRanking(query);
      }
      return ranking;
    });
    const result = evaluateSemanticRetrievalRankings(evaluationQueries, rankings);
    const direction = result.directions.find((item) => item.direction === targetDirection);

    expect(direction?.relateHitAt3).toBeLessThan(1);
    expect(direction?.askNecessaryCoverageAt12).toBeLessThan(1);
    expect(direction?.necessaryBeforeHardNegativeRate).toBeLessThan(1);
    expect(direction?.relations[relate.relation].hitAt3).toBeLessThan(1);
  });

  it('requires exactly one sorted finite ranking for every known query', () => {
    const evaluationQueries = buildEvaluationQueries();
    const rankings = idealRankings(evaluationQueries);
    expect(() => evaluateSemanticRetrievalRankings(evaluationQueries, rankings.slice(1))).toThrow(
      /Missing/,
    );
    expect(() =>
      evaluateSemanticRetrievalRankings(evaluationQueries, [
        ...rankings,
        { queryId: 'unknown', results: [] },
      ]),
    ).toThrow(/Unknown/);
    expect(() =>
      evaluateSemanticRetrievalRankings(evaluationQueries, [
        { ...rankings[0], results: rankings[0].results.toReversed() },
        ...rankings.slice(1),
      ]),
    ).toThrow(/not sorted/);
    expect(() =>
      evaluateSemanticRetrievalRankings(evaluationQueries, [rankings[0], ...rankings]),
    ).toThrow(/Duplicate/);
  });
});

describe('semantic retrieval candidate selection', () => {
  it('excludes ineligible candidates, then minimizes download and peak memory', () => {
    const evaluation = perfectEvaluation();
    const tooSlow = candidate('small-but-slow', 80, 40, evaluation, { p95LatencyMs: 1_001 });
    const larger = candidate('larger', 100, 80, evaluation);
    const lessMemory = candidate('less-memory', 100, 60, evaluation);

    expect(evaluateSemanticRetrievalCandidateEligibility(tooSlow)).toMatchObject({
      eligible: false,
      failures: ['p95_latency'],
    });
    expect(selectSemanticRetrievalCandidate([larger, tooSlow, lessMemory])?.id).toBe('less-memory');
  });

  it('requires licenses, both platforms and every direction quality threshold', () => {
    const evaluation = perfectEvaluation();
    const firstDirection = evaluation.directions[0];
    const failedDirection = {
      ...evaluation,
      directions: [
        { ...firstDirection, relateHitAt3: 0.79, askNecessaryCoverageAt12: 0.89 },
        ...evaluation.directions.slice(1),
      ],
    };
    const result = evaluateSemanticRetrievalCandidateEligibility(
      candidate('ineligible', 100, 60, failedDirection, {
        commercialDistributionAllowed: false,
        localInferenceAllowed: false,
        loadedPlatforms: ['darwin-arm64'],
      }),
    );

    expect(result.eligible).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'commercial_distribution',
        'local_inference',
        'platform:win32-x64',
        `direction:${firstDirection.direction}:relate_hit_at_3`,
        `direction:${firstDirection.direction}:ask_coverage_at_12`,
      ]),
    );
  });

  it('rejects malformed candidate measurements and duplicate candidate ids', () => {
    const evaluation = perfectEvaluation();
    const valid = candidate('valid', 100, 60, evaluation);
    expect(() =>
      evaluateSemanticRetrievalCandidateEligibility({ ...valid, downloadBytes: -1 }),
    ).toThrow(/safe integer/);
    expect(() => selectSemanticRetrievalCandidate([valid, { ...valid }])).toThrow(/unique/);
  });
});

function idealRankings(queries: readonly SemanticRetrievalQuery[]): SemanticRetrievalRanking[] {
  return queries.map((query) => ({
    queryId: query.id,
    results: [
      { id: query.necessaryEvidenceIds[0], score: 1 },
      { id: query.hardNegativeEvidenceIds[0], score: 0 },
    ],
  }));
}

function buildEvaluationQueries() {
  return buildSemanticRetrievalQueries(semanticRetrievalScenarios);
}

function delayedNecessaryRanking(query: SemanticRetrievalQuery): SemanticRetrievalRanking {
  return {
    queryId: query.id,
    results: [
      { id: query.hardNegativeEvidenceIds[0], score: 1 },
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `distractor:${query.id}:${index}`,
        score: 0.9 - index * 0.05,
      })),
      { id: query.necessaryEvidenceIds[0], score: 0.1 },
    ],
  };
}

function perfectEvaluation(): SemanticRetrievalEvaluationResult {
  const evaluationQueries = buildSemanticRetrievalQueries(semanticRetrievalScenarios);
  return evaluateSemanticRetrievalRankings(evaluationQueries, idealRankings(evaluationQueries));
}

function candidate(
  id: string,
  downloadBytes: number,
  peakMemoryBytes: number,
  evaluation: SemanticRetrievalEvaluationResult,
  overrides: Partial<SemanticRetrievalCandidateResult> = {},
): SemanticRetrievalCandidateResult {
  return {
    id,
    downloadBytes,
    peakMemoryBytes,
    p95LatencyMs: 500,
    commercialDistributionAllowed: true,
    localInferenceAllowed: true,
    loadedPlatforms: ['darwin-arm64', 'win32-x64'],
    evaluation,
    ...overrides,
  };
}

function cloneScenario(scenario: SemanticRetrievalScenario): SemanticRetrievalScenario {
  return structuredClone(scenario);
}

function unique(values: readonly string[]) {
  return [...new Set(values)].toSorted();
}
