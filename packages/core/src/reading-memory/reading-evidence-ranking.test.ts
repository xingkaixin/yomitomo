import type { ReadingEvidence, ReadingEvidenceRole } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import {
  mergeReadingEvidenceCandidates,
  rankReadingEvidenceCandidates,
} from './reading-evidence-ranking';

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

describe('reading evidence candidate merging', () => {
  it('fuses independent route ranks and promotes agreement with stable ties', () => {
    const shared = evidence('shared', 'shared-article', 'source');
    const keyword = [
      evidence('keyword-1', 'keyword-article-1', 'source'),
      shared,
      evidence('keyword-2', 'keyword-article-2', 'source'),
    ];
    const semantic = [
      evidence('semantic-1', 'semantic-article-1', 'source'),
      shared,
      evidence('semantic-2', 'semantic-article-2', 'source'),
    ];

    expect(mergeReadingEvidenceCandidates(keyword, semantic, 6).map((item) => item.id)).toEqual([
      'shared',
      'keyword-1',
      'semantic-1',
      'keyword-2',
      'semantic-2',
    ]);
  });

  it('counts each id only once per route and preserves the first evidence instance', () => {
    const keyword = [
      evidence('first', 'article-a', 'source'),
      evidence('second', 'article-b', 'source'),
    ];
    const semantic = [
      evidence('third', 'article-c', 'source'),
      evidence('second', 'article-b', 'source'),
    ];
    const result = mergeReadingEvidenceCandidates(
      [keyword[0], keyword[0], keyword[1]],
      [semantic[0], semantic[0], semantic[1], semantic[1]],
      4,
    );

    expect(result).toEqual(mergeReadingEvidenceCandidates(keyword, semantic, 4));
    expect(result[0]).toBe(keyword[1]);
    expect(result).toHaveLength(3);
  });

  it('prefers two-route agreement even when both routes rank it last', () => {
    const shared = evidence('shared', 'shared-article', 'source');
    const route = (prefix: string) => [
      ...Array.from({ length: 39 }, (_, index) =>
        evidence(`${prefix}-${index}`, `${prefix}-article-${index}`, 'source'),
      ),
      shared,
    ];

    expect(mergeReadingEvidenceCandidates(route('keyword'), route('semantic'), 1)).toEqual([
      shared,
    ]);
  });

  it('limits each route to forty inputs and the merged output to twenty-four', () => {
    const route = (prefix: string) =>
      Array.from({ length: 41 }, (_, index) =>
        evidence(
          `${prefix}-${index}`,
          `${prefix}-article-${index}`,
          index >= 39 ? 'judgment' : 'source',
        ),
      );
    const result = mergeReadingEvidenceCandidates(
      route('keyword'),
      route('semantic'),
      Number.MAX_SAFE_INTEGER,
    );

    expect(result).toHaveLength(24);
    expect(result.slice(0, 2).map((item) => item.id)).toEqual(['keyword-39', 'semantic-39']);
    expect(result.some((item) => item.id.endsWith('-40'))).toBe(false);

    const repeated = evidence('repeated', 'article-a', 'source');
    expect(
      mergeReadingEvidenceCandidates(
        [
          ...Array.from({ length: 40 }, () => repeated),
          evidence('outside', 'article-b', 'judgment'),
        ],
        [],
        24,
      ),
    ).toEqual([repeated]);
  });

  it('diversifies judgments without moving source evidence before deferred judgments', () => {
    const keyword = [
      evidence('source-a', 'article-a', 'source'),
      evidence('judgment-a-1', 'article-a', 'judgment'),
      evidence('judgment-a-2', 'article-a', 'judgment'),
      evidence('judgment-a-3', 'article-a', 'judgment'),
      evidence('judgment-b', 'article-b', 'judgment'),
    ];
    const semantic = [evidence('source-c', 'article-c', 'source')];

    expect(mergeReadingEvidenceCandidates(keyword, semantic, 6).map((item) => item.id)).toEqual([
      'judgment-a-1',
      'judgment-a-2',
      'judgment-b',
      'judgment-a-3',
      'source-c',
      'source-a',
    ]);
  });

  it('counts judgments toward article diversity when filling source evidence', () => {
    const keyword = [
      evidence('judgment-a-1', 'article-a', 'judgment'),
      evidence('judgment-a-2', 'article-a', 'judgment'),
      evidence('source-a-1', 'article-a', 'source'),
      evidence('source-a-2', 'article-a', 'source'),
      evidence('source-b', 'article-b', 'source'),
    ];

    expect(mergeReadingEvidenceCandidates(keyword, [], 5).map((item) => item.id)).toEqual([
      'judgment-a-1',
      'judgment-a-2',
      'source-b',
      'source-a-1',
      'source-a-2',
    ]);
  });

  it('normalizes limits and supports either route on its own', () => {
    const candidates = [
      evidence('first', 'article-a', 'source'),
      evidence('second', 'article-b', 'source'),
    ];

    for (const limit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(mergeReadingEvidenceCandidates(candidates, candidates, limit)).toEqual([]);
    }
    expect(mergeReadingEvidenceCandidates(candidates, [], 1.9)).toEqual([candidates[0]]);
    expect(mergeReadingEvidenceCandidates([], candidates, 2)).toEqual(candidates);
    expect(mergeReadingEvidenceCandidates([], [], 24)).toEqual([]);
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
