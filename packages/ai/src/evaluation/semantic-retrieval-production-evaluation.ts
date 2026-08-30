import type { ReadingMemoryEvidenceSearchResult } from '@yomitomo/shared';
import {
  evaluateSemanticRetrievalRankings,
  type SemanticRetrievalQuery,
} from './semantic-retrieval-evaluation';

export type ProductionRetrievalSample = Pick<
  ReadingMemoryEvidenceSearchResult,
  'mode' | 'projection' | 'semantic'
> & {
  queryId: string;
  candidateIds: string[];
  evidenceIds: string[];
  sentIds: string[];
};

export function evaluateProductionRetrieval(
  queries: readonly SemanticRetrievalQuery[],
  samples: readonly ProductionRetrievalSample[],
) {
  const byQuery = new Map(queries.map((query) => [query.id, query]));
  const failures: string[] = [];
  const rankings = samples.map((sample) => {
    const query = byQuery.get(sample.queryId);
    if (!query) throw new Error(`Unknown production retrieval query: ${sample.queryId}`);
    const limit = query.kind === 'relate' ? 3 : 12;
    if (
      sample.candidateIds.length > 24 ||
      sample.evidenceIds.length > limit ||
      sample.sentIds.length > limit ||
      new Set(sample.candidateIds).size !== sample.candidateIds.length ||
      new Set(sample.evidenceIds).size !== sample.evidenceIds.length ||
      sample.evidenceIds.some((id) => !sample.candidateIds.includes(id)) ||
      !isOrderedSubset(sample.sentIds, sample.evidenceIds)
    ) {
      throw new Error(`Invalid production retrieval evidence: ${sample.queryId}`);
    }
    const { projection, semantic } = sample;
    if (
      sample.mode !== 'hybrid' ||
      projection.state !== 'available' ||
      projection.coverage.projectedAssetCount !== projection.coverage.eligibleAssetCount ||
      projection.coverage.eligibleAssetCount <= 0 ||
      semantic.state !== 'available' ||
      semantic.queryModelVersion !== semantic.modelVersion ||
      semantic.coverage.indexedEntryCount !== semantic.coverage.eligibleEntryCount ||
      semantic.coverage.eligibleEntryCount <= 0
    ) {
      failures.push(`${sample.queryId}:incomplete_production_retrieval`);
    }
    const ids = query.kind === 'relate' ? sample.evidenceIds : sample.sentIds;
    return {
      queryId: sample.queryId,
      // Ordinal scores preserve the production order; similarity is never recomputed here.
      results: ids.map((id, index) => ({ id, score: -index })),
    };
  });
  const evaluation = evaluateSemanticRetrievalRankings(queries, rankings);
  for (const direction of evaluation.directions) {
    if (direction.relateQueryCount < 20 || direction.askQueryCount < 20) {
      failures.push(`${direction.direction}:insufficient_queries`);
    }
    if (direction.relateHitAt3 < 0.8) failures.push(`${direction.direction}:relate_hit_at_3`);
    if (direction.askNecessaryCoverageAt12 < 0.9) {
      failures.push(`${direction.direction}:ask_coverage_at_12`);
    }
  }
  return { passed: failures.length === 0, failures, evaluation };
}

function isOrderedSubset(selected: readonly string[], candidates: readonly string[]) {
  if (new Set(candidates).size !== candidates.length) return false;
  let position = 0;
  for (const id of selected) {
    position = candidates.indexOf(id, position);
    if (position < 0) return false;
    position += 1;
  }
  return true;
}
