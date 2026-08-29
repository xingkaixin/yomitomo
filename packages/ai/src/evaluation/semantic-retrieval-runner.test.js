import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import darwinReport from '../../evaluation/semantic-retrieval/results/darwin-arm64-candidates-v1.json';
import selection from '../../evaluation/semantic-retrieval/selection-v1.json';
import {
  assertBenchmarkGates,
  requiresBenchmarkGates,
} from '../../scripts/evaluate-semantic-retrieval.js';
import { semanticRetrievalScenarios } from './semantic-retrieval-fixtures.ts';

describe('semantic retrieval report binding', () => {
  it('binds the report and selection to the current dataset and candidate manifest bytes', () => {
    const datasetSha256 = sha256(JSON.stringify(semanticRetrievalScenarios));
    const candidatesManifestSha256 = sha256(
      readFileSync(
        new URL('../../evaluation/semantic-retrieval/candidates-v1.json', import.meta.url),
      ),
    );
    expect(darwinReport.datasetSha256).toBe(datasetSha256);
    expect(selection.evidence.datasetSha256).toBe(datasetSha256);
    expect(darwinReport.candidatesManifestSha256).toBe(candidatesManifestSha256);
    expect(selection.evidence.candidatesManifestSha256).toBe(candidatesManifestSha256);
  });
});

describe('semantic retrieval benchmark gates', () => {
  it('enforces gates for benchmark and full evaluation modes', () => {
    expect(requiresBenchmarkGates('benchmark')).toBe(true);
    expect(requiresBenchmarkGates('full')).toBe(true);
    expect(requiresBenchmarkGates('quality')).toBe(false);
    expect(requiresBenchmarkGates('smoke')).toBe(false);
  });

  it('accepts the selected baseline with its explicit hybrid-retrieval constraint', () => {
    expect(() => assertBenchmarkGates([selectedReport()])).not.toThrow();
  });

  it('rejects a performance failure', () => {
    const report = selectedReport();
    report.performance.passed = false;
    expect(() => assertBenchmarkGates([report])).toThrow(/performance gate failed/);
  });

  it('rejects a new quality failure', () => {
    const report = selectedReport();
    const direction = report.quality.evaluation.directions.find(
      (item) => item.direction === 'en->en',
    );
    direction.relateHitAt3 = 0.7;
    report.quality.failures.push('en->en:relate_hit_at_3');
    expect(() => assertBenchmarkGates([report])).toThrow(/quality regressed/);
  });

  it('rejects degradation inside the allowed quality gap', () => {
    const report = selectedReport();
    const direction = report.quality.evaluation.directions.find(
      (item) => item.direction === selection.pureSemanticQuality.remainingDirection.direction,
    );
    direction.relateHitAt3 = 0.7;
    expect(() => assertBenchmarkGates([report])).toThrow(/quality regressed/);
  });
});

function selectedReport() {
  const report = darwinReport.reports.find(
    (item) => item.candidateId === selection.selectedCandidateId,
  );
  if (!report) throw new Error('Selected semantic retrieval report is missing');
  return structuredClone(report);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
