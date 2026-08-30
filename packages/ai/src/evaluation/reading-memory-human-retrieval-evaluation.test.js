import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateReadingMemoryHumanReview } from './reading-memory-human-review-evaluation.ts';

const scriptPath = fileURLToPath(
  new URL('../../scripts/evaluate-reading-memory-human-review.js', import.meta.url),
);

describe('synthetic human retrieval records, not actual release evidence', () => {
  it('scores helpful displayed results and complete necessary sent sets at each direction threshold', () => {
    const record = syntheticRecord();
    const original = structuredClone(record);
    const result = evaluateReadingMemoryHumanReview(record);

    expect(record).toEqual(original);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.directions).toHaveLength(9);
    for (const direction of result.directions) {
      expect(direction).toMatchObject({
        relateQueryCount: 20,
        askQueryCount: 20,
        relateHitAt3: { numerator: 16, denominator: 20, rate: 0.8, minimum: 0.8, passed: true },
        askCompleteNecessaryAt12: {
          numerator: 18,
          denominator: 20,
          rate: 0.9,
          minimum: 0.9,
          passed: true,
        },
      });
    }
    expect(result.cases).toHaveLength(360);
    expect(result.provenanceVerified).toBe(false);
    expect(result).not.toHaveProperty('releaseApproved');
    expect(result.retrievalBasis).toBe('submitted-final-ids-not-production-replay');
    expect(result.notice).toContain('does not verify human authorship or authorize a release');
    for (const privateText of [
      record.retrieval[0].query,
      record.retrieval[0].displayedIds[0],
      record.retrieval[0].helpfulIds[0],
      record.provenance.sourceStatement,
      record.provenance.reviewerId,
    ])
      expect(JSON.stringify(result)).not.toContain(privateText);
  });

  it('fails all twenty ask queries when each final sent set omits one of ten necessary items', () => {
    const record = syntheticRecord();
    const queries = record.retrieval.filter(
      (item) =>
        item.kind === 'ask' && item.queryLanguage === 'zh' && item.evidenceLanguage === 'zh',
    );
    for (const item of queries) {
      item.necessaryIds = Array.from({ length: 10 }, (_, index) => `necessary-${item.id}-${index}`);
      item.displayedIds = [...item.necessaryIds];
      item.sentIds = item.necessaryIds.slice(0, 9);
    }
    const result = evaluateReadingMemoryHumanReview(record);

    expect(queries).toHaveLength(20);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['retrieval.zh->zh.askCompleteNecessaryAt12']);
    expect(result.directions[0].askCompleteNecessaryAt12).toMatchObject({
      numerator: 0,
      denominator: 20,
      rate: 0,
      passed: false,
    });
    expect(
      result.cases.filter((item) => item.direction === 'zh->zh' && item.kind === 'ask'),
    ).toSatisfy((items) => items.every((item) => !item.passed));
  });

  it('fails a missing direction, an undersized kind, or an individual below-threshold direction', () => {
    const missing = syntheticRecord();
    missing.retrieval = missing.retrieval.filter(
      (item) => item.queryLanguage !== 'ja' || item.evidenceLanguage !== 'en',
    );
    const absent = evaluateReadingMemoryHumanReview(missing);
    expect(absent.passed).toBe(false);
    expect(absent.failures).toContain('retrieval.ja->en.relateQueryCount');
    expect(absent.failures).toContain('retrieval.ja->en.askQueryCount');

    const undersized = syntheticRecord();
    undersized.retrieval.splice(19, 1);
    const under = evaluateReadingMemoryHumanReview(undersized);
    expect(under.passed).toBe(false);
    expect(under.failures).toEqual(['retrieval.zh->zh.relateQueryCount']);

    const below = syntheticRecord();
    below.retrieval[0].displayedIds = [];
    const failed = evaluateReadingMemoryHumanReview(below);
    expect(failed.failures).toEqual(['retrieval.zh->zh.relateHitAt3']);
    expect(failed.directions[0].relateHitAt3.rate).toBe(0.75);
  });

  it.each([
    [
      'unknown record fields',
      (record) => {
        record.extra = true;
      },
    ],
    [
      'mixed input shapes',
      (record) => {
        record.claims = [];
        record.relations = [];
        record.reviewQueues = [];
      },
    ],
    [
      'unsupported schema',
      (record) => {
        record.schemaVersion = 2;
      },
    ],
    [
      'abbreviated revision',
      (record) => {
        record.systemRevision = '1234567';
      },
    ],
    [
      'unaccepted source',
      (record) => {
        record.provenance.source = 'synthetic';
      },
    ],
    [
      'blank source statement',
      (record) => {
        record.provenance.sourceStatement = ' ';
      },
    ],
    [
      'unknown query language',
      (record) => {
        record.retrieval[0].queryLanguage = 'fr';
      },
    ],
    [
      'unknown evidence language',
      (record) => {
        record.retrieval[0].evidenceLanguage = 'fr';
      },
    ],
    [
      'blank query',
      (record) => {
        record.retrieval[0].query = ' ';
      },
    ],
    [
      'unknown kind',
      (record) => {
        record.retrieval[0].kind = 'review';
      },
    ],
    [
      'mixed helpful and necessary labels',
      (record) => {
        record.retrieval[0].necessaryIds = ['other'];
      },
    ],
    [
      'empty helpful labels',
      (record) => {
        record.retrieval[0].helpfulIds = [];
      },
    ],
    [
      'empty necessary labels',
      (record) => {
        record.retrieval[20].necessaryIds = [];
      },
    ],
    [
      'non-array results',
      (record) => {
        record.retrieval[0].displayedIds = null;
      },
    ],
  ])('rejects malformed material: %s', (_label, change) => {
    const record = syntheticRecord();
    change(record);
    expect(() => evaluateReadingMemoryHumanReview(record)).toThrow();
  });

  it.each([
    [
      'duplicate sample id',
      (record) => {
        record.retrieval[20].id = ` ${record.retrieval[0].id} `;
      },
    ],
    [
      'duplicate query in one direction and kind',
      (record) => {
        record.retrieval[1].query = ` ${record.retrieval[0].query} `;
      },
    ],
    [
      'duplicate displayed id',
      (record) => {
        record.retrieval[0].displayedIds.push(record.retrieval[0].displayedIds[0]);
      },
    ],
    [
      'duplicate sent id',
      (record) => {
        record.retrieval[20].sentIds.push(record.retrieval[20].sentIds[0]);
      },
    ],
    [
      'duplicate helpful id',
      (record) => {
        record.retrieval[0].helpfulIds.push(record.retrieval[0].helpfulIds[0]);
      },
    ],
    [
      'duplicate necessary id',
      (record) => {
        record.retrieval[20].necessaryIds.push(record.retrieval[20].necessaryIds[0]);
      },
    ],
    [
      'relate display over three',
      (record) => {
        record.retrieval[0].displayedIds.push('fourth-result');
      },
    ],
    [
      'relate sent over three',
      (record) => {
        record.retrieval[0].sentIds = ['one', 'two', 'three', 'four'];
      },
    ],
    [
      'ask display over twelve',
      (record) => {
        record.retrieval[20].displayedIds = Array.from(
          { length: 13 },
          (_, index) => `result-${index}`,
        );
      },
    ],
    [
      'ask sent over twelve',
      (record) => {
        record.retrieval[20].sentIds = Array.from({ length: 13 }, (_, index) => `result-${index}`);
      },
    ],
    [
      'sent outside displayed set',
      (record) => {
        record.retrieval[20].sentIds = ['not-displayed'];
      },
    ],
    [
      'sent outside displayed order',
      (record) => {
        record.retrieval[20].sentIds.reverse();
      },
    ],
  ])('rejects duplicated or impossible final results: %s', (_label, change) => {
    const record = syntheticRecord();
    change(record);
    expect(() => evaluateReadingMemoryHumanReview(record)).toThrow();
  });

  it('scores an explicit JSON file through the shared CLI and binds the report to its exact input bytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'human-retrieval-unit-test-'));
    try {
      const input = join(directory, 'record.json');
      const output = join(directory, 'report.json');
      const record = syntheticRecord();
      const bytes = `${JSON.stringify(record, null, 2)}\n`;
      await writeFile(input, bytes);
      const execution = spawnSync(
        process.execPath,
        [scriptPath, '--input', input, '--output', output],
        {
          encoding: 'utf8',
        },
      );
      expect(execution.status).toBe(0);
      const report = JSON.parse(execution.stdout);
      expect(report.inputSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(report.provenanceVerified).toBe(false);
      expect(report).not.toHaveProperty('releaseApproved');
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(report);
      expect(execution.stdout).not.toContain(record.retrieval[0].query);

      record.retrieval[0].displayedIds = [];
      await writeFile(input, JSON.stringify(record));
      const failed = spawnSync(process.execPath, [scriptPath, '--input', input], {
        encoding: 'utf8',
      });
      expect(failed.status).toBe(1);
      expect(JSON.parse(failed.stdout).failures).toEqual(['retrieval.zh->zh.relateHitAt3']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function syntheticRecord() {
  const languages = ['zh', 'en', 'ja'];
  return {
    schemaVersion: 1,
    evaluationId: 'synthetic-retrieval-unit-test-only',
    systemRevision: '1234567890abcdef1234567890abcdef12345678',
    provenance: {
      source: 'deidentified-real-reading',
      sourceStatement:
        'Synthetic unit-test records only; not real reading or actual human judgments.',
      reviewMethod: 'independent-human',
      reviewerId: 'synthetic-test-only-reviewer',
    },
    retrieval: languages.flatMap((queryLanguage) =>
      languages.flatMap((evidenceLanguage) =>
        ['relate', 'ask'].flatMap((kind) =>
          Array.from({ length: 20 }, (_, index) => {
            const id = `${queryLanguage}-${evidenceLanguage}-${kind}-${index}`;
            const base = {
              id,
              kind,
              queryLanguage,
              evidenceLanguage,
              query: `PRIVATE synthetic question for ${id}`,
            };
            if (kind === 'relate') {
              const helpfulId = `helpful-evidence-${id}`;
              return {
                ...base,
                displayedIds: [
                  index < 16 ? helpfulId : `miss-${id}`,
                  `other-a-${id}`,
                  `other-b-${id}`,
                ],
                sentIds: [],
                helpfulIds: [helpfulId],
              };
            }
            const necessaryIds = [`necessary-a-${id}`, `necessary-b-${id}`];
            return {
              ...base,
              displayedIds: [...necessaryIds],
              sentIds: index < 18 ? [...necessaryIds] : necessaryIds.slice(0, 1),
              necessaryIds,
            };
          }),
        ),
      ),
    ),
  };
}
