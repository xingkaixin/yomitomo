import { describe, expect, it } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import type { TocItem } from '../reader-dom';
import {
  agentQueueKey,
  applyAgentCommentDelta,
  buildTocAnnotationStats,
  clampNumber,
  isNewerArticleRecord,
  normalizeUserProfile,
  toCachedArticleRecord,
} from '../reader-utils';

function annotation(): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '重要原文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 4,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [
      {
        id: 'comment_1',
        author: 'ai',
        content: '正在',
        createdAt: '2026-05-04T00:00:00.000Z',
        pending: true,
      },
    ],
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}

describe('applyAgentCommentDelta', () => {
  it('merges streamed deltas into the pending comment content', () => {
    const base = annotation();
    const first = applyAgentCommentDelta([base], 'annotation_1', 'comment_1', '回答');
    const second = applyAgentCommentDelta(first!, 'annotation_1', 'comment_1', '中');

    expect(second?.[0]?.comments[0]?.content).toBe('正在回答中');
    expect(second?.[0]).not.toBe(base);
  });
});

describe('reader utility state helpers', () => {
  it('normalizes partial desktop user profiles with local defaults', () => {
    expect(normalizeUserProfile({ nickname: 'Kevin' })).toEqual(
      expect.objectContaining({
        id: 'user_local',
        nickname: 'Kevin',
        username: 'me',
        annotationColor: '#f4c95d',
      }),
    );
  });

  it('stores lightweight article cache records and compares update time', () => {
    const record = {
      id: 'article_1',
      url: 'https://example.com/post',
      canonicalUrl: 'https://example.com/post',
      title: '文章',
      contentHtml: '<p>正文</p>',
      contentHash: 'hash_1',
      annotations: [],
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:01:00.000Z',
    };

    expect(toCachedArticleRecord(record).contentHtml).toBeUndefined();
    expect(
      isNewerArticleRecord(record, {
        ...record,
        updatedAt: '2026-05-04T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('clamps settings values and falls back for invalid numbers', () => {
    expect(clampNumber(24, 16, 32, 20)).toBe(24);
    expect(clampNumber(12, 16, 32, 20)).toBe(16);
    expect(clampNumber(Number.NaN, 16, 32, 20)).toBe(20);
  });

  it('uses agent identity for queued annotation groups and toc colors', () => {
    const agent: PublicAgent = {
      id: 'agent_1',
      kind: 'annotation',
      nickname: '阅读伙伴',
      username: 'reader',
      avatar: '',
      annotationColor: '#8ab6d6',
      annotationDensity: 'medium',
      enabled: true,
      personalityName: '克制阅读伙伴',
      temperature: 0.35,
    };
    const user: UserProfile = {
      id: 'user_local',
      nickname: '我',
      username: 'me',
      avatar: '',
      annotationColor: '#f4c95d',
      updatedAt: '2026-05-04T00:00:00.000Z',
    };
    const aiAnnotation = {
      ...annotation(),
      author: 'ai' as const,
      agentId: agent.id,
      agentUsername: agent.username,
      agentAnnotationColor: agent.annotationColor,
    };
    const toc: TocItem = {
      index: 0,
      text: '章节',
      depth: 2,
      start: 0,
      end: 10,
    };

    expect(agentQueueKey(aiAnnotation)).toBe(agent.id);
    expect(buildTocAnnotationStats([toc], [aiAnnotation], user, [agent]).get(0)).toEqual({
      count: 1,
      colors: ['#8ab6d6'],
    });
  });
});
