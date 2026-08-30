const relationLabels = ['same', 'complements', 'contradicts'] as const;
const reviewModes = ['semantic', 'time'] as const;

type Relation = (typeof relationLabels)[number];
type ReviewMode = (typeof reviewModes)[number];

export type ReadingMemoryHumanReviewRecord = {
  schemaVersion: 1;
  evaluationId: string;
  systemRevision: string;
  provenance: {
    source: 'deidentified-real-reading';
    sourceStatement: string;
    reviewMethod: 'independent-human';
    reviewerId: string;
  };
  claims: {
    id: string;
    claim: string;
    citations: { excerpt: string }[];
    directlySupported: boolean;
  }[];
  relations: {
    id: string;
    judgment: string;
    evidence: string;
    expectedRelation: Relation | null;
    outputRelation: Relation | null;
  }[];
  reviewQueues: {
    id: string;
    mode: ReviewMode;
    context: string;
    items: { judgment: string; reviewable: boolean }[];
  }[];
};

export const readingMemoryHumanReviewScope = {
  scope: 'record-format-and-quality-scores-only',
  provenanceVerified: false,
  notice:
    'Source provenance and independent human review are self-reported. This report validates record format and scores only; it does not verify human authorship or authorize a release.',
} as const;

export function evaluateReadingMemoryHumanReview(value: unknown) {
  const record = readRecord(value);
  const claims = ratio(
    record.claims.filter((item) => item.directlySupported).length,
    record.claims.length,
    95,
  );
  const relations = relationLabels.map((relation) => {
    const eligible = record.relations.filter((item) => item.expectedRelation === relation);
    const emitted = record.relations.filter((item) => item.outputRelation === relation);
    return {
      relation,
      coverage: ratio(
        eligible.filter((item) => item.outputRelation !== null).length,
        eligible.length,
        60,
      ),
      accuracy: ratio(
        emitted.filter((item) => item.expectedRelation === relation).length,
        emitted.length,
        90,
      ),
    };
  });
  const reviewCases = record.reviewQueues.map((queue) => ({
    id: queue.id,
    mode: queue.mode,
    reviewableCount: queue.items.filter((item) => item.reviewable).length,
    itemCount: queue.items.length,
  }));
  const reviewQueues = reviewModes.map((mode) => {
    const queues = reviewCases.filter((queue) => queue.mode === mode);
    return {
      mode,
      queueCount: queues.length,
      top5: ratio(
        queues.reduce((count, queue) => count + queue.reviewableCount, 0),
        queues.length * 5,
        70,
      ),
    };
  });
  const failures: string[] = [];
  if (!claims.passed) failures.push('claims.directSupport');
  for (const relation of relations) {
    if (!relation.coverage.passed) failures.push(`relations.${relation.relation}.coverage`);
    if (!relation.accuracy.passed) failures.push(`relations.${relation.relation}.accuracy`);
  }
  for (const queue of reviewQueues) {
    if (!queue.top5.passed) failures.push(`reviewQueues.${queue.mode}.top5`);
  }
  return {
    schemaVersion: 1,
    evaluationId: record.evaluationId,
    systemRevision: record.systemRevision,
    ...readingMemoryHumanReviewScope,
    provenance: {
      source: record.provenance.source,
      reviewMethod: record.provenance.reviewMethod,
    },
    passed: failures.length === 0,
    failures,
    claims,
    relations,
    reviewQueues,
    cases: {
      claims: record.claims.map(({ id, directlySupported }) => ({ id, directlySupported })),
      relations: record.relations.map(({ id, expectedRelation, outputRelation }) => ({
        id,
        expectedRelation,
        outputRelation,
        eligible: expectedRelation !== null,
        correct: outputRelation === null ? null : outputRelation === expectedRelation,
      })),
      reviewQueues: reviewCases,
    },
  };
}

function ratio(numerator: number, denominator: number, minimumPercent: number) {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    minimum: minimumPercent / 100,
    passed: denominator > 0 && numerator * 100 >= denominator * minimumPercent,
  };
}

function readRecord(value: unknown): ReadingMemoryHumanReviewRecord {
  const record = object(
    value,
    [
      'schemaVersion',
      'evaluationId',
      'systemRevision',
      'provenance',
      'claims',
      'relations',
      'reviewQueues',
    ],
    'record',
  );
  if (record.schemaVersion !== 1) throw new Error('record.schemaVersion must be 1');
  const systemRevision = text(record.systemRevision, 'record.systemRevision');
  if (!/^[a-f\d]{40}$/iu.test(systemRevision))
    throw new Error('record.systemRevision must be a full 40-hex commit');
  const provenance = object(
    record.provenance,
    ['source', 'sourceStatement', 'reviewMethod', 'reviewerId'],
    'record.provenance',
  );
  if (
    provenance.source !== 'deidentified-real-reading' ||
    provenance.reviewMethod !== 'independent-human'
  )
    throw new Error(
      'record.provenance must declare deidentified real reading and independent human review',
    );

  return {
    schemaVersion: 1,
    evaluationId: identifier(record.evaluationId, 'record.evaluationId'),
    systemRevision,
    provenance: {
      source: provenance.source,
      sourceStatement: text(provenance.sourceStatement, 'record.provenance.sourceStatement'),
      reviewMethod: provenance.reviewMethod,
      reviewerId: identifier(provenance.reviewerId, 'record.provenance.reviewerId'),
    },
    claims: readClaims(record.claims),
    relations: readRelations(record.relations),
    reviewQueues: readReviewQueues(record.reviewQueues),
  };
}

