import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateReadingMemoryHumanReview } from './reading-memory-human-review-evaluation.ts';

const scriptPath = fileURLToPath(
  new URL('../../scripts/evaluate-reading-memory-human-review.js', import.meta.url),
);

describe('synthetic human-review record scoring, not actual release evidence', () => {
  it('derives exact threshold scores from cases without verifying the declared human provenance', () => {
    const record = syntheticRecord();
    const original = structuredClone(record);
    const result = evaluateReadingMemoryHumanReview(record);

    expect(record).toEqual(original);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.provenanceVerified).toBe(false);
    expect(result.scope).toBe('record-format-and-quality-scores-only');
    expect(result.notice).toContain('does not verify human authorship or authorize a release');
    expect(result.provenance).toEqual({
      source: 'deidentified-real-reading',
      reviewMethod: 'independent-human',
    });
    for (const privateText of [
      record.claims[0].claim,
      record.claims[0].citations[0].excerpt,
      record.reviewQueues[0].context,
      record.provenance.sourceStatement,
      record.provenance.reviewerId,
    ])
      expect(JSON.stringify(result)).not.toContain(privateText);
    expect(result.claims).toEqual({
      numerator: 19,
      denominator: 20,
      rate: 0.95,
      minimum: 0.95,
      passed: true,
    });
    for (const relation of result.relations) {
      expect(relation.coverage).toMatchObject({
        numerator: 6,
        denominator: 10,
        rate: 0.6,
        passed: true,
      });
      expect(relation.accuracy).toMatchObject({
        numerator: 6,
        denominator: 6,
        rate: 1,
        passed: true,
      });
    }
    for (const queue of result.reviewQueues) {
      expect(queue.queueCount).toBe(2);
      expect(queue.top5).toMatchObject({ numerator: 7, denominator: 10, rate: 0.7, passed: true });
    }
    expect(result.cases.claims).toHaveLength(20);
    expect(result.cases.reviewQueues).toHaveLength(4);
    expect(result.cases.relations.at(-1)).toMatchObject({ eligible: false, correct: null });

    record.claims = [record.claims[0]];
    expect(evaluateReadingMemoryHumanReview(record).claims).toMatchObject({
      denominator: 1,
      passed: true,
    });
  });

  it('fails a claim or an individual relation class even when the other classes score well', () => {
    const record = syntheticRecord();
    record.claims[0].directlySupported = false;
    record.relations[0].outputRelation = null;
    const result = evaluateReadingMemoryHumanReview(record);

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['claims.directSupport', 'relations.same.coverage']);
    expect(result.claims.rate).toBe(0.9);
    expect(result.relations.find((item) => item.relation === 'same')?.coverage.rate).toBe(0.5);
    expect(result.relations.find((item) => item.relation === 'complements')?.coverage.passed).toBe(
      true,
    );
  });

  it('scores accuracy by actual output class, including labels emitted for ineligible or different-class pairs', () => {
    const record = syntheticRecord();
    for (const pair of record.relations
      .filter((item) => item.expectedRelation === 'same')
      .slice(0, 9))
      pair.outputRelation = 'same';
    record.relations.at(-1).outputRelation = 'same';
    const boundary = evaluateReadingMemoryHumanReview(record);

    expect(boundary.passed).toBe(true);
    expect(boundary.relations.find((item) => item.relation === 'same')?.accuracy).toMatchObject({
      numerator: 9,
      denominator: 10,
      rate: 0.9,
      passed: true,
    });
    expect(boundary.cases.relations.at(-1)).toMatchObject({
      eligible: false,
      outputRelation: 'same',
      correct: false,
    });

    record.relations.find(
      (pair) => pair.expectedRelation === 'complements' && pair.outputRelation === null,
    ).outputRelation = 'same';
    const failed = evaluateReadingMemoryHumanReview(record);
    expect(failed.passed).toBe(false);
    expect(failed.failures).toEqual(['relations.same.accuracy']);
    expect(failed.relations.find((item) => item.relation === 'same')?.accuracy).toMatchObject({
      numerator: 9,
      denominator: 11,
      passed: false,
    });
  });

  it('does not mix semantic and time queues or treat absent relation classes and modes as passing', () => {
    const record = syntheticRecord();
    for (const queue of record.reviewQueues.filter((item) => item.mode === 'semantic'))
      for (const item of queue.items) item.reviewable = true;
    record.reviewQueues.find((queue) => queue.mode === 'time').items[0].reviewable = false;
    const mixed = evaluateReadingMemoryHumanReview(record);

    expect(mixed.passed).toBe(false);
    expect(mixed.failures).toEqual(['reviewQueues.time.top5']);
    expect(mixed.reviewQueues.find((queue) => queue.mode === 'semantic')?.top5.rate).toBe(1);
    expect(mixed.reviewQueues.find((queue) => queue.mode === 'time')?.top5.rate).toBe(0.6);

    record.reviewQueues = record.reviewQueues.filter((queue) => queue.mode === 'semantic');
    record.relations = record.relations.filter((pair) => pair.expectedRelation !== 'contradicts');
    const missing = evaluateReadingMemoryHumanReview(record);
    expect(missing.failures).toEqual([
      'relations.contradicts.coverage',
      'relations.contradicts.accuracy',
      'reviewQueues.time.top5',
    ]);
    expect(missing.reviewQueues.find((queue) => queue.mode === 'time')?.top5).toMatchObject({
      denominator: 0,
      rate: null,
      passed: false,
    });
  });

  it('rejects absent material, unsupported declarations, aggregate shortcuts, and unknown fields', () => {
    const mutations = [
      (record) => ({ ...record, claims: [] }),
      (record) => ({ ...record, systemRevision: 'short-revision' }),
      (record) => ({ ...record, evaluationId: 'x'.repeat(129) }),
      (record) => ({ ...record, claimedSupportRate: 1 }),
      (record) => ({ ...record, provenance: { ...record.provenance, reviewMethod: 'automated' } }),
      (record) => ({ ...record, provenance: { ...record.provenance, sourceStatement: '  ' } }),
      (record) => ({
        ...record,
        claims: [{ ...record.claims[0], citations: [{ excerpt: ' \n ' }] }],
      }),
      (record) => ({
        ...record,
        claims: [{ ...record.claims[0], citations: [{ id: 'known-id' }] }],
      }),
      (record) => ({ ...record, claims: [{ ...record.claims[0], directlySupported: 'true' }] }),
      (record) => ({ ...record, relations: [{ ...record.relations[0], eligible: true }] }),
      (record) => ({
        ...record,
        reviewQueues: [
          { ...record.reviewQueues[0], items: record.reviewQueues[0].items.slice(0, 4) },
        ],
      }),
    ];
    for (const mutate of mutations)
      expect(() => evaluateReadingMemoryHumanReview(mutate(syntheticRecord()))).toThrow();
    expect(() => evaluateReadingMemoryHumanReview(null)).toThrow();
  });

  it('rejects trimmed duplicate ids or material without rejecting paired contexts across queue modes', () => {
    const mutations = [
      (record) => {
        record.claims[1].id = ` ${record.claims[0].id} `;
      },
      (record) => {
        record.claims[1].claim = ` ${record.claims[0].claim} `;
      },
      (record) => {
        record.claims[0].citations.push({ excerpt: ` ${record.claims[0].citations[0].excerpt} ` });
      },
      (record) => {
        record.relations[1] = { ...record.relations[0], id: 'different-id' };
      },
      (record) => {
        record.reviewQueues[1].id = ` ${record.reviewQueues[0].id} `;
      },
      (record) => {
        record.reviewQueues[1].context = ` ${record.reviewQueues[0].context} `;
      },
      (record) => {
        record.reviewQueues[0].items[1].judgment = record.reviewQueues[0].items[0].judgment;
      },
    ];
    for (const mutate of mutations) {
      const record = syntheticRecord();
      mutate(record);
      expect(() => evaluateReadingMemoryHumanReview(record)).toThrow(/duplicates/);
    }
    const paired = evaluateReadingMemoryHumanReview(syntheticRecord());
    expect(paired.reviewQueues.map((queue) => queue.queueCount)).toEqual([2, 2]);
  });
});

