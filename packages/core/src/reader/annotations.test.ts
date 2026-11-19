import { describe, expect, it } from 'vitest';
import type { Comment, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  annotationColor,
  annotationCommentThreads,
  annotationUserAuthorRef,
  createUserAnnotation,
  deleteAnnotationComment,
  editUserComment,
  findMentionedAgents,
  isEditableUserComment,
  setAnnotationColor,
} from './annotations';

const user: UserProfile = {
  id: 'user-1',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function comment(id = 'comment-1'): Comment {
  return {
    id,
    author: annotationUserAuthorRef(user),
    content: 'note',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('annotation core', () => {
  it('groups nested, orphaned and cyclic comment chains without crossing discussions', () => {
    const comments = [
      comment('root-a'),
      comment('root-b'),
      { ...comment('reply-b'), replyTo: 'root-b' },
      { ...comment('nested-b'), replyTo: 'reply-b' },
      { ...comment('orphan'), replyTo: 'missing' },
      { ...comment('orphan-child'), replyTo: 'orphan' },
      { ...comment('cycle-a'), replyTo: 'cycle-b' },
      { ...comment('cycle-b'), replyTo: 'cycle-a' },
    ];

    expect(
      annotationCommentThreads(comments).map(({ root, replies }) => [
        root.id,
        replies.map((reply) => reply.id),
      ]),
    ).toEqual([
      ['root-a', []],
      ['root-b', ['reply-b', 'nested-b']],
      ['orphan', ['orphan-child']],
      ['cycle-a', ['cycle-b']],
    ]);
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

  it('edits only non-pending user comments and ignores empty or unchanged text', () => {
    const ownComment = comment('own');
    const aiComment: Comment = {
      id: 'ai-1',
      author: { kind: 'agent', agentId: 'a1', username: 'reader', nickname: 'Reader' },
      content: 'AI thought',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const pendingComment: Comment = { ...ownComment, pending: true };

    expect(isEditableUserComment(ownComment, user)).toBe(true);
    expect(isEditableUserComment(aiComment, user)).toBe(false);
    expect(isEditableUserComment(pendingComment, user)).toBe(false);

    expect(editUserComment(ownComment, '  updated note  ')).toEqual({
      ...ownComment,
      content: 'updated note',
    });
    expect(editUserComment(ownComment, 'note')).toBeNull();
    expect(editUserComment(ownComment, '   ')).toBeNull();
    expect(editUserComment(aiComment, 'rewritten')).toBeNull();
  });

  it('preserves per-annotation highlight color overrides across global color changes', () => {
    const anchor = { exact: 'passage', prefix: '', suffix: '', start: 0, end: 7 };
    const defaultHighlight = createUserAnnotation(anchor, user, 'thought');
    const recolored = setAnnotationColor(defaultHighlight, '#6fa48f', '2026-01-02T00:00:00.000Z');
    const updatedUser: UserProfile = { ...user, annotationColor: '#8ab6d6' };

    expect(annotationColor(defaultHighlight, updatedUser, [])).toBe('#8ab6d6');
    expect(annotationColor(recolored, updatedUser, [])).toBe('#6fa48f');

    const recoloredBackToOriginal = setAnnotationColor(
      defaultHighlight,
      user.annotationColor,
      '2026-01-02T00:01:00.000Z',
    );
    expect(annotationColor(recoloredBackToOriginal, updatedUser, [])).toBe('#f4c95d');
  });
});
