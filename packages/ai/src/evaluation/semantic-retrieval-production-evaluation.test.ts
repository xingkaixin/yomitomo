import { describe, expect, it } from 'vitest';
import { buildSemanticRetrievalQueries } from './semantic-retrieval-evaluation';
import { semanticRetrievalScenarios } from './semantic-retrieval-fixtures';
import {
  evaluateProductionRetrieval,
  type ProductionRetrievalSample,
} from './semantic-retrieval-production-evaluation';

const queries = buildSemanticRetrievalQueries(semanticRetrievalScenarios);

describe('strict production retrieval evaluation', () => {
  it('requires every direction and refuses the old 0.75 Top3 baseline', () => {
    const samples = passingSamples();
    expect(evaluateProductionRetrieval(queries, samples).passed).toBe(true);
    const missed = queries.filter(
      (query) => query.direction === 'zh->zh' && query.kind === 'relate',
    );
    for (const query of missed.slice(0, 4)) {
      const sample = samples.find((item) => item.queryId === query.id)!;
      sample.evidenceIds = [];
      sample.sentIds = [];
    }
    expect(evaluateProductionRetrieval(queries, samples).passed).toBe(true);
    const fifth = samples.find((item) => item.queryId === missed[4].id)!;
    fifth.evidenceIds = [];
    fifth.sentIds = [];
    const result = evaluateProductionRetrieval(queries, samples);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['zh->zh:relate_hit_at_3']);
    expect(result.evaluation.directions[0].relateHitAt3).toBe(0.75);
  });

  it('scores the actual sent IDs instead of the pre-budget library candidates', () => {
    const samples = passingSamples();
    const missed = queries.filter((query) => query.direction === 'en->ja' && query.kind === 'ask');
    for (const query of missed.slice(0, 2)) {
      samples.find((item) => item.queryId === query.id)!.sentIds = [];
    }
    expect(evaluateProductionRetrieval(queries, samples).passed).toBe(true);
    samples.find((item) => item.queryId === missed[2].id)!.sentIds = [];
    expect(evaluateProductionRetrieval(queries, samples).failures).toEqual([
      'en->ja:ask_coverage_at_12',
    ]);
  });

  it('fails keyword fallback, incomplete projection and partial vectors even with perfect hits', () => {
    const samples = passingSamples();
    samples[0].mode = 'keyword';
    samples[1].projection.coverage.projectedAssetCount -= 1;
    samples[2].semantic.coverage.indexedEntryCount -= 1;
    const result = evaluateProductionRetrieval(queries, samples);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      samples.slice(0, 3).map((sample) => `${sample.queryId}:incomplete_production_retrieval`),
    );
  });

  it('rejects missing or duplicate samples and fewer than twenty queries per direction', () => {
    const samples = passingSamples();
    expect(() => evaluateProductionRetrieval(queries, samples.slice(1))).toThrow('Missing');
    expect(() => evaluateProductionRetrieval(queries, [...samples, samples[0]])).toThrow(
      'Duplicate',
    );
    const remainingQueries = queries.slice(1);
    expect(evaluateProductionRetrieval(remainingQueries, samples.slice(1)).failures).toEqual([
      'zh->zh:insufficient_queries',
    ]);
    const remainingIds = new Set(
      queries.filter((query) => query.direction !== 'zh->zh').map((query) => query.id),
    );
    expect(() =>
      evaluateProductionRetrieval(
        queries.filter((query) => remainingIds.has(query.id)),
        samples.filter((sample) => remainingIds.has(sample.queryId)),
      ),
    ).toThrow('missing direction');
  });

  it('refuses invented or duplicate evidence IDs at the final send boundary', () => {
    const samples = passingSamples();
    samples[0].sentIds = ['not-retrieved'];
    expect(() => evaluateProductionRetrieval(queries, samples)).toThrow('Invalid production');
    samples[0].sentIds = [samples[0].evidenceIds[0], samples[0].evidenceIds[0]];
    expect(() => evaluateProductionRetrieval(queries, samples)).toThrow('Invalid production');
  });

  it('preserves the final production order when a selector reprioritizes candidates', () => {
    const samples = passingSamples();
    const sample = samples[0];
    sample.evidenceIds = sample.candidateIds.toReversed();
    sample.sentIds = [...sample.evidenceIds];
    expect(evaluateProductionRetrieval(queries, samples).passed).toBe(true);
  });
});

function passingSamples(): ProductionRetrievalSample[] {
  return queries.map((query) => ({
    queryId: query.id,
    candidateIds: [...query.necessaryEvidenceIds, ...query.hardNegativeEvidenceIds],
    evidenceIds: [...query.necessaryEvidenceIds],
    sentIds: [...query.necessaryEvidenceIds],
    mode: 'hybrid',
    projection: {
      state: 'available',
      coverage: { eligibleAssetCount: 120, projectedAssetCount: 120 },
    },
    semantic: {
      state: 'available',
      modelVersion: 'verified-v1',
      queryModelVersion: 'verified-v1',
      coverage: { eligibleEntryCount: 120, indexedEntryCount: 120 },
      indexingPaused: true,
    },
  }));
}
