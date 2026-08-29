import type {
  SemanticRetrievalLanguage,
  SemanticRetrievalRelation,
  SemanticRetrievalScenario,
} from './semantic-retrieval-fixtures';
import * as semanticRetrievalFixtureModule from './semantic-retrieval-fixtures.ts';

const { semanticRetrievalEvidenceGrades, semanticRetrievalLanguages, semanticRetrievalRelations } =
  semanticRetrievalFixtureModule;

export const semanticRetrievalDirections = semanticRetrievalLanguages.flatMap((queryLanguage) =>
  semanticRetrievalLanguages.map(
    (evidenceLanguage) =>
      `${queryLanguage}->${evidenceLanguage}` satisfies SemanticRetrievalDirection,
  ),
);

export const semanticRetrievalCandidatePlatforms = ['darwin-arm64', 'win32-x64'] as const;

export const defaultSemanticRetrievalCandidateCriteria = {
  relateHitAt3Min: 0.8,
  askNecessaryCoverageAt12Min: 0.9,
  p95LatencyMsMax: 1_000,
  requiredPlatforms: semanticRetrievalCandidatePlatforms,
} as const;

export type SemanticRetrievalDirection =
  `${SemanticRetrievalLanguage}->${SemanticRetrievalLanguage}`;

export type SemanticRetrievalQueryKind = 'relate' | 'ask';

export type SemanticRetrievalEvidenceGrade = keyof typeof semanticRetrievalEvidenceGrades;

export type SemanticRetrievalCorpusItem = {
  id: string;
  scenarioId: string;
  language: SemanticRetrievalLanguage;
  relation: SemanticRetrievalRelation | 'unrelated';
  grade: SemanticRetrievalEvidenceGrade;
  relevance: (typeof semanticRetrievalEvidenceGrades)[SemanticRetrievalEvidenceGrade];
  text: string;
};

export type SemanticRetrievalQuery = {
  id: string;
  scenarioId: string;
  kind: SemanticRetrievalQueryKind;
  direction: SemanticRetrievalDirection;
  queryLanguage: SemanticRetrievalLanguage;
  evidenceLanguage: SemanticRetrievalLanguage;
  relation: SemanticRetrievalRelation;
  text: string;
  necessaryEvidenceIds: readonly string[];
  hardNegativeEvidenceIds: readonly string[];
};

export type SemanticRetrievalVector = {
  id: string;
  vector: readonly number[];
};

export type SemanticRetrievalRankedItem = {
  id: string;
  score: number;
};

export type SemanticRetrievalRanking = {
  queryId: string;
  results: readonly SemanticRetrievalRankedItem[];
};

export type SemanticRetrievalRelationMetrics = {
  queryCount: number;
  hitAt3: number;
};

export type SemanticRetrievalDirectionMetrics = {
  direction: SemanticRetrievalDirection;
  queryCount: number;
  relateQueryCount: number;
  askQueryCount: number;
  relateHitAt3: number;
  askNecessaryCoverageAt12: number;
  relations: Record<SemanticRetrievalRelation, SemanticRetrievalRelationMetrics>;
  hardNegativeComparisonCount: number;
  necessaryBeforeHardNegativeRate: number;
};

export type SemanticRetrievalEvaluationResult = {
  directions: SemanticRetrievalDirectionMetrics[];
};

export type SemanticRetrievalCandidatePlatform =
  (typeof semanticRetrievalCandidatePlatforms)[number];

export type SemanticRetrievalCandidateResult = {
  id: string;
  downloadBytes: number;
  peakMemoryBytes: number;
  p95LatencyMs: number;
  commercialDistributionAllowed: boolean;
  localInferenceAllowed: boolean;
  loadedPlatforms: readonly SemanticRetrievalCandidatePlatform[];
  evaluation: SemanticRetrievalEvaluationResult;
};

export type SemanticRetrievalCandidateCriteria = {
  relateHitAt3Min: number;
  askNecessaryCoverageAt12Min: number;
  p95LatencyMsMax: number;
  requiredPlatforms: readonly SemanticRetrievalCandidatePlatform[];
};

