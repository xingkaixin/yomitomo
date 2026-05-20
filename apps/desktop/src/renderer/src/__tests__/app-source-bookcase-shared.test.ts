import { describe, expect, it, vi } from 'vitest';
import type {
  AgentMentionRoutePlan,
  Annotation,
  ArticleRecord,
  PublicAgent,
} from '@yomitomo/shared';
import {
  agentInstructionFromNote,
  articleWithMergedAgentAnnotation,
  planSelectionMentionRoute,
  routeFocusReadingPlanMessages,
  targetAnchorReadingPlan,
} from '../app-source-bookcase-shared';

function agent(overrides: Partial<PublicAgent> = {}): PublicAgent {
  return {
    id: 'agent_lin',
    kind: 'annotation',
    presetId: 'lin',
    enabled: true,
    nickname: 'lin',
    username: 'lin',
    avatar: '',
    annotationColor: '#8a8f4f',
    annotationDensity: 'medium',
    temperature: 0.4,
    personalityName: 'Lin',
    ...overrides,
  };
}

describe('agentInstructionFromNote', () => {
  it('removes mentioned agent handles from the note instruction', () => {
    expect(agentInstructionFromNote('@lin 解释这里', [agent()])).toBe('解释这里');
  });

  it('uses both username and nickname as mention handles', () => {
    expect(agentInstructionFromNote('@reader 总结一下', [agent({ nickname: 'reader' })])).toBe(
      '总结一下',
    );
  });
});

describe('targetAnchorReadingPlan', () => {
  const anchor: Annotation['anchor'] = {
    exact: '原文',
    prefix: '',
    suffix: '',
    start: 4,
    end: 8,
  };

  it('returns an empty plan without a target anchor', () => {
    expect(targetAnchorReadingPlan(undefined, 'explain')).toEqual([]);
  });

  it('builds a selected-anchor plan without a reading intent', () => {
    expect(targetAnchorReadingPlan(anchor, undefined)).toEqual([
      {
        sectionId: 'target-selection',
        sectionTitle: '选区',
        sectionStart: 4,
        sectionEnd: 8,
      },
    ]);
  });

  it('builds a single-section plan for the selected anchor', () => {
    expect(targetAnchorReadingPlan(anchor, 'challenge')).toEqual([
      {
        sectionId: 'target-selection',
        sectionTitle: '选区',
        sectionStart: 4,
        sectionEnd: 8,
        readingIntent: 'challenge',
      },
    ]);
  });
});

describe('articleWithMergedAgentAnnotation', () => {
  const anchor: Annotation['anchor'] = {
    exact: '用户划线',
    prefix: '',
    suffix: '',
    start: 4,
    end: 8,
  };
  const userAnnotation: Annotation = {
    id: 'user-note',
    anchor,
    author: 'user',
    color: '#f4c95d',
    userId: 'user-1',
    userUsername: 'kevin',
    userNickname: 'Kevin',
    comments: [],
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  };
  const agentAnnotation: Annotation = {
    id: 'agent-note',
    anchor,
    author: 'ai',
    color: '#8a8f4f',
    agentId: 'agent_lin',
    agentUsername: 'lin',
    agentNickname: 'lin',
    comments: [
      {
        id: 'comment-1',
        author: 'ai',
        content: '助手想法',
        agentId: 'agent_lin',
        agentUsername: 'lin',
        agentNickname: 'lin',
        createdAt: '2026-05-20T00:00:01.000Z',
      },
    ],
    createdAt: '2026-05-20T00:00:01.000Z',
    updatedAt: '2026-05-20T00:00:01.000Z',
  };
  const staleArticle = {
    id: 'article-1',
    sourceType: 'web',
    url: 'https://example.com',
    canonicalUrl: 'https://example.com',
    title: '文章',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash',
    annotations: [],
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
  } as ArticleRecord;

  it('persists the current user-owned merge over a stale article snapshot', () => {
    const mergedUserAnnotation = {
      ...userAnnotation,
      comments: agentAnnotation.comments,
      updatedAt: agentAnnotation.updatedAt,
    };
    const result = articleWithMergedAgentAnnotation(staleArticle, agentAnnotation, {
      activeId: userAnnotation.id,
      annotations: [mergedUserAnnotation],
    });

    expect(result.activeId).toBe(userAnnotation.id);
    expect(result.article.annotations).toHaveLength(1);
    expect(result.article.annotations[0]).toMatchObject({
      id: userAnnotation.id,
      author: 'user',
      userUsername: 'kevin',
      comments: agentAnnotation.comments,
    });
  });
});

describe('planSelectionMentionRoute', () => {
  const anchor: Annotation['anchor'] = {
    exact: '原文',
    prefix: '',
    suffix: '',
    start: 4,
    end: 8,
  };

  it('does not call the gate without mentioned agents', async () => {
    const desktop = { planAgentMentionRoute: vi.fn() };
    const route = await planSelectionMentionRoute({
      desktop,
      note: '我的想法',
      targetAnchor: anchor,
      agents: [],
      article: { title: '标题', url: '', text: '正文' },
    });

    expect(route).toEqual({ createUserThought: true, directives: [] });
    expect(desktop.planAgentMentionRoute).not.toHaveBeenCalled();
  });

  it('does not create a user thought for pure mentions when the gate is unavailable', async () => {
    const lin = agent();
    const zhou = agent({ id: 'agent_zhou', username: 'zhou', nickname: 'zhou' });

    const route = await planSelectionMentionRoute({
      desktop: undefined,
      note: '@lin @zhou',
      targetAnchor: anchor,
      agents: [lin, zhou],
      article: { title: '标题', url: '', text: '正文' },
    });

    expect(route.createUserThought).toBe(false);
    expect(route.directives).toEqual([
      {
        agentId: lin.id,
        agentUsername: lin.username,
        action: 'comment',
        instruction: undefined,
      },
      {
        agentId: zhou.id,
        agentUsername: zhou.username,
        action: 'comment',
        instruction: undefined,
      },
    ]);
  });
});

describe('routeFocusReadingPlanMessages', () => {
  it('routes mentioned section messages as create-thought instructions', async () => {
    const lin = agent();
    const zhou = agent({ id: 'agent_zhou', username: 'zhou', nickname: 'zhou' });
    const route: AgentMentionRoutePlan = {
      createUserThought: false,
      directives: [
        {
          agentId: zhou.id,
          agentUsername: zhou.username,
          action: 'create_thought',
          instruction: '提出反方想法',
          readingIntent: 'challenge',
        },
      ],
    };
    const desktop = { planAgentMentionRoute: vi.fn(async () => route) };

    const readingPlan = await routeFocusReadingPlanMessages({
      desktop,
      agent: zhou,
      agents: [lin, zhou],
      article: { title: '标题', url: '', text: '这是一段章节正文。' },
      readingPlan: [
        {
          sectionId: 's1',
          sectionTitle: '第一节',
          sectionStart: 0,
          sectionEnd: 8,
          messages: [
            {
              content: '@lin 解释一下，@zhou 从反方看',
            },
          ],
        },
      ],
    });

    expect(readingPlan[0]?.messages?.map((message) => message.content)).toEqual(['提出反方想法']);
    expect(desktop.planAgentMentionRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedActions: ['create_thought'],
        agents: [lin, zhou],
      }),
    );
  });
});
