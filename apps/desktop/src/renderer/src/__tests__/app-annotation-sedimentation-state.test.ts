import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import {
  acceptedDraftPreviewChanges,
  draftPreviewDecisionsForProposals,
  draftPreviewDraft,
  draftPreviewStatusesFromDecisions,
  hasPendingDraftPreviewDecisions,
  publishedDistillationArticle,
  unpublishedDistillationArticle,
} from '../annotation-discussion/app-annotation-sedimentation-state';
import type { DistillationProposalDraftChangeSet } from '../annotation-discussion/app-annotation-sedimentation-proposals';

const now = '2026-06-22T08:00:00.000Z';
const later = '2026-06-22T08:30:00.000Z';

describe('app annotation sedimentation state', () => {
  it('publishes and unpublishes distillation without losing review sessions', () => {
    const reviewSessions = [
      {
        id: 'review_session_1',
        agentId: 'agent_1',
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
    const sourceArticle = article({
      distillation: {
        status: 'unpublished',
        content: '旧草稿',
        reviewSessions,
      },
    });

    const published = publishedDistillationArticle({
      annotationId: 'annotation_1',
      article: sourceArticle,
      content: '新沉淀',
      now,
    });

    expect(published.updatedAt).toBe(now);
    expect(published.annotations[0]?.updatedAt).toBe(now);
    expect(published.annotations[0]?.distillation).toMatchObject({
      status: 'published',
      content: '新沉淀',
      publishedAt: now,
      updatedAt: now,
      reviewSessions,
    });

    const unpublished = unpublishedDistillationArticle({
      annotationId: 'annotation_1',
      article: published,
      fallbackContent: 'fallback',
      now: later,
    });

    expect(unpublished.annotations[0]?.distillation).toMatchObject({
      status: 'unpublished',
      content: '新沉淀',
      publishedAt: now,
      updatedAt: later,
      reviewSessions,
    });
  });

  it('turns draft preview decisions into draft changes and proposal statuses', () => {
    const proposals = [
      {
        id: 'proposal_1',
        kind: 'insert' as const,
        status: 'pending' as const,
        title: '补充',
        content: '补充判断。',
        updatedAt: now,
      },
      {
        id: 'proposal_2',
        kind: 'replace' as const,
        status: 'pending' as const,
        title: '改写',
        targetText: '旧判断',
        replacementText: '新判断',
        updatedAt: now,
      },
    ];
    const changeSet: DistillationProposalDraftChangeSet = {
      baseDraft: '旧判断',
      draft: '新判断\n补充判断。',
      changes: [
        {
          kind: 'replace',
          proposalId: 'proposal_2',
          baseDraft: '旧判断',
          draft: '新判断',
          range: { start: 0, end: 3 },
          deletedText: '旧判断',
          insertedText: '新判断',
          changeOffset: 0,
          changeLength: 3,
        },
        {
          kind: 'insert',
          proposalId: 'proposal_1',
          baseDraft: '旧判断',
          draft: '旧判断\n补充判断。',
          range: { start: 3, end: 3 },
          insertedText: '补充判断。',
          originalInsertedText: '补充判断。',
          changeOffset: 3,
          changeLength: 6,
        },
      ],
    };

    const initialDecisions = draftPreviewDecisionsForProposals(proposals);
    expect(initialDecisions).toEqual({ proposal_1: 'pending', proposal_2: 'pending' });
    expect(hasPendingDraftPreviewDecisions(initialDecisions)).toBe(true);

    const decisions = { proposal_1: 'accepted', proposal_2: 'rejected' } as const;
    expect(hasPendingDraftPreviewDecisions(decisions)).toBe(false);
    expect(
      acceptedDraftPreviewChanges(changeSet, decisions).map((change) => change.proposalId),
    ).toEqual(['proposal_1']);
    expect(draftPreviewDraft(changeSet, decisions)).toBe('旧判断\n补充判断。');
    expect(draftPreviewStatusesFromDecisions(decisions)).toEqual({
      proposal_1: 'accepted',
      proposal_2: 'ignored',
    });
  });
});

function article(annotationOverride: Partial<Annotation> = {}): ArticleRecord {
  return {
    id: 'article_1',
    title: '文章',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    sourceType: 'web',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    excerpt: '正文',
    byline: '',
    siteName: 'Example',
    createdAt: now,
    updatedAt: now,
    annotations: [annotation(annotationOverride)],
  };
}

function annotation(input: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 2,
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f59e0b',
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}