export type SemanticRetrievalCandidateEligibility = {
  candidateId: string;
  eligible: boolean;
  failures: string[];
};

export function validateSemanticRetrievalScenarios(
  value: unknown,
): asserts value is readonly SemanticRetrievalScenario[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Semantic retrieval scenarios must be a non-empty array');
  }

  const scenarioIds = new Set<string>();
  const texts = new Set<string>();
  for (const [index, scenarioValue] of value.entries()) {
    const label = `Semantic retrieval scenario ${index}`;
    const scenario = recordValue(scenarioValue, label);
    exactKeys(scenario, ['id', 'queryLanguage', 'relation', 'queries', 'evidence'], label);
    const id = uniqueText(scenario.id, `${label}.id`, scenarioIds);
    const queryLanguage = enumValue(
      scenario.queryLanguage,
      semanticRetrievalLanguages,
      `${label}.queryLanguage`,
    );
    enumValue(scenario.relation, semanticRetrievalRelations, `${label}.relation`);

    const queries = recordValue(scenario.queries, `${label}.queries`);
    exactKeys(queries, ['relate', 'ask'], `${label}.queries`);
    const relate = uniqueText(queries.relate, `${label}.queries.relate`, texts);
    const ask = uniqueText(queries.ask, `${label}.queries.ask`, texts);
    if (relate === ask) throw new Error(`${label} must use distinct relate and ask queries`);

    const evidence = recordValue(scenario.evidence, `${label}.evidence`);
    exactKeys(evidence, semanticRetrievalLanguages, `${label}.evidence`);
    for (const language of semanticRetrievalLanguages) {
      const pair = recordValue(evidence[language], `${label}.evidence.${language}`);
      exactKeys(pair, ['necessary', 'hardNegative'], `${label}.evidence.${language}`);
      const necessary = uniqueText(
        pair.necessary,
        `${label}.evidence.${language}.necessary`,
        texts,
      );
      const hardNegative = uniqueText(
        pair.hardNegative,
        `${label}.evidence.${language}.hardNegative`,
        texts,
      );
      if (necessary === hardNegative) {
        throw new Error(`${label}.evidence.${language} must contain two distinct texts`);
      }
    }

    if (!semanticRetrievalLanguages.includes(queryLanguage)) {
      throw new Error(`Unsupported query language in ${id}`);
    }
  }
}

export function validateSemanticRetrievalCoverage(
  scenarios: readonly SemanticRetrievalScenario[],
  minimumScenariosPerQueryLanguage: number,
) {
  validateSemanticRetrievalScenarios(scenarios);
  if (
    !Number.isSafeInteger(minimumScenariosPerQueryLanguage) ||
    minimumScenariosPerQueryLanguage < 1
  ) {
    throw new Error('Minimum scenarios per query language must be a positive safe integer');
  }

  for (const language of semanticRetrievalLanguages) {
    const languageScenarios = scenarios.filter((scenario) => scenario.queryLanguage === language);
    if (languageScenarios.length < minimumScenariosPerQueryLanguage) {
      throw new Error(
        `Semantic retrieval language ${language} needs at least ${minimumScenariosPerQueryLanguage} scenarios`,
      );
    }
    for (const relation of semanticRetrievalRelations) {
      if (!languageScenarios.some((scenario) => scenario.relation === relation)) {
        throw new Error(`Semantic retrieval language ${language} is missing relation ${relation}`);
      }
    }
  }
}

export function buildSemanticRetrievalCorpus(
  scenarios: readonly SemanticRetrievalScenario[],
): SemanticRetrievalCorpusItem[] {
  validateSemanticRetrievalScenarios(scenarios);
  return scenarios.flatMap((scenario) =>
    semanticRetrievalLanguages.flatMap((language) => {
      const evidence = scenario.evidence[language];
      return [
        {
          id: evidenceId(scenario.id, language, 'necessary'),
          scenarioId: scenario.id,
          language,
          relation: scenario.relation,
          grade: 'necessary' as const,
          relevance: semanticRetrievalEvidenceGrades.necessary,
          text: evidence.necessary,
        },
        {
          id: evidenceId(scenario.id, language, 'hardNegative'),
          scenarioId: scenario.id,
          language,
          relation: 'unrelated' as const,
          grade: 'hardNegative' as const,
          relevance: semanticRetrievalEvidenceGrades.hardNegative,
          text: evidence.hardNegative,
        },
      ];
    }),
  );
}

