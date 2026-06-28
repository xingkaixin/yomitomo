import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashText } from '@yomitomo/shared';
import type {
  AgentDistillationReviewPayload,
  Annotation,
  AnnotationDistillationProposal,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  PublicAgent,
} from '@yomitomo/shared';
import {
  requestAgentReviewRound,
  type AgentDistillationReviewStreamEvent,
} from '../annotation-discussion/app-annotation-sedimentation-review-request';
import { initializeAppI18n } from '../i18n/app-i18n';

const now = '2026-06-28T12:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

describe('requestAgentReviewRound', () => {
  it('streams review progress, items, and deltas into an optimistic session', async () => {
    const userMessage = reviewMessage({
      id: 'user_message_1',
      author: 'user',
      content: '请看证据边界',
    });
    const proposal = reviewProposal();
    const overviewItem = {
      id: 'review_item_1',
      type: 'overview' as const,
      stance: 'mixed' as const,
      content: '证据边界还需要更清楚。',
    };
    const proposalItem = {
      id: 'review_item_2',
      type: 'proposal' as const,
      proposal,
    };
    const optimisticSessions: AnnotationDistillationReviewSession[] = [];
    let capturedPayload: AgentDistillationReviewPayload | undefined;
    const requestReviewStream = vi.fn(
      async (
        payload: AgentDistillationReviewPayload,
        onEvent: (event: AgentDistillationReviewStreamEvent) => void,
      ) => {
        capturedPayload = payload;
        onEvent({ type: 'start', message: reviewMessage({ id: 'ignored_start' }) });
        onEvent({
          type: 'progress',
          progress: { type: 'step', step: { id: 'read', label: 'Read', status: 'active' } },
        });
        onEvent({ type: 'item', item: proposalItem });
        onEvent({ type: 'delta', delta: '流式片段' });
        return reviewMessage({
          id: payload.reviewMessageId || 'assistant_message_1',
          content: '最终审阅',
          items: [overviewItem, proposalItem],
          proposals: [proposal],
          status: 'done',
        });
      },
    );

    const result = await requestAgentReviewRound({
      agent: reviewAgent(),
      annotation: annotation(),
      articlePrompt: articlePrompt(),
      createMessageId: () => 'assistant_message_1',
      createRequestCommentId: () => 'request_comment_1',
      createSessionId: () => 'review_session_1',
      draft: '沉淀草稿',
      now: () => now,
      onOptimisticSession: (session) => optimisticSessions.push(session),
      requestReviewStream,
      reviewDraft: '请看证据边界',
      reviewMode: 'review',
      sessions: [],
      uiLanguage: 'zh-CN',
      userMessage,
    });

    expect(requestReviewStream).toHaveBeenCalledOnce();
    expect(capturedPayload).toMatchObject({
      agentId: 'agent_1',
      agentUsername: 'zhou',
      distillationDraft: '沉淀草稿',
      distillationReviewMode: 'review',
      distillationReviewRequest: '请看证据边界',
      distillationReviewTranscript: '',
      instruction: '沉淀草稿',
      reviewMessageId: 'assistant_message_1',
      uiLanguage: 'zh-CN',
      userComment: {
        id: 'user_message_1',
        author: 'user',
        content: '请看证据边界',
        createdAt: now,
      },
    });
    expect(optimisticSessions).toHaveLength(4);
    expect(optimisticSessions[1].messages.at(-1)?.assistantProgress).toEqual({
      steps: [{ id: 'read', label: 'Read', status: 'active' }],
    });
    expect(optimisticSessions[2].messages.at(-1)?.proposals?.[0]).toMatchObject({
      id: 'proposal_1',
      sourceDraftHash: hashText('沉淀草稿'),
      sourceReviewMessageId: 'assistant_message_1',
      sourceReviewSessionId: 'review_session_1',
      sourceAgentId: 'agent_1',
    });
    expect(optimisticSessions[3].messages.at(-1)?.content).toBe('流式片段');
    expect(result.message).toMatchObject({
      id: 'assistant_message_1',
      content: '最终审阅',
      status: 'done',
      proposals: [
        expect.objectContaining({
          id: 'proposal_1',
          sourceDraftHash: hashText('沉淀草稿'),
          sourceReviewMessageId: 'assistant_message_1',
          sourceReviewSessionId: 'review_session_1',
          sourceAgentId: 'agent_1',
        }),
      ],
    });
    expect(result.annotation.distillation?.reviewSessions?.[0].messages).toHaveLength(2);
  });

  it('uses an existing session transcript and default review request', async () => {
    const createSessionId = vi.fn(() => 'new_session');
    let capturedPayload: AgentDistillationReviewPayload | undefined;
    const sessions = [
      reviewSession({
        messages: [
          reviewMessage({ id: 'user_message_1', author: 'user', content: '上一轮问题' }),
          reviewMessage({ id: 'assistant_message_0', content: '上一轮回答', status: 'done' }),
        ],
      }),
    ];
    const requestReviewStream = vi.fn(async (payload: AgentDistillationReviewPayload) => {
      capturedPayload = payload;
      return reviewMessage({
        id: payload.reviewMessageId || 'assistant_message_1',
        content: '继续审阅',
        status: 'done',
      });
    });

    const result = await requestAgentReviewRound({
      agent: reviewAgent(),
      annotation: annotation(),
      articlePrompt: articlePrompt(),
      createMessageId: () => 'assistant_message_1',
      createRequestCommentId: () => 'request_comment_1',
      createSessionId,
      draft: '沉淀草稿',
      now: () => now,
      onOptimisticSession: () => undefined,
      requestReviewStream,
      reviewDraft: '',
      reviewMode: 'review',
      sessions,
      uiLanguage: 'zh-CN',
    });

    expect(createSessionId).not.toHaveBeenCalled();
    expect(capturedPayload?.userComment).toMatchObject({
      id: 'request_comment_1',
      author: 'user',
      createdAt: now,
    });
    expect(capturedPayload?.distillationReviewRequest).toBeTruthy();
    expect(capturedPayload?.distillationReviewTranscript).toContain('上一轮问题');
    expect(capturedPayload?.distillationReviewTranscript).toContain('上一轮回答');
    expect(result.annotation.distillation?.reviewSessions?.[0].id).toBe('review_session_1');
  });

  it('marks the optimistic assistant message as failed before rethrowing stream errors', async () => {
    const optimisticSessions: AnnotationDistillationReviewSession[] = [];
    const requestReviewStream = vi.fn(
      async (
        _payload: AgentDistillationReviewPayload,
        onEvent: (event: AgentDistillationReviewStreamEvent) => void,
      ) => {
        onEvent({ type: 'delta', delta: '部分响应' });
        throw new Error('provider failed');
      },
    );

    await expect(
      requestAgentReviewRound({
        agent: reviewAgent(),
        annotation: annotation(),
        articlePrompt: articlePrompt(),
        createMessageId: () => 'assistant_message_1',
        createRequestCommentId: () => 'request_comment_1',
        createSessionId: () => 'review_session_1',
        draft: '沉淀草稿',
        now: () => now,
        onOptimisticSession: (session) => optimisticSessions.push(session),
        requestReviewStream,
        reviewDraft: '请看风险',
        reviewMode: 'review',
        sessions: [],
        uiLanguage: 'zh-CN',
      }),
    ).rejects.toThrow('provider failed');

    expect(optimisticSessions.at(-1)?.messages.at(-1)).toMatchObject({
      id: 'assistant_message_1',
      content: '部分响应',
      errorMessage: 'provider failed',
      status: 'failed',
    });
  });
});

