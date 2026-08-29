import type { ReadingEvidence, ReadingEvidenceRole } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import { rankReadingEvidenceCandidates } from './reading-evidence-ranking';

describe('reading evidence ranking', () => {
  it('deduplicates by evidence id and prioritizes judgments without disturbing FTS order', () => {
    const candidates = [
      evidence('source-a', 'article-a', 'source'),
      evidence('judgment-b', 'article-b', 'judgment'),
      evidence('judgment-a', 'article-a', 'judgment'),
      evidence('judgment-b', 'article-b', 'judgment'),
      evidence('source-c', 'article-c', 'source'),
    ];

    expect(rankReadingEvidenceCandidates(candidates, 5).map((candidate) => candidate.id)).toEqual([
      'judgment-b',
      'judgment-a',
      'source-a',
      'source-c',
    ]);
  });

  it('limits the first pass contribution from one article', () => {
    const candidates = [
      evidence('a-1', 'article-a', 'judgment'),
      evidence('a-2', 'article-a', 'judgment'),
      evidence('a-3', 'article-a', 'judgment'),
      evidence('b-1', 'article-b', 'judgment'),
      evidence('c-1', 'article-c', 'judgment'),
    ];

    expect(rankReadingEvidenceCandidates(candidates, 4).map((candidate) => candidate.id)).toEqual([
      'a-1',
      'a-2',
      'b-1',
      'c-1',
    ]);
  });

  it('backfills deferred candidates when diversity cannot fill the limit', () => {
    const candidates = [
      evidence('a-1', 'article-a', 'source'),
      evidence('a-2', 'article-a', 'source'),
      evidence('a-3', 'article-a', 'source'),
      evidence('a-4', 'article-a', 'source'),
    ];

    expect(rankReadingEvidenceCandidates(candidates, 4).map((candidate) => candidate.id)).toEqual([
      'a-1',
      'a-2',
      'a-3',
      'a-4',
    ]);
  });

  it('places a diverse source before an over-limit judgment and backfills by role', () => {
    const candidates = [
      evidence('source-c', 'article-c', 'source'),
      evidence('judgment-a-1', 'article-a', 'judgment'),
      evidence('judgment-a-2', 'article-a', 'judgment'),
      evidence('judgment-a-3', 'article-a', 'judgment'),
      evidence('judgment-b', 'article-b', 'judgment'),
      evidence('source-d', 'article-d', 'source'),
    ];

    expect(rankReadingEvidenceCandidates(candidates, 6).map((candidate) => candidate.id)).toEqual([
      'judgment-a-1',
      'judgment-a-2',
      'judgment-b',
      'source-c',
      'source-d',
      'judgment-a-3',
    ]);
  });

  it('handles non-positive and oversized limits without exceeding the candidates', () => {
    const candidates = [
      evidence('a-1', 'article-a', 'source'),
      evidence('a-2', 'article-a', 'source'),
      evidence('a-3', 'article-a', 'source'),
      evidence('b-1', 'article-b', 'source'),
    ];

    expect(rankReadingEvidenceCandidates(candidates, 0)).toEqual([]);
    expect(rankReadingEvidenceCandidates(candidates, -1)).toEqual([]);
    expect(rankReadingEvidenceCandidates(candidates, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(rankReadingEvidenceCandidates(candidates, Number.MAX_SAFE_INTEGER)).toEqual(candidates);
  });
});

function evidence(id: string, articleId: string, role: ReadingEvidenceRole): ReadingEvidence {
  return {
    id,
    assetType: role === 'judgment' ? 'comment' : 'annotation',
    role,
    content: id,
    sourceVersion: 'source-v1',
    source: {
      ref: { kind: 'article', id: articleId },
      sourceType: 'web',
      title: articleId,
    },
    location: {
      annotationId: `annotation:${id}`,
      anchor: { exact: id, prefix: '', suffix: '', start: 0, end: id.length },
    },
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  };
}