function readClaims(value: unknown): ReadingMemoryHumanReviewRecord['claims'] {
  const ids = new Set<string>();
  const claims = new Set<string>();
  return entries(value, 'claims').map((claimValue, index) => {
    const label = `claims[${index}]`;
    const item = object(claimValue, ['id', 'claim', 'citations', 'directlySupported'], label);
    const citations = new Set<string>();
    return {
      id: unique(identifier(item.id, `${label}.id`), ids, `${label}.id`),
      claim: unique(item.claim, claims, `${label}.claim`),
      citations: entries(item.citations, `${label}.citations`).map(
        (citationValue, citationIndex) => {
          const citationLabel = `${label}.citations[${citationIndex}]`;
          const citation = object(citationValue, ['excerpt'], citationLabel);
          return { excerpt: unique(citation.excerpt, citations, `${citationLabel}.excerpt`) };
        },
      ),
      directlySupported: boolean(item.directlySupported, `${label}.directlySupported`),
    };
  });
}

function readRelations(value: unknown): ReadingMemoryHumanReviewRecord['relations'] {
  const ids = new Set<string>();
  const pairs = new Set<string>();
  return entries(value, 'relations').map((pairValue, index) => {
    const label = `relations[${index}]`;
    const item = object(
      pairValue,
      ['id', 'judgment', 'evidence', 'expectedRelation', 'outputRelation'],
      label,
    );
    const judgment = text(item.judgment, `${label}.judgment`);
    const evidence = text(item.evidence, `${label}.evidence`);
    unique(JSON.stringify([judgment, evidence]), pairs, `${label} pair`);
    return {
      id: unique(identifier(item.id, `${label}.id`), ids, `${label}.id`),
      judgment,
      evidence,
      expectedRelation:
        item.expectedRelation === null
          ? null
          : choice(item.expectedRelation, relationLabels, `${label}.expectedRelation`),
      outputRelation:
        item.outputRelation === null
          ? null
          : choice(item.outputRelation, relationLabels, `${label}.outputRelation`),
    };
  });
}

function readReviewQueues(value: unknown): ReadingMemoryHumanReviewRecord['reviewQueues'] {
  const ids = { semantic: new Set<string>(), time: new Set<string>() };
  const contexts = { semantic: new Set<string>(), time: new Set<string>() };
  return entries(value, 'reviewQueues').map((queueValue, index) => {
    const label = `reviewQueues[${index}]`;
    const queue = object(queueValue, ['id', 'mode', 'context', 'items'], label);
    const mode = choice(queue.mode, reviewModes, `${label}.mode`);
    const items = entries(queue.items, `${label}.items`);
    if (items.length !== 5) throw new Error(`${label}.items must contain exactly 5 judgments`);
    const judgments = new Set<string>();
    return {
      id: unique(identifier(queue.id, `${label}.id`), ids[mode], `${label}.id`),
      mode,
      context: unique(queue.context, contexts[mode], `${label}.context`),
      items: items.map((judgmentValue, itemIndex) => {
        const itemLabel = `${label}.items[${itemIndex}]`;
        const item = object(judgmentValue, ['judgment', 'reviewable'], itemLabel);
        return {
          judgment: unique(item.judgment, judgments, `${itemLabel}.judgment`),
          reviewable: boolean(item.reviewable, `${itemLabel}.reviewable`),
        };
      }),
    };
  });
}

function object(value: unknown, keys: readonly string[], label: string) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  return record;
}

function entries(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} must be a non-empty array`);
  return value;
}

function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must contain nonblank text`);
  return value.trim();
}

function identifier(value: unknown, label: string) {
  const result = text(value, label);
  if (result.length > 128) throw new Error(`${label} must not exceed 128 characters`);
  return result;
}

function unique(value: unknown, seen: Set<string>, label: string) {
  const result = text(value, label);
  if (seen.has(result)) throw new Error(`${label} duplicates an existing record`);
  seen.add(result);
  return result;
}

function boolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
}

function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value))
    throw new Error(`${label} must be one of: ${choices.join(', ')}`);
  return value;
}
