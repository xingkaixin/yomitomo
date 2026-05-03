import { describe, expect, it } from 'vitest';
import type { Agent, Annotation, Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  appendAnnotationComment,
  createAgentAnnotation,
  findMentionedAgents,
  getMentionQuery,
  replaceMentionQuery,
  updateAnnotationComment,
} from './annotations';

const user: UserProfile = {
  id: 'user-1',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const agent: Agent = {
  id: 'agent-1',
  providerId: 'provider-1',
  nickname: '阅读伙伴',
  username: 'reader',
  avatar: '',
  annotationColor: '#8ab6d6',
  annotationDensity: 'medium',
  temperature: 0.35,
  soul: 'test',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function annotation(): Annotation {
  return {
    id: 'annotation-1',
    anchor: {
      exact: 'first principles',
      prefix: '',
      suffix: '',
      start: 0,
      end: 16,
    },
    author: 'user',
    color: user.annotationColor,
    userId: user.id,
    userUsername: user.username,
    userNickname: user.nickname,
    userAvatar: user.avatar,
    userAnnotationColor: user.annotationColor,
    comments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function comment(id = 'comment-1'): Comment {
  return {
    id,
    author: 'user',
    content: 'note',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('annotation core', () => {
  it('creates agent annotations from exact article text', () => {
    const result = createAgentAnnotation(
      agent,
      'A first principles note.',
      { exact: 'first principles', comment: 'good point' },
      '2026-01-02T00:00:00.000Z',
    );

    expect(result?.author).toBe('ai');
    expect(result?.annotationType).toBe('key_point');
    expect(result?.anchor.start).toBe(2);
    expect(result?.comments[0]?.content).toBe('good point');
  });

  it('returns null when agent suggestion cannot be anchored', () => {
    expect(
      createAgentAnnotation(agent, 'A first principles note.', {
        exact: 'missing text',
        comment: 'good point',
      }),
    ).toBeNull();
  });

  it('updates annotation comments immutably', () => {
    const base = annotation();
    const added = appendAnnotationComment([base], base.id, comment(), '2026-01-02T00:00:00.000Z');
    const updated = updateAnnotationComment(
      added!,
      base.id,
      'comment-1',
      (item) => ({ ...item, content: 'changed' }),
      '2026-01-03T00:00:00.000Z',
    );

    expect(added?.[0]).not.toBe(base);
    expect(updated?.[0]?.comments[0]?.content).toBe('changed');
    expect(updated?.[0]?.updatedAt).toBe('2026-01-03T00:00:00.000Z');
  });

  it('finds mentioned agents by username once', () => {
    const agents: PublicAgent[] = [
      {
        id: 'a',
        nickname: 'A',
        username: 'reader',
        avatar: '',
        annotationColor: '#8ab6d6',
        annotationDensity: 'medium',
        temperature: 0.35,
      },
    ];

    expect(findMentionedAgents('@reader @reader @missing', agents)).toEqual(agents);
  });

  it('detects and replaces the mention under caret', () => {
    const query = getMentionQuery('ask @rea', 8);

    expect(query).toEqual({ query: 'rea', start: 4, end: 8 });
    expect(replaceMentionQuery('ask @rea today', query!, 'reader')).toBe('ask @reader  today');
  });
});
