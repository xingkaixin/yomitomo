import { useEffect, useMemo, useState } from 'react';
import type { ArticleRecord, ReadingCardRecord, ReadingDeliberationRecord } from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit } from '@yomitomo/core';
import { formatDate } from './app-utils';
import type { ReadingCardWorkflowStep } from './app-types';

export type ReadingCardGenerationState = 'idle' | 'generating' | 'done' | 'error';
export type ReadingCardReviewState = 'idle' | 'reviewing' | 'done' | 'error';

export type ReadingCardWorkflowStatus = {
  deliberation: ReadingCardGenerationState;
  aiCard: ReadingCardGenerationState;
  review: ReadingCardReviewState;
};

export type ReadingCardWorkflowDerivationInput = {
  deliberation: ReadingDeliberationRecord | null;
  aiCard: ReadingCardRecord | null;
  selectedReviewAgentIds: string[];
  status: ReadingCardWorkflowStatus;
};

export type ReadingCardWorkflowDerivation = {
  workflowSteps: ReadingCardWorkflowStep[];
  currentAiCard: ReadingCardRecord | null;
  isWorkflowBusy: boolean;
  canReview: boolean;
  aiCardIsCurrent: boolean;
  reviewIsCurrent: boolean;
};

export function deriveReadingCardWorkflow({
  deliberation,
  aiCard,
  selectedReviewAgentIds,
  status,
}: ReadingCardWorkflowDerivationInput): ReadingCardWorkflowDerivation {
  const aiCardIsCurrent = isReadingCardCurrent(aiCard, deliberation);
  const reviewIsCurrent = isReadingCardReviewCurrent(aiCard, aiCardIsCurrent);
  const currentAiCard =
    aiCard && aiCardIsCurrent
      ? { ...aiCard, review: reviewIsCurrent ? aiCard.review : undefined }
      : null;
  const isWorkflowBusy =
    status.deliberation === 'generating' ||
    status.aiCard === 'generating' ||
    status.review === 'reviewing';

  return {
    workflowSteps: [
      deriveDeliberationStep(deliberation, status, isWorkflowBusy),
      deriveAiCardStep(deliberation, aiCard, currentAiCard, status, isWorkflowBusy),
      deriveReviewStep(aiCard, currentAiCard, selectedReviewAgentIds, status, isWorkflowBusy),
    ],
    currentAiCard,
    isWorkflowBusy,
    canReview: Boolean(currentAiCard && selectedReviewAgentIds.length > 0 && !isWorkflowBusy),
    aiCardIsCurrent,
    reviewIsCurrent,
  };
}

export function isReadingCardCurrent(
  aiCard: ReadingCardRecord | null,
  deliberation: ReadingDeliberationRecord | null,
) {
  return Boolean(
    aiCard && deliberation && Date.parse(aiCard.updatedAt) >= Date.parse(deliberation.updatedAt),
  );
}

export function isReadingCardReviewCurrent(
  aiCard: ReadingCardRecord | null,
  aiCardIsCurrent: boolean,
) {
  return Boolean(
    aiCard?.review &&
    aiCardIsCurrent &&
    Date.parse(aiCard.review.updatedAt) >= Date.parse(aiCard.updatedAt),
  );
}

