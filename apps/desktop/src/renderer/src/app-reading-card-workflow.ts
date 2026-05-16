import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleRecord, ReadingCardRecord, ReadingDeliberationRecord } from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit, ReadingReceiptDecision } from '@yomitomo/core';
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
  sourceUpdatedAt: string | null;
  status: ReadingCardWorkflowStatus;
};

export type ReadingCardWorkflowDerivation = {
  workflowSteps: ReadingCardWorkflowStep[];
  currentAiCard: ReadingCardRecord | null;
  displayAiCard: ReadingCardRecord | null;
  isWorkflowBusy: boolean;
  canReview: boolean;
  deliberationIsCurrent: boolean;
  aiCardIsCurrent: boolean;
  reviewIsCurrent: boolean;
};

export function deriveReadingCardWorkflow({
  deliberation,
  aiCard,
  selectedReviewAgentIds,
  sourceUpdatedAt,
  status,
}: ReadingCardWorkflowDerivationInput): ReadingCardWorkflowDerivation {
  const deliberationIsCurrent = isReadingDeliberationCurrent(deliberation, sourceUpdatedAt);
  const aiCardIsCurrent = isReadingCardCurrent(aiCard, deliberation, sourceUpdatedAt);
  const reviewIsCurrent = isReadingCardReviewCurrent(aiCard, aiCardIsCurrent);
  const displayAiCard = aiCard
    ? { ...aiCard, review: reviewIsCurrent ? aiCard.review : undefined }
    : null;
  const currentAiCard = aiCard && aiCardIsCurrent ? displayAiCard : null;
  const isWorkflowBusy =
    status.deliberation === 'generating' ||
    status.aiCard === 'generating' ||
    status.review === 'reviewing';

  return {
    workflowSteps: [
      deriveDeliberationStep(deliberation, deliberationIsCurrent, status, isWorkflowBusy),
      deriveAiCardStep(
        deliberation,
        deliberationIsCurrent,
        aiCard,
        currentAiCard,
        status,
        isWorkflowBusy,
      ),
      deriveReviewStep(aiCard, currentAiCard, selectedReviewAgentIds, status, isWorkflowBusy),
    ],
    displayAiCard,
    currentAiCard,
    isWorkflowBusy,
    canReview: Boolean(currentAiCard && selectedReviewAgentIds.length > 0 && !isWorkflowBusy),
    deliberationIsCurrent,
    aiCardIsCurrent,
    reviewIsCurrent,
  };
}

export function isReadingDeliberationCurrent(
  deliberation: ReadingDeliberationRecord | null,
  sourceUpdatedAt: string | null,
) {
  return Boolean(
    deliberation &&
    (!sourceUpdatedAt || Date.parse(deliberation.updatedAt) >= Date.parse(sourceUpdatedAt)),
  );
}

