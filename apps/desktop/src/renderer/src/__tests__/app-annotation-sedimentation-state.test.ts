import { describe, expect, it } from 'vitest';
import { hashText, type Annotation, type ArticleRecord, type PublicAgent } from '@yomitomo/shared';
import {
  acceptedDraftPreviewChanges,
  annotationWithReviewSession,
  appendReviewItemToMessage,
  articleWithReviewProposalStatuses,
  createReviewSession,
  draftPreviewDecisionsForProposals,
  draftPreviewDraft,
  draftPreviewStatusesFromDecisions,
  hasPendingDraftPreviewDecisions,
  organizeProposalDecisionSets,
  pendingOrganizeProposals,
  publishedDistillationArticle,
  reviewMessageWithProposalSource,
  reviewTimelineMessages,
  unpublishedDistillationArticle,
  updateSessionMessage,
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

  it('creates, upserts, and updates review session messages', () => {
    const agent = publicAgent();
    const session = createReviewSession(agent, now, 'review_session_1');

    expect(session).toMatchObject({
      id: 'review_session_1',
      agentId: 'agent_1',
      agentUsername: 'zhou',
      agentNickname: '周现',
      createdAt: now,
      updatedAt: now,
    });

    const annotationWithNewSession = annotationWithReviewSession({
      annotation: annotation(),
      session,
      now,
    });
    expect(annotationWithNewSession.distillation?.reviewSessions).toEqual([session]);

    const updatedSession = {
      ...session,
      messages: [
        {
          id: 'message_1',
          author: 'ai' as const,
          content: '',
          createdAt: now,
        },
      ],
    };
    const annotationWithUpdatedSession = annotationWithReviewSession({
      annotation: annotationWithNewSession,
      session: updatedSession,
      now: later,
    });
    expect(annotationWithUpdatedSession.distillation?.reviewSessions).toEqual([updatedSession]);
    expect(annotationWithUpdatedSession.distillation?.updatedAt).toBe(later);

    const sessionWithContent = updateSessionMessage(
      updatedSession,
      'message_1',
      (message) => ({ ...message, content: '审阅完成' }),
      later,
    );
    expect(sessionWithContent.updatedAt).toBe(later);
    expect(sessionWithContent.messages[0]?.content).toBe('审阅完成');
  });

  it('adds proposal source metadata to streamed review items and messages', () => {
    const proposal = {
      id: 'proposal_1',
      kind: 'insert' as const,
      status: 'pending' as const,
      title: '新增判断',
      content: '补一条判断。',
      updatedAt: now,
    };
    const source = {
      sourceDraftHash: hashText('草稿'),
      sourceReviewSessionId: 'review_session_1',
      sourceReviewMessageId: 'message_1',
      sourceAgentId: 'agent_1',
    };
    const message = appendReviewItemToMessage(
      {
        id: 'message_1',
        author: 'ai',
        content: '',
        createdAt: now,
      },
      {
        id: 'item_1',
        type: 'proposal',
        proposal,
      },
    );

    const sourced = reviewMessageWithProposalSource(message, source);

    expect(sourced.items?.[0]).toMatchObject({
      type: 'proposal',
      proposal: expect.objectContaining(source),
    });
    expect(sourced.proposals?.[0]).toMatchObject(source);
  });

  it('builds stable review timeline messages across sessions', () => {
    const agents = [publicAgent()];
    const userMessage = {
      id: 'user_message_1',
      author: 'user' as const,
      content: '请看证据',
      createdAt: now,
    };
    const sessions = [
      {
        id: 'review_session_2',
        agentId: 'agent_1',
        agentUsername: 'zhou',
        agentNickname: '周现',
        messages: [
          {
            id: 'assistant_message_2',
            author: 'ai' as const,
            content: '第二条',
            createdAt: later,
          },
        ],
        createdAt: now,
        updatedAt: later,
      },
      {
        id: 'review_session_1',
        agentId: 'agent_1',
        agentUsername: 'zhou',
        agentNickname: '周现',
        messages: [
          userMessage,
          {
            id: 'assistant_message_1',
            author: 'ai' as const,
            content: '第一条',
            createdAt: now,
          },
          userMessage,
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];

    const timeline = reviewTimelineMessages(sessions, agents);

    expect(timeline.map((item) => item.key)).toEqual([
      'user:user_message_1',
      'assistant:review_session_1:assistant_message_1',
      'assistant:review_session_2:assistant_message_2',
    ]);
    expect(timeline[1]?.message).toMatchObject({
      agentId: 'agent_1',
      agentUsername: 'zhou',
      agentNickname: '周现',
      agentAvatar: 'avatar',
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

  it('filters and records organize proposal decisions', () => {
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
        kind: 'insert' as const,
        status: 'pending' as const,
        title: '已经放弃',
        content: '不用的判断。',
        updatedAt: now,
      },
    ];

    expect(
      pendingOrganizeProposals(proposals, new Set(['proposal_3']), new Set(['proposal_2'])).map(
        (proposal) => proposal.id,
      ),
    ).toEqual(['proposal_1']);

    const result = organizeProposalDecisionSets({
      appliedProposalIds: new Set(['proposal_0']),
      dismissedProposalIds: new Set(['proposal_2']),
      decisions: {
        proposal_1: 'accepted',
        proposal_2: 'rejected',
      },
    });

    expect(Array.from(result.appliedProposalIds)).toEqual(['proposal_0', 'proposal_1']);
    expect(Array.from(result.dismissedProposalIds)).toEqual(['proposal_2']);
  });

  it('updates review proposal statuses through the article boundary', () => {
    const sourceArticle = article({
      distillation: {
        status: 'unpublished',
        content: '草稿',
        reviewSessions: [
          {
            id: 'review_session_1',
            agentId: 'agent_1',
            messages: [
              {
                id: 'message_1',
                author: 'ai',
                content: '建议',
                createdAt: now,
                proposals: [
                  {
                    id: 'proposal_1',
                    kind: 'insert',
                    status: 'pending',
                    title: '补充',
                    content: '补充判断。',
                    updatedAt: now,
                  },
                ],
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    });

    const nextArticle = articleWithReviewProposalStatuses({
      annotation: sourceArticle.annotations[0],
      article: sourceArticle,
      messageId: 'message_1',
      now: later,
      proposalStatusById: { proposal_1: 'accepted' },
    });

    expect(nextArticle.updatedAt).toBe(later);
    expect(
      nextArticle.annotations[0]?.distillation?.reviewSessions?.[0]?.messages[0]?.proposals,
    ).toEqual([
      expect.objectContaining({
        id: 'proposal_1',
        status: 'accepted',
        updatedAt: later,
      }),
    ]);
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
    author: 'user',
    color: '#f59e0b',
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...input,
  };
}

function publicAgent(): PublicAgent {
  return {
    id: 'agent_1',
    kind: 'review',
    enabled: true,
    username: 'zhou',
    nickname: '周现',
    avatar: 'avatar',
    annotationColor: '#94a3b8',
    annotationDensity: 'medium',
    personalityName: '周现',
    temperature: 0.5,
  };
}
