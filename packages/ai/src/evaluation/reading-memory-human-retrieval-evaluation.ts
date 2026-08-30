import {
  choice,
  entries,
  humanReviewReportMetadata,
  identifier,
  object,
  ratio,
  readHumanReviewMetadata,
  text,
  unique,
  type ReadingMemoryHumanReviewMetadata,
} from './reading-memory-human-review-record.ts';

const languages = ['zh', 'en', 'ja'] as const;
type Language = (typeof languages)[number];

export type ReadingMemoryHumanRetrievalRecord = ReadingMemoryHumanReviewMetadata & {
  retrieval: ({
    id: string;
    queryLanguage: Language;
    evidenceLanguage: Language;
    query: string;
    displayedIds: string[];
    sentIds: string[];
  } & ({ kind: 'relate'; helpfulIds: string[] } | { kind: 'ask'; necessaryIds: string[] }))[];
};

export function evaluateReadingMemoryHumanRetrieval(value: unknown) {
  const record = readRecord(value);
  const cases = record.retrieval.map((item) => ({
    id: item.id,
    kind: item.kind,
    direction: `${item.queryLanguage}->${item.evidenceLanguage}`,
    displayedCount: item.displayedIds.length,
    sentCount: item.sentIds.length,
    passed:
      item.kind === 'relate'
        ? item.helpfulIds.some((id) => item.displayedIds.includes(id))
        : item.necessaryIds.every((id) => item.sentIds.includes(id)),
  }));
  const directions = languages.flatMap((queryLanguage) =>
    languages.map((evidenceLanguage) => {
      const direction = `${queryLanguage}->${evidenceLanguage}`;
      const relate = cases.filter((item) => item.direction === direction && item.kind === 'relate');
      const ask = cases.filter((item) => item.direction === direction && item.kind === 'ask');
      return {
        direction,
        relateQueryCount: relate.length,
        askQueryCount: ask.length,
        relateHitAt3: ratio(relate.filter((item) => item.passed).length, relate.length, 80),
        askCompleteNecessaryAt12: ratio(ask.filter((item) => item.passed).length, ask.length, 90),
      };
    }),
  );
  const failures: string[] = [];
  for (const direction of directions) {
    const label = `retrieval.${direction.direction}`;
    if (direction.relateQueryCount < 20) failures.push(`${label}.relateQueryCount`);
    if (direction.askQueryCount < 20) failures.push(`${label}.askQueryCount`);
    if (!direction.relateHitAt3.passed) failures.push(`${label}.relateHitAt3`);
    if (!direction.askCompleteNecessaryAt12.passed)
      failures.push(`${label}.askCompleteNecessaryAt12`);
  }
  return {
    ...humanReviewReportMetadata(record),
    retrievalBasis: 'submitted-final-ids-not-production-replay',
    minimumQueriesPerKindAndDirection: 20,
    passed: failures.length === 0,
    failures,
    directions,
    cases,
  };
}

function readRecord(value: unknown): ReadingMemoryHumanRetrievalRecord {
  const record = object(
    value,
    ['schemaVersion', 'evaluationId', 'systemRevision', 'provenance', 'retrieval'],
    'record',
  );
  const metadata = readHumanReviewMetadata(record);
  const ids = new Set<string>();
  const queries = new Set<string>();
  const retrieval = entries(record.retrieval, 'retrieval').map((entry, index) => {
    const label = `retrieval[${index}]`;
    const kind = choice(
      typeof entry === 'object' && entry !== null && 'kind' in entry ? entry.kind : undefined,
      ['relate', 'ask'] as const,
      `${label}.kind`,
    );
    const labelField = kind === 'relate' ? 'helpfulIds' : 'necessaryIds';
    const item = object(
      entry,
      [
        'id',
        'kind',
        'queryLanguage',
        'evidenceLanguage',
        'query',
        'displayedIds',
        'sentIds',
        labelField,
      ],
      label,
    );
    const queryLanguage = choice(item.queryLanguage, languages, `${label}.queryLanguage`);
    const evidenceLanguage = choice(item.evidenceLanguage, languages, `${label}.evidenceLanguage`);
    const query = text(item.query, `${label}.query`);
    unique(
      JSON.stringify([kind, queryLanguage, evidenceLanguage, query]),
      queries,
      `${label}.query`,
    );
    const displayedIds = readIds(item.displayedIds, `${label}.displayedIds`);
    const sentIds = readIds(item.sentIds, `${label}.sentIds`);
    const limit = kind === 'relate' ? 3 : 12;
    if (displayedIds.length > limit || sentIds.length > limit)
      throw new Error(`${label} displayedIds and sentIds must contain at most ${limit} IDs`);
    if (
      JSON.stringify(displayedIds.filter((id) => sentIds.includes(id))) !== JSON.stringify(sentIds)
    )
      throw new Error(`${label}.sentIds must be an ordered subset of displayedIds`);
    const labels = readIds(
      entries(item[labelField], `${label}.${labelField}`),
      `${label}.${labelField}`,
    );
    const base = {
      id: unique(identifier(item.id, `${label}.id`), ids, `${label}.id`),
      queryLanguage,
      evidenceLanguage,
      query,
      displayedIds,
      sentIds,
    };
    return kind === 'relate'
      ? Object.assign(base, { kind, helpfulIds: labels })
      : Object.assign(base, { kind, necessaryIds: labels });
  });
  return { ...metadata, retrieval };
}

function readIds(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const seen = new Set<string>();
  return value.map((id, index) => unique(identifier(id, `${label}[${index}]`), seen, label));
}
