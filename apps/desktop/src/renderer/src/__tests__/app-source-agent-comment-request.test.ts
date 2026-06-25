// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
} from '@yomitomo/shared';
import { runSourceAgentCommentRequest } from '../source/bookcase/app-source-agent-comment-request';
import { initializeAppI18n } from '../i18n/app-i18n';

const now = '2026-05-17T06:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

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

function saveCommentMock(annotationsRef: { current: Annotation[] }) {
  return vi.fn(async (annotationId: string, nextComment: AnnotationComment) => {
    annotationsRef.current = annotationsRef.current.map((candidate) => {
      if (candidate.id !== annotationId) return candidate;
      const existingComment = candidate.comments.some((item) => item.id === nextComment.id);
      return {
        ...candidate,
        comments: existingComment
          ? candidate.comments.map((item) => (item.id === nextComment.id ? nextComment : item))
          : [...candidate.comments, nextComment],
      };
    });
  });
}

describe('runSourceAgentCommentRequest', () => {
  it('saves a failed assistant reply when the stream rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
    const desktop = {
      requestAgentCommentStream: vi.fn(async () => {
        throw new Error('network failed');
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
      saveComment,
      setStatusMessage: vi.fn(),
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[agent-comment] assistant reply failed',
      expect.objectContaining({
        agentId: agent.id,
        annotationId: targetAnnotation.id,
        message: 'network failed',
        replyTargetId: rootComment.id,
      }),
    );
    expect(saveComment).toHaveBeenCalled();
    expect(annotationsRef.current[0]?.comments).toContainEqual(
      expect.objectContaining({
        author: 'ai',
        content: 'network failed',
        pending: false,
        replyTo: rootComment.id,
      }),
    );
  });

  it('keeps partial streamed reply content and marks active progress failed when the stream rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
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
        onEvent({
          type: 'progress',
          progress: {
            type: 'step',
            step: { id: 'get_current_thread', label: '读取当前讨论', status: 'active' },
          },
        });
        onEvent({ type: 'delta', delta: '已经输出的部分' });
        throw new Error('stream failed');
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
      saveComment,
      setStatusMessage: vi.fn(),
    });

    expect(annotationsRef.current[0]?.comments).toContainEqual(
      expect.objectContaining({
        id: 'comment_agent',
        content: '已经输出的部分\n\n请求失败：stream failed',
        pending: false,
        assistantProgress: {
          steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'failed' }],
        },
      }),
    );
  });

  it('shows a pending reply before the stream starts', async () => {
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
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
      saveComment,
      setStatusMessage: vi.fn(),
    });

    expect(applyAnnotations.mock.invocationCallOrder[0]).toBeLessThan(
      desktop.requestAgentCommentStream.mock.invocationCallOrder[0],
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
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
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
      saveComment,
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
    expect(saveComment).toHaveBeenCalled();
  });

  it('keeps deep runtime progress while applying streamed reply deltas', async () => {
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
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
        onEvent({
          type: 'progress',
          progress: {
            type: 'step',
            step: { id: 'get_current_thread', label: '读取当前讨论', status: 'active' },
          },
        });
        onEvent({
          type: 'progress',
          progress: {
            type: 'step',
            step: { id: 'get_current_thread', label: '读取当前讨论', status: 'done' },
          },
        });
        onEvent({ type: 'delta', delta: '我先看了讨论。' });
        return {
          ...pendingAgentComment,
          content: '我先看了讨论。',
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
      saveComment,
      setStatusMessage: vi.fn(),
    });

    expect(annotationsRef.current[0]?.comments).toContainEqual(
      expect.objectContaining({
        id: 'comment_agent',
        content: '我先看了讨论。',
        assistantProgress: {
          steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
        },
      }),
    );
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
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
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
      saveComment,
      setStatusMessage: vi.fn(),
    });

    expect(annotationsRef.current[0]?.comments).toEqual([]);
    expect(saveComment).not.toHaveBeenCalled();
  });

  it('saves review replies under the requested target thought', async () => {
    const rootComment = comment();
    const targetAnnotation = annotation([rootComment]);
    const annotationsRef = { current: [targetAnnotation] };
    const applyAnnotations = vi.fn((annotations: Annotation[]) => {
      annotationsRef.current = annotations;
      return article(annotations[0]);
    });
    const saveComment = saveCommentMock(annotationsRef);
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
      saveComment,
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
