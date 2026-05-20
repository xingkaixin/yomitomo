// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
} from '@yomitomo/shared';
import { runSourceAgentCommentRequest } from '../app-source-agent-comment-request';

const now = '2026-05-17T06:00:00.000Z';

const agent: PublicAgent = {
  id: 'agent_lin',
  kind: 'annotation',
  enabled: true,
  nickname: '林知微',
  username: 'linzhiwei',
  avatar: '',
  annotationColor: '#8a8f4f',
  annotationDensity: 'medium',
  personalityName: '林知微',
  temperature: 0.4,
};

function article(targetAnnotation: Annotation): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '网页文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [targetAnnotation],
    createdAt: now,
    updatedAt: now,
  };
}

function comment(overrides: Partial<AnnotationComment> = {}): AnnotationComment {
  return {
    id: 'comment_root',
    author: 'user',
    content: '根想法',
    createdAt: now,
    userId: 'user_1',
    userUsername: 'kevin',
    userNickname: 'Kevin',
    ...overrides,
  };
}

function annotation(comments: AnnotationComment[]): Annotation {
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
    color: '#f4c95d',
    comments,
    createdAt: now,
    updatedAt: now,
    userId: 'user_1',
    userUsername: 'kevin',
    userNickname: 'Kevin',
  };
}

describe('runSourceAgentCommentRequest', () => {
  it('shows a pending reply before the stream starts', async () => {
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]!);
    });
    const saveAnnotations = vi.fn(async (annotations: Annotation[]) => {
      annotationsRef.current = annotations;
    });
    const desktop = {
      requestAgentCommentStream: vi.fn(async (_payload, onEvent) => {
        const pendingReply = annotationsRef.current[0]?.comments.find(
          (item) => item.author === 'ai',
        );
        expect(pendingReply).toEqual(
          expect.objectContaining({
            agentId: agent.id,
            pending: true,
            replyTo: rootComment.id,
          }),
        );
        onEvent({
          type: 'start',
          comment: {
            id: 'comment_agent',
            author: 'ai',
            content: '',
            createdAt: now,
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            pending: true,
          },
        });
        return {
          id: 'comment_agent',
          author: 'ai' as const,
          content: '我先回应这条想法。',
          createdAt: now,
          agentId: agent.id,
          agentUsername: agent.username,
          agentNickname: agent.nickname,
          pending: false,
        };
      }),
    };

    await runSourceAgentCommentRequest({
      agent,
      annotation: targetAnnotation,
      userComment: rootComment,
      desktop,
      currentArticle: article(targetAnnotation),
      articleText: '正文',
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage: vi.fn(),
    });

    expect(applyAnnotations.mock.invocationCallOrder[0]).toBeLessThan(
      desktop.requestAgentCommentStream.mock.invocationCallOrder[0]!,
    );
    expect(annotationsRef.current[0]?.comments).toContainEqual(
      expect.objectContaining({
        id: 'comment_agent',
        content: '我先回应这条想法。',
        pending: false,
        replyTo: rootComment.id,
      }),
    );
  });

  it('restores a streaming reply when a stale article update removes the pending comment', async () => {
    const rootComment = comment();
    const replyComment = comment({
      id: 'comment_reply',
      content: '@linzhiwei 你怎么看',
      replyTo: rootComment.id,
    });
    const targetAnnotation = annotation([rootComment, replyComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]!);
    });
    const saveAnnotations = vi.fn(async (annotations: Annotation[]) => {
      annotationsRef.current = annotations;
    });
    const pendingAgentComment = {
      id: 'comment_agent',
      author: 'ai' as const,
      content: '',
      createdAt: now,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      pending: true,
    };
    const finalAgentComment = {
      ...pendingAgentComment,
      content: '我会先看这句里的判断。',
      replyTo: rootComment.id,
      pending: false,
    };
    const desktop = {
      requestAgentCommentStream: vi.fn(async (_payload, onEvent) => {
        onEvent({ type: 'start', comment: pendingAgentComment });
        annotationsRef.current = [targetAnnotation];
        onEvent({ type: 'delta', delta: '我会先看' });
        return finalAgentComment;
      }),
    };

    await runSourceAgentCommentRequest({
      agent,
      annotation: targetAnnotation,
      userComment: replyComment,
      desktop,
      currentArticle: article(targetAnnotation),
      articleText: '正文',
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage: vi.fn(),
    });

    const savedComment = annotationsRef.current[0]?.comments.find(
      (item) => item.id === finalAgentComment.id,
    );
    expect(savedComment).toEqual(
      expect.objectContaining({
        content: finalAgentComment.content,
        pending: false,
        replyTo: rootComment.id,
      }),
    );
    expect(saveAnnotations).toHaveBeenCalled();
  });

  it('does not restore a streaming reply after its thought is deleted', async () => {
    const rootComment = comment();
    const replyComment = comment({
      id: 'comment_reply',
      content: '@linzhiwei 你怎么看',
      replyTo: rootComment.id,
    });
    const targetAnnotation = annotation([rootComment, replyComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]!);
    });
    const saveAnnotations = vi.fn(async (annotations: Annotation[]) => {
      annotationsRef.current = annotations;
    });
    const pendingAgentComment = {
      id: 'comment_agent',
      author: 'ai' as const,
      content: '',
      createdAt: now,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      pending: true,
    };
    const desktop = {
      requestAgentCommentStream: vi.fn(async (_payload, onEvent) => {
        onEvent({ type: 'start', comment: pendingAgentComment });
        annotationsRef.current = [{ ...targetAnnotation, comments: [] }];
        onEvent({ type: 'delta', delta: '不应该恢复' });
        return {
          ...pendingAgentComment,
          content: '不应该保存',
          pending: false,
        };
      }),
    };

    await runSourceAgentCommentRequest({
      agent,
      annotation: targetAnnotation,
      userComment: replyComment,
      desktop,
      currentArticle: article(targetAnnotation),
      articleText: '正文',
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage: vi.fn(),
    });

    expect(annotationsRef.current[0]?.comments).toEqual([]);
    expect(saveAnnotations).not.toHaveBeenCalled();
  });

  it('saves review replies under the requested target thought', async () => {
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]!);
    });
    const saveAnnotations = vi.fn(async (annotations: Annotation[]) => {
      annotationsRef.current = annotations;
    });
    const pendingAgentComment = {
      id: 'comment_review',
      author: 'ai' as const,
      content: '',
      createdAt: now,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      pending: true,
    };
    const desktop = {
      requestAgentCommentStream: vi.fn(async (_payload, onEvent) => {
        onEvent({ type: 'start', comment: pendingAgentComment });
        return {
          ...pendingAgentComment,
          content: '【审阅】证据还不够。',
          pending: false,
        };
      }),
    };

    await runSourceAgentCommentRequest({
      agent,
      annotation: targetAnnotation,
      userComment: rootComment,
      reviewTargetCommentId: rootComment.id,
      desktop,
      currentArticle: article(targetAnnotation),
      articleText: '正文',
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage: vi.fn(),
    });

    expect(desktop.requestAgentCommentStream.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ reviewTargetCommentId: rootComment.id }),
    );
    expect(annotationsRef.current[0]?.comments).toContainEqual(
      expect.objectContaining({
        id: 'comment_review',
        content: '【审阅】证据还不够。',
        replyTo: rootComment.id,
      }),
    );
  });
});