describe('explicit-file human-review CLI', () => {
  it('requires input and rejects implicit or unknown options with a nonzero structured report', () => {
    for (const args of [[], ['--download'], ['--input', 'unused', '--input', 'another']]) {
      const result = runCli(args);
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ passed: false, provenanceVerified: false });
    }
  });

  it('binds the report to the explicit input, writes failures, and never overwrites the source record', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reading-memory-human-review-test-'));
    try {
      const inputPath = join(directory, 'synthetic-record.json');
      const outputPath = join(directory, 'synthetic-report.json');
      const record = syntheticRecord();
      const input = JSON.stringify(record);
      expect(runCli(['--input', join(directory, 'missing.json')]).status).toBe(1);
      await writeFile(inputPath, input);
      const passed = runCli(['--input', inputPath, '--output', outputPath]);
      expect(passed.status).toBe(0);
      const report = JSON.parse(passed.stdout);
      expect(report.inputSha256).toBe(createHash('sha256').update(input).digest('hex'));
      expect(report.provenanceVerified).toBe(false);
      expect(await readFile(outputPath, 'utf8')).toBe(passed.stdout);

      record.claims[0].directlySupported = false;
      const failingInput = JSON.stringify(record);
      await writeFile(inputPath, failingInput);
      const failed = runCli(['--input', inputPath, '--output', outputPath]);
      expect(failed.status).toBe(1);
      expect(JSON.parse(failed.stdout)).toMatchObject({
        passed: false,
        failures: ['claims.directSupport'],
      });
      expect(await readFile(outputPath, 'utf8')).toBe(failed.stdout);

      const overwrite = runCli(['--input', inputPath, '--output', inputPath]);
      expect(overwrite.status).toBe(1);
      expect(await readFile(inputPath, 'utf8')).toBe(failingInput);
      await writeFile(inputPath, '{}');
      expect(runCli(['--input', inputPath]).status).toBe(1);
      await writeFile(inputPath, '{private-invalid-json');
      const malformed = runCli(['--input', inputPath]);
      expect(malformed.status).toBe(1);
      expect(malformed.stdout).not.toContain('private-invalid-json');
      expect(JSON.parse(malformed.stdout).failures).toEqual([
        'Human review input must contain valid JSON',
      ]);
      await truncate(inputPath, 16 * 1024 * 1024 + 1);
      const oversized = runCli(['--input', inputPath]);
      expect(oversized.status).toBe(1);
      expect(JSON.parse(oversized.stdout).failures).toEqual([
        'Human review input must not exceed 16 MiB',
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function runCli(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
}

function syntheticRecord() {
  return {
    schemaVersion: 1,
    evaluationId: 'synthetic-unit-test-only',
    systemRevision: '1234567890abcdef1234567890abcdef12345678',
    provenance: {
      source: 'deidentified-real-reading',
      sourceStatement:
        'Synthetic unit-test data only; this is not a real reading scenario or an actual human review.',
      reviewMethod: 'independent-human',
      reviewerId: 'synthetic-test-only-reviewer',
    },
    claims: Array.from({ length: 20 }, (_, index) => ({
      id: `synthetic-claim-${index}`,
      claim: `Synthetic claim ${index}.`,
      citations: [{ excerpt: `Synthetic cited passage ${index}.` }],
      directlySupported: index < 19,
    })),
    relations: [
      ...['same', 'complements', 'contradicts'].flatMap((relation) =>
        Array.from({ length: 10 }, (_, index) => ({
          id: `synthetic-${relation}-${index}`,
          judgment: `Synthetic ${relation} judgment ${index}.`,
          evidence: `Synthetic ${relation} evidence ${index}.`,
          expectedRelation: relation,
          outputRelation: index < 6 ? relation : null,
        })),
      ),
      {
        id: 'synthetic-unrelated',
        judgment: 'Synthetic unrelated judgment.',
        evidence: 'Synthetic unrelated evidence.',
        expectedRelation: null,
        outputRelation: null,
      },
    ],
    reviewQueues: ['semantic', 'time'].flatMap((mode) =>
      Array.from({ length: 2 }, (_, queueIndex) => ({
        id: `synthetic-queue-${queueIndex}`,
        mode,
        context: `Synthetic review context ${queueIndex}.`,
        items: Array.from({ length: 5 }, (item, itemIndex) => ({
          judgment: `Synthetic queue ${queueIndex} judgment ${itemIndex}.`,
          reviewable: itemIndex < (queueIndex === 0 ? 4 : 3),
        })),
      })),
    ),
  };
}