function reviewAgent(): PublicAgent {
  return {
    id: 'agent_1',
    kind: 'review',
    enabled: true,
    nickname: '周现',
    username: 'zhou',
    avatar: '',
    annotationColor: '#f4c95d',
    annotationDensity: 'medium',
    temperature: 0.3,
    personalityName: '周现',
  };
}

function annotation(): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '原文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 2,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

function articlePrompt(): AgentDistillationReviewPayload['article'] {
  return {
    id: 'article_1',
    title: '文章标题',
    url: 'https://example.com/post',
    text: '正文',
  };
}

function reviewMessage(
  overrides: Partial<AnnotationDistillationReviewMessage> = {},
): AnnotationDistillationReviewMessage {
  return {
    id: 'assistant_message_1',
    author: 'ai',
    content: '',
    createdAt: now,
    agentId: 'agent_1',
    agentUsername: 'zhou',
    agentNickname: '周现',
    agentAvatar: '',
    ...overrides,
  };
}

function reviewSession(
  overrides: Partial<AnnotationDistillationReviewSession> = {},
): AnnotationDistillationReviewSession {
  return {
    id: 'review_session_1',
    agentId: 'agent_1',
    agentUsername: 'zhou',
    agentNickname: '周现',
    agentAvatar: '',
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function reviewProposal(): AnnotationDistillationProposal {
  return {
    id: 'proposal_1',
    kind: 'insert',
    status: 'pending',
    title: '补证据边界',
    content: '补一条证据边界。',
    updatedAt: now,
  };
}