export function isReadingCardCurrent(
  aiCard: ReadingCardRecord | null,
  deliberation: ReadingDeliberationRecord | null,
  sourceUpdatedAt: string | null,
) {
  return Boolean(
    aiCard &&
    deliberation &&
    isReadingDeliberationCurrent(deliberation, sourceUpdatedAt) &&
    Date.parse(aiCard.updatedAt) >= Date.parse(deliberation.updatedAt) &&
    (!sourceUpdatedAt || Date.parse(aiCard.updatedAt) >= Date.parse(sourceUpdatedAt)),
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
  receiptDecisions,
  reviewAgentIds,
  sourceUpdatedAt,
  onGenerated,
}: {
  article: ArticleRecord | null;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  receiptDecisions: ReadingReceiptDecision[];
  reviewAgentIds: string[];
  sourceUpdatedAt: string | null;
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
  const activeArticleIdRef = useRef<string | null>(article?.id ?? null);
  activeArticleIdRef.current = article?.id ?? null;

  function articleRequestIsCurrent(articleId: string) {
    return activeArticleIdRef.current === articleId;
  }

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
        sourceUpdatedAt,
        status,
      }),
    [aiCard, deliberation, selectedReviewAgentIds, sourceUpdatedAt, status],
  );

  async function generateAiCard() {
    if (!article || !deliberation || status.aiCard === 'generating' || workflow.isWorkflowBusy) {
      return;
    }
    const requestArticleId = article.id;
    setStatus((current) => ({ ...current, aiCard: 'generating' }));
    setAiError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingCard({
        article,
        articleText,
        evidenceUnits,
        receiptDecisions,
        readingDeliberation: deliberation,
      });
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setAiCard(result.readingCard);
      setStatus((current) => ({ ...current, aiCard: 'done', review: 'idle' }));
      setReviewError('');
      onGenerated();
    } catch (error) {
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setAiError(error instanceof Error ? error.message : '回执整理失败');
      setStatus((current) => ({ ...current, aiCard: 'error' }));
    }
  }

  async function generateDeliberation() {
    if (!article || workflow.isWorkflowBusy) return;
    const requestArticleId = article.id;
    setStatus((current) => ({ ...current, deliberation: 'generating' }));
    setDeliberationError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingDeliberation({
        article,
        articleText,
        evidenceUnits,
        receiptDecisions,
      });
      if (!articleRequestIsCurrent(requestArticleId)) return;
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
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setDeliberationError(error instanceof Error ? error.message : '阅读所得生成失败');
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
      setReviewError('请选择审阅助手');
      return;
    }
    const requestArticleId = article.id;
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
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setAiCard({ ...workflow.currentAiCard, review: result.review });
      setStatus((current) => ({ ...current, review: 'done' }));
      onGenerated();
    } catch (error) {
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setReviewError(error instanceof Error ? error.message : '读后回执审阅失败');
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
    const requestArticleId = article.id;
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
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setAiCard({ ...workflow.currentAiCard, review: result.review });
      setStatus((current) => ({ ...current, review: 'done' }));
      onGenerated();
    } catch (error) {
      if (!articleRequestIsCurrent(requestArticleId)) return;
      setReviewError(error instanceof Error ? error.message : '读后回执审阅失败');
      setStatus((current) => ({ ...current, review: 'error' }));
    } finally {
      if (articleRequestIsCurrent(requestArticleId)) setRetryingReviewerId(null);
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
    displayAiCard: workflow.displayAiCard,
    workflowSteps: workflow.workflowSteps,
    errors: {
      ai: aiError,
      deliberation: deliberationError,
      review: reviewError,
    },
    retryingReviewerId,
    selectedReviewAgentIds,
    canReview: workflow.canReview,
    deliberationIsCurrent: workflow.deliberationIsCurrent,
    aiCardIsCurrent: workflow.aiCardIsCurrent,
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
  deliberationIsCurrent: boolean,
  status: ReadingCardWorkflowStatus,
  isWorkflowBusy: boolean,
): ReadingCardWorkflowStep {
  if (status.deliberation === 'generating') {
    return {
      id: 'deliberation',
      number: 1,
      title: '阅读所得',
      description: '正在生成阅读所得',
      state: 'running',
      actionLabel: deliberation ? '重新生成阅读所得' : '生成阅读所得',
      disabled: isWorkflowBusy,
    };
  }
  if (status.deliberation === 'error') {
    return {
      id: 'deliberation',
      number: 1,
      title: '阅读所得',
      description: '生成阅读所得失败，可重试',
      state: 'error',
      actionLabel: deliberation ? '重新生成阅读所得' : '生成阅读所得',
      disabled: isWorkflowBusy,
    };
  }
  if (deliberation) {
    if (!deliberationIsCurrent) {
      return {
        id: 'deliberation',
        number: 1,
        title: '阅读所得',
        description: '有新批注或讨论，等待重新生成阅读所得',
        state: 'active',
        actionLabel: '重新生成阅读所得',
        disabled: isWorkflowBusy,
      };
    }
    return {
      id: 'deliberation',
      number: 1,
      title: '阅读所得',
      description: `已生成 · ${formatDate(deliberation.updatedAt)}`,
      state: 'done',
      actionLabel: '重新生成阅读所得',
      disabled: isWorkflowBusy,
    };
  }
  return {
    id: 'deliberation',
    number: 1,
    title: '阅读所得',
    description: '从纳入材料生成阅读所得',
    state: 'active',
    actionLabel: '生成阅读所得',
    disabled: isWorkflowBusy,
  };
}

function deriveAiCardStep(
  deliberation: ReadingDeliberationRecord | null,
  deliberationIsCurrent: boolean,
  aiCard: ReadingCardRecord | null,
  currentAiCard: ReadingCardRecord | null,
  status: ReadingCardWorkflowStatus,
  isWorkflowBusy: boolean,
): ReadingCardWorkflowStep {
  let description = '生成阅读所得后开始';
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
  } else if (deliberation && !deliberationIsCurrent) {
    description = '有新痕迹，先重新生成阅读所得';
    state = 'waiting';
  } else if (aiCard && deliberation) {
    description = '阅读所得已更新，等待重新打磨';
    state = 'active';
  } else if (deliberation) {
    description = '基于阅读所得整理回执';
    state = 'active';
  }

  return {
    id: 'card',
    number: 2,
    title: 'AI 提炼',
    description,
    state,
    actionLabel: currentAiCard ? '重新提炼' : 'AI 提炼',
    disabled: !deliberation || !deliberationIsCurrent || isWorkflowBusy,
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
  } else if (aiCard && !currentAiCard) {
    description = '回执有新痕迹，先重新打磨';
    state = 'waiting';
  } else if (currentAiCard && aiCard?.review) {
    description = '读后笔记已更新，等待重新审核';
    state = 'active';
  } else if (currentAiCard) {
    description = selectedReviewAgentIds.length > 0 ? '回执已生成，可检查' : '请选择审阅助手';
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
