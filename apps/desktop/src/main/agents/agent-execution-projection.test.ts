import { describe, expect, it } from 'vitest';
import type { Agent, AgentMessagePayload } from '@yomitomo/shared';
import {
  pendingAgentComment,
  pendingDistillationReviewMessage,
  reduceAssistantRuntimeEvent,
  reduceAssistantRuntimeProgress,
} from './agent-execution-projection';

describe('assistant task execution projections', () => {
  it('constructs pending comments from injected identity and clock values', () => {
    const payload = messagePayload();

    const comment = pendingAgentComment({
      agent: agent(),
      payload,
      id: 'comment_1',
      createdAt: '2026-07-31T00:00:00.000Z',
    });

    expect(comment).toEqual({
      id: 'comment_1',
      author: agentAuthor(agent()),
      content: '',
      createdAt: '2026-07-31T00:00:00.000Z',
      replyTo: 'comment_user',
      pending: true,
    });
  });

  it('keeps a supplied review message id while constructing the pending author reference', () => {
    const message = pendingDistillationReviewMessage({
      agent: agent({ kind: 'review' }),
      payload: {
        ...messagePayload(),
        responseMode: 'distillation_review',
        reviewMessageId: 'review_existing',
      },
      id: 'review_generated',
      createdAt: '2026-07-31T00:00:00.000Z',
    });

    expect(message).toEqual({
      id: 'review_existing',
      author: agentAuthor(agent({ kind: 'review' })),
      content: '',
      createdAt: '2026-07-31T00:00:00.000Z',
    });
  });

  it('projects runtime events without mutating the previous state', () => {
    const initial = {
      content: '已有内容',
      assistantProgress: {
        steps: [
          { id: 'get_anchor_context', label: 'get_anchor_context', status: 'active' as const },
        ],
      },
    };

    const completed = reduceAssistantRuntimeEvent(initial, {
      type: 'tool_result',
      toolName: 'get_anchor_context',
      stepIndex: 0,
      ok: true,
    });
    const delta = reduceAssistantRuntimeEvent(completed.state, {
      type: 'text_delta',
      delta: '，新内容',
    });

    expect(initial).toEqual({
      content: '已有内容',
      assistantProgress: {
        steps: [{ id: 'get_anchor_context', label: 'get_anchor_context', status: 'active' }],
      },
    });
    expect(completed.emitted).toEqual({
      type: 'progress',
      progress: {
        type: 'step',
        step: { id: 'get_anchor_context', label: 'get_anchor_context', status: 'done' },
      },
    });
    expect(delta).toEqual({
      state: {
        content: '已有内容，新内容',
        assistantProgress: {
          steps: [{ id: 'get_anchor_context', label: 'get_anchor_context', status: 'done' }],
        },
      },
      emitted: { type: 'delta', delta: '，新内容' },
    });
  });

  it('replaces a progress step and retains its fallback summary', () => {
    const active = reduceAssistantRuntimeProgress(undefined, {
      type: 'step',
      step: { id: 'search_article_memory', label: 'search_article_memory', status: 'active' },
    });
    const fallback = reduceAssistantRuntimeProgress(active, {
      type: 'fallback',
      message: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE',
    });

    expect(fallback).toEqual({
      steps: [{ id: 'search_article_memory', label: 'search_article_memory', status: 'active' }],
      fallbackMessage: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE',
    });
  });
});

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    providerId: 'provider_1',
    nickname: 'Agent',
    username: 'agent',
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    temperature: 0.3,
    soul: 'soul',
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function messagePayload(): AgentMessagePayload {
  return {
    agentId: 'agent_1',
    agentUsername: 'agent',
    article: {
      id: 'article_1',
      title: 'Article',
      url: 'https://example.com/article',
      text: 'Article text',
    },
    annotation: {
      id: 'annotation_1',
      anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
      author: { kind: 'user', userId: 'user_1', username: 'reader' },
      color: '#f59e0b',
      comments: [],
      createdAt: '2026-07-18T00:00:00.000Z',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
    userComment: {
      id: 'comment_user',
      author: { kind: 'user', userId: 'user_1', username: 'reader' },
      content: 'question',
      createdAt: '2026-07-18T00:00:00.000Z',
    },
  };
}

function agentAuthor(value: Agent) {
  return {
    kind: 'agent',
    agentId: value.id,
    username: value.username,
    nickname: value.nickname,
    avatar: value.avatar,
    annotationColor: value.annotationColor,
  };
}
