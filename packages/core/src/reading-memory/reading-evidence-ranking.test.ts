import type { ReadingEvidence, ReadingEvidenceRole } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import {
  mergeReadingEvidenceCandidates,
  rankReadingEvidenceCandidates,
} from './reading-evidence-ranking';

describe('reading evidence ranking', () => {
  it('keeps need-evidence judgments behind other candidates on both retrieval paths', () => {
    const uncertain = {
      ...evidence('uncertain', 'article-u', 'judgment'),
      review: { decision: 'need_evidence' as const, reviewedAt: '2026-08-30T00:00:00.000Z' },
    };
    const judgment = evidence('judgment', 'article-j', 'judgment');
    const source = evidence('source', 'article-s', 'source');
    expect(rankReadingEvidenceCandidates([uncertain, source, judgment], 3)).toEqual([
      judgment,
      source,
      uncertain,
    ]);
    expect(mergeReadingEvidenceCandidates([uncertain, source, judgment], [uncertain], 3)).toEqual([
      judgment,
      source,
      uncertain,
    ]);
    const reaffirmed = {
      ...uncertain,
      review: { ...uncertain.review, decision: 'still_agree' as const },
    };
    expect(rankReadingEvidenceCandidates([reaffirmed, source, judgment], 3)).toEqual([
      reaffirmed,
      judgment,
      source,
    ]);
  });

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
