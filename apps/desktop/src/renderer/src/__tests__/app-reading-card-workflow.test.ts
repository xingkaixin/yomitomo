import { describe, expect, it } from 'vitest';
import type {
  ReadingCardRecord,
  ReadingCardReviewRecord,
  ReadingDeliberationRecord,
} from '@yomitomo/shared';
import {
  deriveReadingCardWorkflow,
  type ReadingCardWorkflowStatus,
} from '../app-reading-card-workflow';

const baseStatus: ReadingCardWorkflowStatus = {
  deliberation: 'idle',
  aiCard: 'idle',
  review: 'idle',
};

function deliberation(updatedAt = '2026-05-04T00:00:00.000Z'): ReadingDeliberationRecord {
  return {
    id: 'deliberation_1',
    articleId: 'article_1',
    title: '审议报告',
    contentMarkdown: '',
    sections: [],
    providerId: 'provider_1',
    providerName: 'Anthropic',
    modelName: 'claude',
    createdAt: updatedAt,
    updatedAt,
  };
}

function review(updatedAt = '2026-05-04T00:02:00.000Z'): ReadingCardReviewRecord {
  return {
    id: 'review_1',
    articleId: 'article_1',
    readingCardId: 'reading_card_1',
    reviewerResults: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function readingCard(
  updatedAt = '2026-05-04T00:01:00.000Z',
  readingCardReview?: ReadingCardReviewRecord,
): ReadingCardRecord {
  return {
    id: 'reading_card_1',
    articleId: 'article_1',
    title: '读后笔记',
    contentMarkdown: '',
    sections: [],
    review: readingCardReview,
    providerId: 'provider_1',
    providerName: 'Anthropic',
    modelName: 'claude',
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('deriveReadingCardWorkflow', () => {
  it('derives idle workflow steps', () => {
    const result = deriveReadingCardWorkflow({
      deliberation: null,
      aiCard: null,
      selectedReviewAgentIds: [],
      sourceUpdatedAt: null,
      status: baseStatus,
    });

    expect(result.currentAiCard).toBeNull();
    expect(result.isWorkflowBusy).toBe(false);
    expect(result.workflowSteps.map((step) => [step.id, step.state, step.disabled])).toEqual([
      ['deliberation', 'active', false],
      ['card', 'waiting', true],
      ['review', 'waiting', true],
    ]);
  });

  it('marks the workflow busy while a step is generating', () => {
    const result = deriveReadingCardWorkflow({
      deliberation: null,
      aiCard: null,
      selectedReviewAgentIds: [],
      sourceUpdatedAt: null,
      status: { ...baseStatus, deliberation: 'generating' },
    });

    expect(result.isWorkflowBusy).toBe(true);
    expect(result.workflowSteps[0]).toMatchObject({
      id: 'deliberation',
      state: 'running',
      description: '正在整理证据与分歧',
      disabled: true,
    });
  });

  it('keeps an errored AI card step retryable after deliberation exists', () => {
    const result = deriveReadingCardWorkflow({
      deliberation: deliberation(),
      aiCard: null,
      selectedReviewAgentIds: [],
      sourceUpdatedAt: null,
      status: { ...baseStatus, aiCard: 'error' },
    });

    expect(result.workflowSteps[1]).toMatchObject({
      id: 'card',
      state: 'error',
      description: '生成失败，可重试',
      disabled: false,
    });
  });

  it('marks an older AI card stale after deliberation is updated', () => {
    const result = deriveReadingCardWorkflow({
      deliberation: deliberation('2026-05-04T00:03:00.000Z'),
      aiCard: readingCard('2026-05-04T00:01:00.000Z'),
      selectedReviewAgentIds: ['agent_1'],
      sourceUpdatedAt: null,
      status: { ...baseStatus, deliberation: 'done', aiCard: 'done' },
    });

    expect(result.aiCardIsCurrent).toBe(false);
    expect(result.currentAiCard).toBeNull();
    expect(result.workflowSteps[1]).toMatchObject({
      id: 'card',
      state: 'active',
      description: '收束已更新，等待重新打磨',
    });
  });

  it('marks existing outputs stale when reading evidence is newer', () => {
    const result = deriveReadingCardWorkflow({
      deliberation: deliberation('2026-05-04T00:02:00.000Z'),
      aiCard: readingCard('2026-05-04T00:03:00.000Z'),
      selectedReviewAgentIds: ['agent_1'],
      sourceUpdatedAt: '2026-05-04T00:04:00.000Z',
      status: { ...baseStatus, deliberation: 'done', aiCard: 'done' },
    });

    expect(result.deliberationIsCurrent).toBe(false);
    expect(result.aiCardIsCurrent).toBe(false);
    expect(result.currentAiCard).toBeNull();
    expect(result.displayAiCard?.id).toBe('reading_card_1');
    expect(result.workflowSteps.map((step) => [step.id, step.state, step.description])).toEqual([
      ['deliberation', 'active', '有新批注或讨论，等待重新收束'],
      ['card', 'waiting', '有新痕迹，先重新收束'],
      ['review', 'waiting', '回执有新痕迹，先重新打磨'],
    ]);
  });

  it('drops a stale review when the AI card is newer', () => {
    const result = deriveReadingCardWorkflow({
      deliberation: deliberation('2026-05-04T00:00:00.000Z'),
      aiCard: readingCard('2026-05-04T00:03:00.000Z', review('2026-05-04T00:02:00.000Z')),
      selectedReviewAgentIds: ['agent_1'],
      sourceUpdatedAt: null,
      status: { ...baseStatus, deliberation: 'done', aiCard: 'done', review: 'done' },
    });

    expect(result.reviewIsCurrent).toBe(false);
    expect(result.currentAiCard?.review).toBeUndefined();
    expect(result.workflowSteps[2]).toMatchObject({
      id: 'review',
      state: 'active',
      description: '读后笔记已更新，等待重新审核',
      disabled: false,
    });
  });
});