export function useReadingCardWorkflow({
  article,
  articleText,
  evidenceUnits,
  reviewAgentIds,
  onGenerated,
}: {
  article: ArticleRecord | null;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  reviewAgentIds: string[];
  onGenerated: () => void;
}) {
  const [deliberation, setDeliberation] = useState<ReadingDeliberationRecord | null>(null);
  const [deliberationError, setDeliberationError] = useState('');
  const [aiCard, setAiCard] = useState<ReadingCardRecord | null>(null);
  const [aiError, setAiError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [retryingReviewerId, setRetryingReviewerId] = useState<string | null>(null);
  const [selectedReviewAgentIds, setSelectedReviewAgentIds] = useState<string[]>([]);
  const [status, setStatus] = useState<ReadingCardWorkflowStatus>({
    deliberation: 'idle',
    aiCard: 'idle',
    review: 'idle',
  });
  const reviewAgentKey = reviewAgentIds.join('|');

  useEffect(() => {
    setDeliberation(article?.readingDeliberation || null);
    setDeliberationError('');
    setAiCard(article?.readingCard || null);
    setAiError('');
    setReviewError('');
    setRetryingReviewerId(null);
    setStatus({
      deliberation: article?.readingDeliberation ? 'done' : 'idle',
      aiCard: article?.readingCard ? 'done' : 'idle',
      review: article?.readingCard?.review ? 'done' : 'idle',
    });
  }, [
    article?.id,
    article?.readingDeliberation?.updatedAt,
    article?.readingCard?.updatedAt,
    article?.readingCard?.review?.updatedAt,
  ]);

  useEffect(() => {
    setSelectedReviewAgentIds((current) => {
      const availableIds = new Set(reviewAgentIds);
      const kept = current.filter((id) => availableIds.has(id));
      return kept.length > 0 ? kept : reviewAgentIds;
    });
  }, [reviewAgentKey]);

  const workflow = useMemo(
    () =>
      deriveReadingCardWorkflow({
        deliberation,
        aiCard,
        selectedReviewAgentIds,
        status,
      }),
    [aiCard, deliberation, selectedReviewAgentIds, status],
  );

  async function generateAiCard() {
    if (!article || !deliberation || status.aiCard === 'generating' || workflow.isWorkflowBusy) {
      return;
    }
    setStatus((current) => ({ ...current, aiCard: 'generating' }));
    setAiError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingDeliberation: deliberation,
      });
      setAiCard(result.readingCard);
      setStatus((current) => ({ ...current, aiCard: 'done', review: 'idle' }));
      setReviewError('');
      onGenerated();
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 提炼失败');
      setStatus((current) => ({ ...current, aiCard: 'error' }));
    }
  }

  async function generateDeliberation() {
    if (!article || workflow.isWorkflowBusy) return;
    setStatus((current) => ({ ...current, deliberation: 'generating' }));
    setDeliberationError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingDeliberation({
        article,
        articleText,
        evidenceUnits,
      });
      setDeliberation(result.readingDeliberation);
      setStatus((current) => ({
        ...current,
        deliberation: 'done',
        aiCard: 'idle',
        review: 'idle',
      }));
      setReviewError('');
      onGenerated();
    } catch (error) {
      setDeliberationError(error instanceof Error ? error.message : '阅读审议生成失败');
      setStatus((current) => ({ ...current, deliberation: 'error' }));
    }
  }

  async function reviewAiCard() {
    if (
      !article ||
      !workflow.currentAiCard ||
      status.review === 'reviewing' ||
      workflow.isWorkflowBusy
    ) {
      return;
    }
    if (selectedReviewAgentIds.length === 0) {
      setReviewError('请选择审核助手');
      return;
    }
    setStatus((current) => ({ ...current, review: 'reviewing' }));
    setReviewError('');
    try {
      const result = await window.yomitomoDesktop.reviewReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingCard: workflow.currentAiCard,
        reviewAgentIds: selectedReviewAgentIds,
      });
      setAiCard({ ...workflow.currentAiCard, review: result.review });
      setStatus((current) => ({ ...current, review: 'done' }));
      onGenerated();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : '读后笔记审稿失败');
      setStatus((current) => ({ ...current, review: 'error' }));
    }
  }

  async function retryReviewAgent(agentId: string) {
    if (
      !article ||
      !workflow.currentAiCard ||
      status.review === 'reviewing' ||
      retryingReviewerId
    ) {
      return;
    }
    setStatus((current) => ({ ...current, review: 'reviewing' }));
    setRetryingReviewerId(agentId);
    setReviewError('');
    try {
      const result = await window.yomitomoDesktop.reviewReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingCard: workflow.currentAiCard,
        previousReview: workflow.currentAiCard.review,
        reviewAgentIds: [agentId],
      });
      setAiCard({ ...workflow.currentAiCard, review: result.review });
      setStatus((current) => ({ ...current, review: 'done' }));
      onGenerated();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : '读后笔记审稿失败');
      setStatus((current) => ({ ...current, review: 'error' }));
    } finally {
      setRetryingReviewerId(null);
    }
  }

  function toggleReviewAgent(agentId: string) {
    setSelectedReviewAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
    setReviewError('');
  }

  return {
    deliberation,
    currentAiCard: workflow.currentAiCard,
    workflowSteps: workflow.workflowSteps,
    errors: {
      ai: aiError,
      deliberation: deliberationError,
      review: reviewError,
    },
    retryingReviewerId,
    selectedReviewAgentIds,
    canReview: workflow.canReview,
    actions: {
      generateAiCard,
      generateDeliberation,
      reviewAiCard,
      retryReviewAgent,
      toggleReviewAgent,
    },
  };
}

