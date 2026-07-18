import { describe, expect, it } from 'vitest';
import type { Agent, Annotation, Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  annotationColor,
  annotationPersona,
  annotationPrimaryComment,
  annotationThoughtComments,
  annotationThreadComments,
  annotationToPublicAgent,
  annotationTypeLabel,
  appendAnnotationComment,
  commentPersona,
  createUserAnnotation,
  deleteAnnotationComment,
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
  kind: 'annotation',
  providerId: 'provider-1',
  nickname: '阅读伙伴',
  username: 'reader',
  avatar: '',
  annotationColor: '#8ab6d6',
  annotationDensity: 'medium',
  enabled: true,
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

  it('creates user annotations with trimmed optional notes', () => {
    const anchor = {
      exact: 'first principles',
      prefix: '',
      suffix: '',
      start: 0,
      end: 16,
    };

    expect(
      createUserAnnotation(anchor, user, '  这里重要  ', 'concept', {
        now: '2026-01-02T00:00:00.000Z',
        readingIntent: 'challenge',
      }),
    ).toMatchObject({
      author: 'user',
      annotationType: 'concept',
      readingIntent: 'challenge',
      comments: [{ content: '这里重要', readingIntent: 'challenge', userId: user.id }],
    });
    expect(createUserAnnotation(anchor, user, '   ').comments).toEqual([]);
  });

  it('separates annotation body comments from discussion comments', () => {
    const base = createUserAnnotation(
      {
        exact: 'first principles',
        prefix: '',
        suffix: '',
        start: 0,
        end: 16,
      },
      user,
      '批注正文',
      'concept',
      { now: '2026-01-02T00:00:00.000Z' },
    );
    const reply = {
      ...comment('comment-reply'),
      createdAt: '2026-01-02T00:01:00.000Z',
    };
    const withReply = { ...base, comments: [...base.comments, reply] };

    expect(annotationPrimaryComment(withReply)?.content).toBe('批注正文');
    expect(annotationThreadComments(withReply)).toEqual([reply]);
    expect(annotationThreadComments({ ...base, comments: [reply] })).toEqual([reply]);
  });

  it('counts only top-level thoughts separately from replies', () => {
    const thought = comment('thought');
    const reply = { ...comment('reply'), replyTo: 'thought' };
    const otherThought = comment('other-thought');
    const base = createUserAnnotation(
      {
        exact: 'first principles',
        prefix: '',
        suffix: '',
        start: 0,
        end: 16,
      },
      user,
      '批注正文',
      'concept',
      { now: '2026-01-02T00:00:00.000Z' },
    );

    expect(
      annotationThoughtComments({
        ...base,
        comments: [...base.comments, thought, reply, otherThought],
      }).map((item) => item.id),
    ).toEqual([base.comments[0].id, 'thought', 'other-thought']);
  });

  it('deletes a comment with its replies while keeping the annotation', () => {
    const root = comment('root');
    const reply = { ...comment('reply'), replyTo: 'root' };
    const other = comment('other');
    const targetAnnotation = createUserAnnotation(
      {
        exact: 'first principles',
        prefix: '',
        suffix: '',
        start: 0,
        end: 16,
      },
      user,
      '',
    );

    const result = deleteAnnotationComment(
      [{ ...targetAnnotation, id: 'annotation', comments: [root, reply, other] }],
      'annotation',
      'root',
      '2026-01-02T00:02:00.000Z',
    );

    expect(result?.[0]?.comments).toEqual([other]);
    expect(result?.[0]?.updatedAt).toBe('2026-01-02T00:02:00.000Z');
  });

  it('finds mentioned agents by username once', () => {
    const agents: PublicAgent[] = [
      {
        id: 'a',
        kind: 'annotation',
        nickname: 'A',
        username: 'reader',
        avatar: '',
        annotationColor: '#8ab6d6',
        annotationDensity: 'medium',
        enabled: true,
        personalityName: '克制阅读伙伴',
        temperature: 0.35,
      },
    ];

    expect(findMentionedAgents('@reader @reader @missing', agents)).toEqual(agents);
  });

  it('finds mentioned agents by Chinese display name', () => {
    const agents: PublicAgent[] = [
      {
        id: 'a',
        kind: 'annotation',
        nickname: '林知微',
        username: '林知微',
        avatar: '',
        annotationColor: '#8ab6d6',
        annotationDensity: 'medium',
        enabled: true,
        personalityName: '页边同读者',
        temperature: 0.35,
      },
    ];

    expect(findMentionedAgents('请 @林知微 看看', agents)).toEqual(agents);
  });

  it('detects and replaces the mention under caret', () => {
    const query = getMentionQuery('ask @rea', 8);

    expect(query).toEqual({ query: 'rea', start: 4, end: 8 });
    expect(replaceMentionQuery('ask @rea today', query!, 'reader')).toBe('ask @reader  today');
  });

  it('builds public personas and colors from annotation identity fields', () => {
    const aiAnnotation = {
      ...annotation(),
      author: 'ai' as const,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
      agentAnnotationColor: agent.annotationColor,
    };
    const aiComment = {
      ...comment(),
      author: 'ai' as const,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
    };
    const publicAgent: PublicAgent = {
      id: agent.id,
      kind: agent.kind,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      enabled: agent.enabled,
      personalityName: '克制阅读伙伴',
      temperature: agent.temperature,
    };

    expect(annotationPersona(aiAnnotation, user, [publicAgent])).toEqual({
      avatar: agent.avatar,
      fallback: 'AI',
      color: agent.annotationColor,
      nickname: agent.nickname,
      username: agent.username,
    });
    expect(commentPersona(aiComment, user, [publicAgent])).toEqual({
      avatar: agent.avatar,
      fallback: 'AI',
      color: '#8ab6d6',
      nickname: agent.nickname,
      username: agent.username,
    });
    expect(annotationColor(aiAnnotation, user, [])).toBe(agent.annotationColor);
    expect(annotationToPublicAgent(aiAnnotation)).toEqual(
      expect.objectContaining({
        id: agent.id,
        nickname: agent.nickname,
        username: agent.username,
      }),
    );
  });

  it('normalizes public labels', () => {
    expect(annotationTypeLabel('assumption')).toBe('前提漏洞');
  });
});
