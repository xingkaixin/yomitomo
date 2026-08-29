import { describe, expect, it } from 'vitest';
import candidatesManifest from '../../evaluation/semantic-retrieval/candidates-v1.json';
import darwinReport from '../../evaluation/semantic-retrieval/results/darwin-arm64-candidates-v1.json';
import selectedModel from '../../evaluation/semantic-retrieval/selected-model-v1.json';
import selection from '../../evaluation/semantic-retrieval/selection-v1.json';
import { semanticRetrievalDirections } from './semantic-retrieval-evaluation.ts';

describe('semantic retrieval candidate manifest', () => {
  it('pins commercially distributable local candidates and every runtime artifact', () => {
    expect(candidatesManifest.candidates.length).toBeGreaterThanOrEqual(3);
    expect(unique(candidatesManifest.candidates.map((candidate) => candidate.id))).toHaveLength(
      candidatesManifest.candidates.length,
    );
    expect(candidatesManifest.qualityGates.directions).toEqual(semanticRetrievalDirections);

    for (const candidate of candidatesManifest.candidates) {
      expect(candidate.source.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(candidate.artifact.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(['MIT', 'Apache-2.0', 'Gemma']).toContain(candidate.source.license);
      expect(candidate.embeddingDimension).toBeGreaterThan(0);
      expect(candidate.normalization).toBe('l2');
      expect(candidate.artifact.modelId).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(candidate.artifact.files.length).toBeGreaterThanOrEqual(4);
      expect(unique(candidate.artifact.files.map((file) => file.path))).toHaveLength(
        candidate.artifact.files.length,
      );
      for (const file of candidate.artifact.files) {
        expect(file.path).not.toMatch(/^[/\\]/);
        expect(file.path.split(/[/\\]/)).not.toContain('..');
        expect(file.sizeBytes).toBeGreaterThan(0);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });
});

describe('semantic retrieval selection evidence', () => {
  it('binds every candidate result to the frozen dataset and manifest', () => {
    expect(selection.evaluatedCandidateCount).toBe(candidatesManifest.candidates.length);
    expect(selection.evidence.datasetSha256).toBe(darwinReport.datasetSha256);
    expect(selection.evidence.candidatesManifestSha256).toBe(darwinReport.candidatesManifestSha256);
    expect(unique(darwinReport.reports.map((report) => report.candidateId))).toEqual(
      candidatesManifest.candidates.map((candidate) => candidate.id).toSorted(),
    );
    for (const report of darwinReport.reports) {
      expect(report.platform).toBe('darwin-arm64');
      expect(report.runtimeLoaded).toBe(true);
      expect(report.quality.evaluation.directions).toHaveLength(semanticRetrievalDirections.length);
      for (const direction of report.quality.evaluation.directions) {
        expect(direction.relateQueryCount).toBe(
          candidatesManifest.qualityGates.minimumQueriesPerDirection,
        );
        expect(direction.askQueryCount).toBe(
          candidatesManifest.qualityGates.minimumQueriesPerDirection,
        );
      }
      expect(report.performance.assetCount).toBe(candidatesManifest.performanceGate.assetCount);
      expect(report.performance.p95LatencyMs).toBeLessThanOrEqual(
        candidatesManifest.performanceGate.maximumCandidateP95Ms,
      );
    }
  });

  it('records the closest candidate and keeps the remaining release gate explicit', () => {
    const selectedReport = reportById(selection.selectedCandidateId);
    const directionMetrics = selectedReport.quality.evaluation.directions;
    const top3Passed = directionMetrics.filter(
      (metrics) => metrics.relateHitAt3 >= candidatesManifest.qualityGates.minimumHelpfulHitAt3,
    ).length;
    const top12Passed = directionMetrics.filter(
      (metrics) =>
        metrics.askNecessaryCoverageAt12 >=
        candidatesManifest.qualityGates.minimumNecessaryCoverageAt12,
    ).length;

    expect(selectedReport.quality.passed).toBe(false);
    expect(top3Passed).toBe(selection.pureSemanticQuality.top3DirectionsPassed);
    expect(top12Passed).toBe(selection.pureSemanticQuality.top12DirectionsPassed);
    expect(selection.pureSemanticQuality.remainingFailures).toEqual(
      selectedReport.quality.failures,
    );
    expect(selection.performance).toMatchObject({
      assetCount: selectedReport.performance.assetCount,
      candidateP95Ms: selectedReport.performance.p95LatencyMs,
      coldStartMs: selectedReport.coldStartMs,
      peakRssBytes: selectedReport.peakRssBytes,
      vectorIndexBytes: selectedReport.performance.vectorIndexBytes,
    });
    expect(selection.releaseConstraints.map((constraint) => constraint.issue)).toEqual([
      'RD-968',
      'RD-973',
    ]);

    const selectedScore = qualityScore(selectedReport);
    for (const report of darwinReport.reports) {
      expect(compareQuality(qualityScore(report), selectedScore)).toBeLessThanOrEqual(0);
    }
  });
});

describe('selected semantic retrieval model', () => {
  it('copies the selected candidate into a stable internal contract without drift', () => {
    const candidate = candidateById(selection.selectedCandidateId);
    expect(selectedModel.internalId).toBe(selection.selectedInternalId);
    expect(selectedModel.source).toMatchObject(candidate.source);
    expect(selectedModel.artifact.modelId).toBe(candidate.artifact.modelId);
    expect(selectedModel.artifact.revision).toBe(candidate.artifact.revision);
    expect(
      selectedModel.artifact.files.map(({ path, sizeBytes, sha256 }) => ({
        path,
        sizeBytes,
        sha256,
      })),
    ).toEqual(candidate.artifact.files);
    expect(selectedModel.artifact.downloadSizeBytes).toBe(
      selectedModel.artifact.files.reduce((total, file) => total + file.sizeBytes, 0),
    );
    expect(selectedModel.runtime).toEqual({
      package: candidatesManifest.runtime.package,
      version: candidatesManifest.runtime.version,
      backend: candidatesManifest.runtime.backend,
      backendVersion: candidatesManifest.runtime.backendVersion,
      device: candidatesManifest.runtime.device,
      dtype: candidate.dtype,
      intraOpThreads: candidatesManifest.runtime.intraOpThreads,
      interOpThreads: 1,
      modelOutput: candidate.pooling,
    });
    expect(selectedModel.input).toEqual({
      maxTokens: candidate.maxInputTokens,
      queryPrefix: candidate.queryPrefix,
      documentPrefix: candidate.documentPrefix,
      truncation: 'end',
    });
    expect(selectedModel.vector).toEqual({
      dimension: candidate.embeddingDimension,
      normalization: candidate.normalization,
      scalar: 'float32',
      byteOrder: 'little-endian',
      layout: 'row-major',
    });
    expect(selectedModel.supportedPlatforms).toEqual(['darwin-arm64', 'win32-x64']);
    expect(selectedModel.redistributionNotices).toEqual(candidate.redistributionNotices);
    expect(selectedModel.requiredNoticeFile).toEqual(candidate.requiredNoticeFile);
    expect(selectedModel.source.licenseTermsVersion).toBe('2026-04-01');
    expect(selectedModel.source.noticeUrl).toContain('#3.1-distribution');

    const gte = candidateById('gte-multilingual-base-int8');
    expect(gte.pooling).toBe('cls');
    expect(gte.queryPrefix).toBe('');

    for (const file of selectedModel.artifact.files) {
      expect(file.url).toBe(
        `https://huggingface.co/${selectedModel.artifact.modelId}/resolve/${selectedModel.artifact.revision}/${file.path}`,
      );
    }
  });
});

function reportById(id: string) {
  const report = darwinReport.reports.find((item) => item.candidateId === id);
  if (!report) throw new Error(`Missing semantic retrieval report: ${id}`);
  return report;
}

function candidateById(id: string) {
  const candidate = candidatesManifest.candidates.find((item) => item.id === id);
  if (!candidate) throw new Error(`Missing semantic retrieval candidate: ${id}`);
  return candidate;
}

function qualityScore(report: (typeof darwinReport.reports)[number]) {
  const directions = report.quality.evaluation.directions;
  return {
    top12: directions.filter(
      (metrics) =>
        metrics.askNecessaryCoverageAt12 >=
        candidatesManifest.qualityGates.minimumNecessaryCoverageAt12,
    ).length,
    top3: directions.filter(
      (metrics) => metrics.relateHitAt3 >= candidatesManifest.qualityGates.minimumHelpfulHitAt3,
    ).length,
  };
}

function compareQuality(
  left: ReturnType<typeof qualityScore>,
  right: ReturnType<typeof qualityScore>,
) {
  return left.top12 - right.top12 || left.top3 - right.top3;
}

function unique(values: string[]) {
  return [...new Set(values)].toSorted();
}
