import { describe, expect, it } from 'vitest';
import type { Agent, AgentMessagePayload } from '@yomitomo/shared';
import { pendingDistillationReviewMessage } from './agent-execution-projection';

describe('assistant task execution projections', () => {
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