export function buildSemanticRetrievalQueries(
  scenarios: readonly SemanticRetrievalScenario[],
): SemanticRetrievalQuery[] {
  validateSemanticRetrievalScenarios(scenarios);
  return scenarios.flatMap((scenario) =>
    semanticRetrievalLanguages.flatMap((evidenceLanguage) =>
      (['relate', 'ask'] as const).map((kind) => ({
        id: queryId(scenario.id, evidenceLanguage, kind),
        scenarioId: scenario.id,
        kind,
        direction: `${scenario.queryLanguage}->${evidenceLanguage}`,
        queryLanguage: scenario.queryLanguage,
        evidenceLanguage,
        relation: scenario.relation,
        text: scenario.queries[kind],
        necessaryEvidenceIds: [evidenceId(scenario.id, evidenceLanguage, 'necessary')],
        hardNegativeEvidenceIds: [evidenceId(scenario.id, evidenceLanguage, 'hardNegative')],
      })),
    ),
  );
}

export function rankSemanticRetrievalCorpus(
  queryVector: readonly number[],
  corpusVectors: readonly SemanticRetrievalVector[],
  limit: number,
): SemanticRetrievalRankedItem[] {
  const queryNorm = vectorNorm(queryVector, 'Semantic retrieval query vector');
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new Error('Semantic retrieval rank limit must be a non-negative safe integer');
  }

  const ids = new Set<string>();
  const results = corpusVectors.map((item, index) => {
    const id = uniqueText(item.id, `Semantic retrieval corpus vector ${index}.id`, ids);
    if (item.vector.length !== queryVector.length) {
      throw new Error(`Semantic retrieval corpus vector ${id} has a different dimension`);
    }
    const corpusNorm = vectorNorm(item.vector, `Semantic retrieval corpus vector ${id}`);
    const score = dotProduct(queryVector, item.vector) / (queryNorm * corpusNorm);
    if (!Number.isFinite(score))
      throw new Error(`Semantic retrieval score for ${id} is not finite`);
    return { id, score };
  });

  return results.toSorted(compareRankedItems).slice(0, limit);
}

export function evaluateSemanticRetrievalRankings(
  queries: readonly SemanticRetrievalQuery[],
  rankings: readonly SemanticRetrievalRanking[],
): SemanticRetrievalEvaluationResult {
  const rankingsByQueryId = validateRankings(queries, rankings);
  const availableDirections = new Set(queries.map((query) => query.direction));
  for (const direction of semanticRetrievalDirections) {
    if (!availableDirections.has(direction)) {
      throw new Error(`Semantic retrieval queries are missing direction ${direction}`);
    }
  }

  return {
    directions: semanticRetrievalDirections.map((direction) => {
      const directionQueries = queries.filter((query) => query.direction === direction);
      const relateQueries = directionQueries.filter((query) => query.kind === 'relate');
      const askQueries = directionQueries.filter((query) => query.kind === 'ask');
      if (relateQueries.length === 0 || askQueries.length === 0) {
        throw new Error(`Semantic retrieval direction ${direction} needs relate and ask queries`);
      }

      const relationMetrics = Object.fromEntries(
        semanticRetrievalRelations.map((relation) => {
          const relationQueries = relateQueries.filter((query) => query.relation === relation);
          if (relationQueries.length === 0) {
            throw new Error(
              `Semantic retrieval direction ${direction} is missing relation ${relation}`,
            );
          }
          return [
            relation,
            {
              queryCount: relationQueries.length,
              hitAt3: hitRate(relationQueries, rankingsByQueryId, 3),
            },
          ];
        }),
      ) as Record<SemanticRetrievalRelation, SemanticRetrievalRelationMetrics>;
      const hardNegativeWins = directionQueries.filter((query) =>
        necessaryRanksBeforeHardNegative(query, rankingsByQueryId.get(query.id) || []),
      ).length;

      return {
        direction,
        queryCount: directionQueries.length,
        relateQueryCount: relateQueries.length,
        askQueryCount: askQueries.length,
        relateHitAt3: hitRate(relateQueries, rankingsByQueryId, 3),
        askNecessaryCoverageAt12: necessaryCoverage(askQueries, rankingsByQueryId, 12),
        relations: relationMetrics,
        hardNegativeComparisonCount: directionQueries.length,
        necessaryBeforeHardNegativeRate: hardNegativeWins / directionQueries.length,
      };
    }),
  };
}

