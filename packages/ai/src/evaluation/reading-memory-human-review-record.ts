export type ReadingMemoryHumanReviewMetadata = {
  schemaVersion: 1;
  evaluationId: string;
  systemRevision: string;
  provenance: {
    source: 'deidentified-real-reading';
    sourceStatement: string;
    reviewMethod: 'independent-human';
    reviewerId: string;
  };
};

export const readingMemoryHumanReviewScope = {
  scope: 'record-format-and-quality-scores-only',
  provenanceVerified: false,
  notice:
    'Source provenance and independent human review are self-reported. This report validates record format and scores only; it does not verify human authorship or authorize a release.',
} as const;

export function readHumanReviewMetadata(
  record: Record<string, unknown>,
): ReadingMemoryHumanReviewMetadata {
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
  };
}

export function humanReviewReportMetadata(record: ReadingMemoryHumanReviewMetadata) {
  return {
    schemaVersion: record.schemaVersion,
    evaluationId: record.evaluationId,
    systemRevision: record.systemRevision,
    ...readingMemoryHumanReviewScope,
    provenance: {
      source: record.provenance.source,
      reviewMethod: record.provenance.reviewMethod,
    },
  };
}

export function ratio(numerator: number, denominator: number, minimumPercent: number) {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
    minimum: minimumPercent / 100,
    passed: denominator > 0 && numerator * 100 >= denominator * minimumPercent,
  };
}

export function object(value: unknown, keys: readonly string[], label: string) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key)))
    throw new Error(`${label} must contain exactly: ${keys.join(', ')}`);
  return record;
}

export function entries(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} must be a non-empty array`);
  return value;
}

export function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must contain nonblank text`);
  return value.trim();
}

export function identifier(value: unknown, label: string) {
  const result = text(value, label);
  if (result.length > 128) throw new Error(`${label} must not exceed 128 characters`);
  return result;
}

export function unique(value: unknown, seen: Set<string>, label: string) {
  const result = text(value, label);
  if (seen.has(result)) throw new Error(`${label} duplicates an existing record`);
  seen.add(result);
  return result;
}

export function choice<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value))
    throw new Error(`${label} must be one of: ${choices.join(', ')}`);
  return value;
}