function deriveDeliberationStep(
  deliberation: ReadingDeliberationRecord | null,
  status: ReadingCardWorkflowStatus,
  isWorkflowBusy: boolean,
): ReadingCardWorkflowStep {
  if (status.deliberation === 'generating') {
    return {
      id: 'deliberation',
      number: 1,
      title: '阅读评估',
      description: '正在整理证据与分歧',
      state: 'running',
      actionLabel: deliberation ? '重新生成' : '生成审议',
      disabled: isWorkflowBusy,
    };
  }
  if (status.deliberation === 'error') {
    return {
      id: 'deliberation',
      number: 1,
      title: '阅读评估',
      description: '生成失败，可重试',
      state: 'error',
      actionLabel: deliberation ? '重新生成' : '生成审议',
      disabled: isWorkflowBusy,
    };
  }
  if (deliberation) {
    return {
      id: 'deliberation',
      number: 1,
      title: '阅读评估',
      description: `已生成 · ${formatDate(deliberation.updatedAt)}`,
      state: 'done',
      actionLabel: '重新生成',
      disabled: isWorkflowBusy,
    };
  }
  return {
    id: 'deliberation',
    number: 1,
    title: '阅读评估',
    description: '从批注和讨论生成报告',
    state: 'active',
    actionLabel: '生成审议',
    disabled: isWorkflowBusy,
  };
}

function deriveAiCardStep(
  deliberation: ReadingDeliberationRecord | null,
  aiCard: ReadingCardRecord | null,
  currentAiCard: ReadingCardRecord | null,
  status: ReadingCardWorkflowStatus,
  isWorkflowBusy: boolean,
): ReadingCardWorkflowStep {
  let description = '完成审议后开始';
  let state: ReadingCardWorkflowStep['state'] = 'waiting';

  if (status.aiCard === 'generating') {
    description = '正在提炼读后笔记';
    state = 'running';
  } else if (status.aiCard === 'error') {
    description = '生成失败，可重试';
    state = 'error';
  } else if (currentAiCard) {
    description = `已提炼 · ${formatDate(currentAiCard.updatedAt)}`;
    state = 'done';
  } else if (aiCard && deliberation) {
    description = '审议已更新，等待重新提炼';
    state = 'active';
  } else if (deliberation) {
    description = '基于审议报告生成笔记';
    state = 'active';
  }

  return {
    id: 'card',
    number: 2,
    title: 'AI 提炼',
    description,
    state,
    actionLabel: currentAiCard ? '重新提炼' : 'AI 提炼',
    disabled: !deliberation || isWorkflowBusy,
  };
}

function deriveReviewStep(
  aiCard: ReadingCardRecord | null,
  currentAiCard: ReadingCardRecord | null,
  selectedReviewAgentIds: string[],
  status: ReadingCardWorkflowStatus,
  isWorkflowBusy: boolean,
): ReadingCardWorkflowStep {
  let description = '完成 AI 提炼后开始';
  let state: ReadingCardWorkflowStep['state'] = 'waiting';

  if (status.review === 'reviewing') {
    description = '审核助手正在检查';
    state = 'running';
  } else if (status.review === 'error') {
    description = '审核失败，可重试';
    state = 'error';
  } else if (currentAiCard?.review) {
    description = `已审核 · ${formatDate(currentAiCard.review.updatedAt)}`;
    state = 'done';
  } else if (currentAiCard && aiCard?.review) {
    description = '读后笔记已更新，等待重新审核';
    state = 'active';
  } else if (currentAiCard) {
    description = selectedReviewAgentIds.length > 0 ? '草稿已生成，可审核' : '请选择审核助手';
    state = 'active';
  }

  return {
    id: 'review',
    number: 3,
    title: '笔记草稿',
    description,
    state,
    actionLabel: currentAiCard?.review ? '重新审核' : '审核草稿',
    disabled: !currentAiCard || selectedReviewAgentIds.length === 0 || isWorkflowBusy,
  };
}