export function evaluateSemanticRetrievalCandidateEligibility(
  candidate: SemanticRetrievalCandidateResult,
  criteria: SemanticRetrievalCandidateCriteria = defaultSemanticRetrievalCandidateCriteria,
): SemanticRetrievalCandidateEligibility {
  validateCandidate(candidate);
  validateCriteria(criteria);
  const failures: string[] = [];
  if (!candidate.commercialDistributionAllowed) failures.push('commercial_distribution');
  if (!candidate.localInferenceAllowed) failures.push('local_inference');
  if (candidate.p95LatencyMs > criteria.p95LatencyMsMax) failures.push('p95_latency');
  for (const platform of criteria.requiredPlatforms) {
    if (!candidate.loadedPlatforms.includes(platform)) failures.push(`platform:${platform}`);
  }
  for (const direction of semanticRetrievalDirections) {
    const metrics = candidate.evaluation.directions.find((item) => item.direction === direction);
    if (!metrics) {
      failures.push(`direction:${direction}:missing`);
      continue;
    }
    if (metrics.relateHitAt3 < criteria.relateHitAt3Min) {
      failures.push(`direction:${direction}:relate_hit_at_3`);
    }
    if (metrics.askNecessaryCoverageAt12 < criteria.askNecessaryCoverageAt12Min) {
      failures.push(`direction:${direction}:ask_coverage_at_12`);
    }
  }
  return { candidateId: candidate.id, eligible: failures.length === 0, failures };
}

export function selectSemanticRetrievalCandidate(
  candidates: readonly SemanticRetrievalCandidateResult[],
  criteria: SemanticRetrievalCandidateCriteria = defaultSemanticRetrievalCandidateCriteria,
): SemanticRetrievalCandidateResult | null {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    validateCandidate(candidate);
    uniqueText(candidate.id, 'Semantic retrieval candidate.id', ids);
  }
  return (
    candidates
      .filter(
        (candidate) => evaluateSemanticRetrievalCandidateEligibility(candidate, criteria).eligible,
      )
      .toSorted(
        (left, right) =>
          left.downloadBytes - right.downloadBytes ||
          left.peakMemoryBytes - right.peakMemoryBytes ||
          compareIds(left.id, right.id),
      )[0] || null
  );
}

function evidenceId(
  scenarioId: string,
  language: SemanticRetrievalLanguage,
  grade: SemanticRetrievalEvidenceGrade,
) {
  return `evidence:${scenarioId}:${language}:${grade}`;
}

function queryId(
  scenarioId: string,
  evidenceLanguage: SemanticRetrievalLanguage,
  kind: SemanticRetrievalQueryKind,
) {
  return `query:${scenarioId}:${evidenceLanguage}:${kind}`;
}

function vectorNorm(vector: readonly number[], label: string) {
  if (vector.length === 0) throw new Error(`${label} must not be empty`);
  let squaredNorm = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new Error(`${label} must contain only finite values`);
    squaredNorm += value * value;
  }
  const norm = Math.sqrt(squaredNorm);
  if (!Number.isFinite(norm) || norm === 0)
    throw new Error(`${label} must have a finite non-zero norm`);
  return norm;
}

