import { describe, expect, it } from 'vitest';
import {
  semanticRetrievalRelations,
  semanticRetrievalScenarios,
} from './semantic-retrieval-fixtures';
import {
  buildSemanticRetrievalQueries,
  evaluateSemanticRetrievalRankings,
  rankSemanticRetrievalCorpus,
  semanticRetrievalDirections,
  type SemanticRetrievalQuery,
  type SemanticRetrievalRanking,
} from './semantic-retrieval-evaluation';

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
});

describe('semantic retrieval evaluation metrics', () => {
  it('counts ask queries only when every necessary evidence item is in the final top twelve', () => {
    const evaluationQueries = buildSemanticRetrievalQueries(semanticRetrievalScenarios);
    for (const query of evaluationQueries) {
      if (query.direction === 'zh->zh' && query.kind === 'ask')
        query.necessaryEvidenceIds = Array.from(
          { length: 10 },
          (_, index) => `${query.id}:required-${index}`,
        );
    }
    const rankings = evaluationQueries.map((query) => ({
      queryId: query.id,
      results: query.necessaryEvidenceIds.slice(0, 9).map((id, index) => ({ id, score: -index })),
    }));
    const direction = evaluateSemanticRetrievalRankings(evaluationQueries, rankings).directions[0];

    expect(direction.askQueryCount).toBe(20);
    expect(direction.askNecessaryCoverageAt12).toBe(0);
  });

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