function dotProduct(left: readonly number[], right: readonly number[]) {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result += left[index] * right[index];
  return result;
}

function compareRankedItems(left: SemanticRetrievalRankedItem, right: SemanticRetrievalRankedItem) {
  return right.score - left.score || compareIds(left.id, right.id);
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateRankings(
  queries: readonly SemanticRetrievalQuery[],
  rankings: readonly SemanticRetrievalRanking[],
) {
  const queryIds = new Set<string>();
  for (const query of queries) {
    uniqueText(query.id, 'Semantic retrieval query.id', queryIds);
    if (!semanticRetrievalDirections.includes(query.direction)) {
      throw new Error(`Semantic retrieval query ${query.id} has an invalid direction`);
    }
    if (!semanticRetrievalRelations.includes(query.relation)) {
      throw new Error(`Semantic retrieval query ${query.id} has an invalid relation`);
    }
    if (query.kind !== 'relate' && query.kind !== 'ask') {
      throw new Error(`Semantic retrieval query ${query.id} has an invalid kind`);
    }
    if (query.necessaryEvidenceIds.length === 0 || query.hardNegativeEvidenceIds.length === 0) {
      throw new Error(
        `Semantic retrieval query ${query.id} needs positive and hard-negative evidence`,
      );
    }
  }

  const rankingsByQueryId = new Map<string, readonly SemanticRetrievalRankedItem[]>();
  for (const ranking of rankings) {
    if (!queryIds.has(ranking.queryId)) {
      throw new Error(`Unknown semantic retrieval query ranking: ${ranking.queryId}`);
    }
    if (rankingsByQueryId.has(ranking.queryId)) {
      throw new Error(`Duplicate semantic retrieval query ranking: ${ranking.queryId}`);
    }
    const resultIds = new Set<string>();
    for (const [index, result] of ranking.results.entries()) {
      uniqueText(result.id, `Semantic retrieval ranking ${ranking.queryId}.results.id`, resultIds);
      if (!Number.isFinite(result.score)) {
        throw new Error(
          `Semantic retrieval ranking ${ranking.queryId} contains a non-finite score`,
        );
      }
      if (index > 0 && compareRankedItems(ranking.results[index - 1], result) > 0) {
        throw new Error(`Semantic retrieval ranking ${ranking.queryId} is not sorted`);
      }
    }
    rankingsByQueryId.set(ranking.queryId, ranking.results);
  }
  for (const query of queries) {
    if (!rankingsByQueryId.has(query.id)) {
      throw new Error(`Missing semantic retrieval query ranking: ${query.id}`);
    }
  }
  return rankingsByQueryId;
}

function hitRate(
  queries: readonly SemanticRetrievalQuery[],
  rankings: ReadonlyMap<string, readonly SemanticRetrievalRankedItem[]>,
  limit: number,
) {
  const hits = queries.filter((query) => {
    const resultIds = new Set(
      (rankings.get(query.id) || []).slice(0, limit).map((item) => item.id),
    );
    return query.necessaryEvidenceIds.some((id) => resultIds.has(id));
  }).length;
  return hits / queries.length;
}

function necessaryCoverage(
  queries: readonly SemanticRetrievalQuery[],
  rankings: ReadonlyMap<string, readonly SemanticRetrievalRankedItem[]>,
  limit: number,
) {
  let matched = 0;
  let total = 0;
  for (const query of queries) {
    const resultIds = new Set(
      (rankings.get(query.id) || []).slice(0, limit).map((item) => item.id),
    );
    for (const requiredEvidenceId of query.necessaryEvidenceIds) {
      total += 1;
      if (resultIds.has(requiredEvidenceId)) matched += 1;
    }
  }
  return matched / total;
}

function necessaryRanksBeforeHardNegative(
  query: SemanticRetrievalQuery,
  results: readonly SemanticRetrievalRankedItem[],
) {
  const ranks = new Map(results.map((item, index) => [item.id, index]));
  const necessaryRank = minimumRank(query.necessaryEvidenceIds, ranks);
  const hardNegativeRank = minimumRank(query.hardNegativeEvidenceIds, ranks);
  return necessaryRank < hardNegativeRank;
}

function minimumRank(ids: readonly string[], ranks: ReadonlyMap<string, number>) {
  return Math.min(...ids.map((id) => ranks.get(id) ?? Number.POSITIVE_INFINITY));
}

function validateCandidate(candidate: SemanticRetrievalCandidateResult) {
  nonEmptyText(candidate.id, 'Semantic retrieval candidate.id');
  nonNegativeSafeInteger(candidate.downloadBytes, 'Semantic retrieval candidate.downloadBytes');
  nonNegativeSafeInteger(candidate.peakMemoryBytes, 'Semantic retrieval candidate.peakMemoryBytes');
  nonNegativeFiniteNumber(candidate.p95LatencyMs, 'Semantic retrieval candidate.p95LatencyMs');
  if (typeof candidate.commercialDistributionAllowed !== 'boolean') {
    throw new Error('Semantic retrieval candidate.commercialDistributionAllowed must be boolean');
  }
  if (typeof candidate.localInferenceAllowed !== 'boolean') {
    throw new Error('Semantic retrieval candidate.localInferenceAllowed must be boolean');
  }
  const platforms = new Set<SemanticRetrievalCandidatePlatform>();
  for (const platform of candidate.loadedPlatforms) {
    if (!semanticRetrievalCandidatePlatforms.includes(platform)) {
      throw new Error(`Unsupported semantic retrieval candidate platform: ${platform}`);
    }
    if (platforms.has(platform)) {
      throw new Error(`Duplicate semantic retrieval candidate platform: ${platform}`);
    }
    platforms.add(platform);
  }
  const directions = new Set<SemanticRetrievalDirection>();
  for (const metrics of candidate.evaluation.directions) {
    if (!semanticRetrievalDirections.includes(metrics.direction)) {
      throw new Error(`Unsupported semantic retrieval candidate direction: ${metrics.direction}`);
    }
    if (directions.has(metrics.direction)) {
      throw new Error(`Duplicate semantic retrieval candidate direction: ${metrics.direction}`);
    }
    directions.add(metrics.direction);
    unitInterval(metrics.relateHitAt3, `${metrics.direction}.relateHitAt3`);
    unitInterval(metrics.askNecessaryCoverageAt12, `${metrics.direction}.askNecessaryCoverageAt12`);
  }
}

function validateCriteria(criteria: SemanticRetrievalCandidateCriteria) {
  unitInterval(criteria.relateHitAt3Min, 'Semantic retrieval criteria.relateHitAt3Min');
  unitInterval(
    criteria.askNecessaryCoverageAt12Min,
    'Semantic retrieval criteria.askNecessaryCoverageAt12Min',
  );
  nonNegativeFiniteNumber(criteria.p95LatencyMsMax, 'Semantic retrieval criteria.p95LatencyMsMax');
  const platforms = new Set<SemanticRetrievalCandidatePlatform>();
  for (const platform of criteria.requiredPlatforms) {
    if (!semanticRetrievalCandidatePlatforms.includes(platform) || platforms.has(platform)) {
      throw new Error(`Invalid semantic retrieval criteria platform: ${platform}`);
    }
    platforms.add(platform);
  }
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).toSorted();
  const required = [...expected].toSorted();
  if (actual.length !== required.length || actual.some((key, index) => key !== required[index])) {
    throw new Error(`${label} must contain exactly: ${required.join(', ')}`);
  }
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function uniqueText(value: unknown, label: string, values: Set<string>) {
  const text = nonEmptyText(value, label);
  if (values.has(text)) throw new Error(`${label} must be unique`);
  values.add(text);
  return text;
}

function nonEmptyText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be non-empty text without surrounding whitespace`);
  }
  if (value.normalize('NFC') !== value) throw new Error(`${label} must use NFC normalization`);
  return value;
}

function nonNegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a safe integer`);
}

function nonNegativeFiniteNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be finite and non-negative`);
}

function unitInterval(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between zero and one`);
  }
}
