import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ListChecks, LoaderCircle, Scale, Sparkles } from 'lucide-react';
import type { Agent, ArticleRecord, ReadingReceiptState, UserProfile } from '@yomitomo/shared';
import {
  buildReadingCard,
  buildReadingCardEvidenceUnits,
  buildReadingCardStats,
  type ReadingReceiptDisposition,
  type ReadingReceiptDecision,
} from '@yomitomo/core';
import { articleIdentityLine, articlePlainText, articleReadingStatsLine } from './app-utils';
import { Button } from './components/ui/button';
import { AvatarImage, CopyIconButton } from './app-ui';
import { isReadingDeliberationCurrent, useReadingCardWorkflow } from './app-reading-card-workflow';
import type { ReadingCardWorkflowStep, ReadingCardWorkflowStepId } from './app-types';
import {
  ReadingCardDeck,
  ReadingCardEvidencePanel,
  ReadingDeliberationPanel,
  ReadingReceiptTriageBoard,
  type ReadingReceiptBoardDisposition,
} from './app-reading-card-display';
import type { ArticleUpdater } from './app-reading-types';

const fallbackReadingReceiptUser: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: new Date(0).toISOString(),
};

export function ReadingCard({
  annotationAgents = [],
  article,
  reviewAgents,
  userProfile = fallbackReadingReceiptUser,
  onGenerated,
  onOpenEvidence,
  onUpdateArticle,
}: {
  annotationAgents?: Agent[];
  article: ArticleRecord | null;
  reviewAgents: Agent[];
  userProfile?: UserProfile;
  onGenerated: () => void;
  onOpenEvidence: (annotationId: string) => void;
  onUpdateArticle?: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
}) {
  const articleText = useMemo(() => (article ? articlePlainText(article) : ''), [article]);
  const stats = useMemo(() => (article ? buildReadingCardStats(article) : null), [article]);
  const evidenceUnits = useMemo(
    () => (article ? buildReadingCardEvidenceUnits(article) : []),
    [article],
  );
  const evidenceKey = useMemo(
    () => evidenceUnits.map((unit) => unit.id).join('|'),
    [evidenceUnits],
  );
  const sourceUpdatedAt = useMemo(
    () => (article ? readingReceiptSourceUpdatedAt(article, evidenceUnits) : null),
    [article, evidenceUnits],
  );
  const [receiptDispositionById, setReceiptDispositionById] = useState<
    Record<string, ReadingReceiptBoardDisposition>
  >({});
  useEffect(() => {
    setReceiptDispositionById(
      initialReadingReceiptDispositionById(article, evidenceUnits, sourceUpdatedAt),
    );
  }, [article?.id, evidenceKey, evidenceUnits, sourceUpdatedAt]);
  const receiptDecisions = useMemo(
    () => buildReadingReceiptDecisions(evidenceUnits, receiptDispositionById),
    [evidenceUnits, receiptDispositionById],
  );
  const receiptClarifyCount = useMemo(
    () => evidenceUnits.filter((unit) => receiptDispositionById[unit.id] === 'clarify').length,
    [evidenceUnits, receiptDispositionById],
  );
  const reviewAgentIds = useMemo(() => reviewAgents.map((agent) => agent.id), [reviewAgents]);
  const {
    actions,
    aiCardIsCurrent,
    displayAiCard,
    deliberation,
    errors,
    retryingReviewerId,
    selectedReviewAgentIds,
    workflowSteps,
  } = useReadingCardWorkflow({
    article,
    articleText,
    evidenceUnits,
    receiptDecisions,
    reviewAgentIds,
    sourceUpdatedAt,
    onGenerated,
  });
  const workflowActions: Record<ReadingCardWorkflowStepId, () => void> = {
    deliberation: actions.generateDeliberation,
    card: actions.generateAiCard,
    review: actions.reviewAiCard,
  };
  const card = article
    ? displayAiCard?.contentMarkdown || buildReadingCard(article, articleText)
    : '';
  const currentWorkflowStep = currentReadingReceiptStep(workflowSteps);
  const showReceiptTriage = currentWorkflowStep.id === 'deliberation';

  function changeReceiptDisposition(
    evidenceId: string,
    disposition: ReadingReceiptBoardDisposition,
  ) {
    setReceiptDispositionById((current) => ({ ...current, [evidenceId]: disposition }));
  }

  const persistReadingReceiptState = useCallback(
    (state: ReadingReceiptState) => {
      if (!article || !onUpdateArticle) return;
      void onUpdateArticle(article.id, (current) => ({
        ...current,
        readingReceiptState: state,
        updatedAt: state.updatedAt,
      }));
    },
    [article, onUpdateArticle],
  );

  if (!article) {
    return (
      <aside className="reading-card">
        <div className="reading-card-empty">选择一篇文章查看读后回执</div>
      </aside>
    );
  }

  return (
    <aside className="reading-card">
      <div className="reading-card-header">
        <div>
          <h3>{article.title}</h3>
          <p>{articleIdentityLine(article)}</p>
          {stats ? <p className="reading-card-statline">{articleReadingStatsLine(stats)}</p> : null}
        </div>
        <div className="reading-card-actions">
          <span className="reading-card-current-view">当前：读后回执</span>
          <CopyIconButton label="复制读后回执 Markdown" value={card} />
        </div>
      </div>
      <ReadingCardWorkflow
        actions={workflowActions}
        receiptClarifyCount={receiptClarifyCount}
        steps={workflowSteps}
      />
      {displayAiCard && aiCardIsCurrent && !showReceiptTriage ? (
        <ReadingCardReviewAgentStrip
          reviewAgents={reviewAgents}
          selectedReviewAgentIds={selectedReviewAgentIds}
          onToggleReviewAgent={actions.toggleReviewAgent}
        />
      ) : null}
      <div
        className={
          displayAiCard && !showReceiptTriage ? 'reading-card-body' : 'reading-card-body is-triage'
        }
      >
        <div className="reading-card-output-stack">
          {errors.ai ? <p className="reading-card-error">{errors.ai}</p> : null}
          {errors.deliberation ? <p className="reading-card-error">{errors.deliberation}</p> : null}
          {errors.review ? <p className="reading-card-error">{errors.review}</p> : null}
          {deliberation && !displayAiCard && !showReceiptTriage ? (
            <ReadingDeliberationPanel
              deliberation={deliberation}
              evidenceUnits={evidenceUnits}
              userProfile={userProfile}
              onOpenEvidence={onOpenEvidence}
            />
          ) : null}
          {displayAiCard && !showReceiptTriage ? (
            <ReadingCardDeck
              article={article}
              isCurrent={aiCardIsCurrent}
              evidenceUnits={evidenceUnits}
              readingCard={displayAiCard}
              receiptDispositionById={receiptDispositionById}
              retryingReviewerId={retryingReviewerId}
              sourceUpdatedAt={sourceUpdatedAt}
              stats={stats}
              onOpenEvidence={onOpenEvidence}
              onRetryReviewer={actions.retryReviewAgent}
            />
          ) : (
            <ReadingReceiptTriageBoard
              annotationAgents={annotationAgents}
              article={article}
              evidenceUnits={evidenceUnits}
              locked={!showReceiptTriage}
              receiptDispositionById={receiptDispositionById}
              sourceUpdatedAt={sourceUpdatedAt || article.updatedAt}
              userProfile={userProfile}
              onChangeDisposition={changeReceiptDisposition}
              onOpenEvidence={onOpenEvidence}
              onPersistReadingReceiptState={persistReadingReceiptState}
            />
          )}
        </div>
        {displayAiCard && !showReceiptTriage ? (
          <ReadingCardEvidencePanel
            evidenceUnits={evidenceUnits}
            readingCard={displayAiCard}
            receiptDispositionById={receiptDispositionById}
            onChangeDisposition={changeReceiptDisposition}
            onOpenEvidence={onOpenEvidence}
          />
        ) : null}
      </div>
    </aside>
  );
}

function buildReadingReceiptDecisions(
  evidenceUnits: ReturnType<typeof buildReadingCardEvidenceUnits>,
  dispositionById: Record<string, ReadingReceiptBoardDisposition>,
): ReadingReceiptDecision[] {
  return evidenceUnits.map((unit) => ({
    evidenceId: unit.id,
    evidenceIndex: unit.index,
    disposition: normalizeReadingReceiptDisposition(dispositionById[unit.id]),
  }));
}

function initialReadingReceiptDispositionById(
  article: ArticleRecord | null,
  evidenceUnits: ReturnType<typeof buildReadingCardEvidenceUnits>,
  sourceUpdatedAt: string | null,
): Record<string, ReadingReceiptBoardDisposition> {
  if (!article || !sourceUpdatedAt) return {};
  const persistedState =
    article.readingReceiptState?.sourceUpdatedAt === sourceUpdatedAt
      ? article.readingReceiptState
      : null;
  if (persistedState) {
    const dispositionById = new Map(
      persistedState.dispositions.map((item) => [item.evidenceId, item.disposition]),
    );
    return Object.fromEntries(
      evidenceUnits.map((unit) => [
        unit.id,
        normalizeReadingReceiptBoardDisposition(dispositionById.get(unit.id)),
      ]),
    );
  }
  const initialDisposition: ReadingReceiptBoardDisposition = isReadingDeliberationCurrent(
    article.readingDeliberation || null,
    sourceUpdatedAt,
  )
    ? 'include'
    : 'clarify';
  return Object.fromEntries(evidenceUnits.map((unit) => [unit.id, initialDisposition]));
}

function normalizeReadingReceiptBoardDisposition(
  disposition: string | undefined,
): ReadingReceiptBoardDisposition {
  return disposition === 'include' || disposition === 'exclude' || disposition === 'clarify'
    ? disposition
    : 'clarify';
}

function normalizeReadingReceiptDisposition(
  disposition: ReadingReceiptBoardDisposition | undefined,
): ReadingReceiptDisposition {
  return disposition && disposition !== 'clarify' ? disposition : 'include';
}

function readingReceiptSourceUpdatedAt(
  article: ArticleRecord,
  evidenceUnits: ReturnType<typeof buildReadingCardEvidenceUnits>,
) {
  const latest = evidenceUnits.reduce(
    (max, unit) => Math.max(max, Date.parse(unit.updatedAt), Date.parse(unit.createdAt)),
    Date.parse(article.createdAt),
  );
  return new Date(latest).toISOString();
}

function ReadingCardWorkflow({
  actions,
  receiptClarifyCount,
  steps,
}: {
  actions: Record<ReadingCardWorkflowStepId, () => void>;
  receiptClarifyCount: number;
  steps: ReadingCardWorkflowStep[];
}) {
  const step = currentReadingReceiptStep(steps);
  const blockedByTriage = receiptClarifyCount > 0 && step.id !== 'review';

  return (
    <section className="reading-card-workflow" aria-label="读后回执生成流程">
      <article className={`reading-card-workflow-step is-${step.state}`} key={step.id}>
        <header>
          <span className="reading-card-workflow-index" aria-hidden="true">
            {step.state === 'running' ? (
              <LoaderCircle className="reading-card-spin" size={15} />
            ) : step.state === 'done' ? (
              <Check size={15} />
            ) : (
              step.number
            )}
          </span>
          <div>
            <span>当前节点</span>
            <strong>{readingReceiptStepTitle(step)}</strong>
            <p>
              {blockedByTriage
                ? `还有 ${receiptClarifyCount} 条材料待澄清`
                : readingReceiptStepDescription(step)}
            </p>
          </div>
        </header>
        <Button
          type="button"
          size="sm"
          variant={step.state === 'active' || step.state === 'error' ? 'default' : 'secondary'}
          disabled={step.disabled || blockedByTriage}
          onClick={actions[step.id]}
        >
          {step.id === 'deliberation' ? <ListChecks size={14} /> : null}
          {step.id === 'card' ? <Sparkles size={14} /> : null}
          {step.id === 'review' ? <Scale size={14} /> : null}
          {blockedByTriage ? `待澄清 ${receiptClarifyCount}` : readingReceiptStepActionLabel(step)}
        </Button>
      </article>
    </section>
  );
}

function currentReadingReceiptStep(steps: ReadingCardWorkflowStep[]) {
  return (
    steps.find((step) => step.state === 'running') ||
    steps.find((step) => step.state === 'error') ||
    steps.find((step) => step.state === 'active') ||
    steps.toReversed().find((step) => step.state === 'done') ||
    steps[0]
  );
}

function readingReceiptStepTitle(step: ReadingCardWorkflowStep) {
  if (step.id === 'deliberation') return '拣选';
  if (step.id === 'card') return '整理回执';
  return '审阅席';
}

function readingReceiptStepDescription(step: ReadingCardWorkflowStep) {
  if (step.id === 'deliberation') {
    if (step.state === 'running') return '正在把纳入材料整理成阅读所得';
    if (step.state === 'done') return step.description;
    if (step.state === 'error') return '阅读所得生成失败，可重试';
    if (step.description.includes('新批注') || step.description.includes('新讨论')) {
      return step.description;
    }
    return '把要进入阅读所得的材料拣出来';
  }
  if (step.id === 'card') {
    if (step.state === 'running') return '正在打磨可回看的回执';
    if (step.state === 'done') return step.description.replace('已提炼', '已整理');
    if (step.state === 'error') return '整理失败，可重试';
    if (step.description.includes('新痕迹') || step.description.includes('等待重新')) {
      return step.description;
    }
    if (step.state === 'active') return '生成一句话带走和可保存成稿';
    return '先生成阅读所得';
  }
  if (step.state === 'running') return '审阅助手正在检查证据和表达';
  if (step.state === 'done') return step.description.replace('已审核', '已检查');
  if (step.state === 'error') return '检查失败，可重试';
  if (step.description.includes('新痕迹') || step.description.includes('等待重新')) {
    return step.description;
  }
  if (step.state === 'active') return '检查证据、读者声音和行动边界';
  return '回执生成后可检查';
}

function readingReceiptStepActionLabel(step: ReadingCardWorkflowStep) {
  if (step.id === 'deliberation') {
    return step.state === 'done' || step.actionLabel.includes('重新')
      ? '重新生成阅读所得'
      : '生成阅读所得';
  }
  if (step.id === 'card') return step.state === 'done' ? '重新打磨' : '打磨成回执';
  return step.state === 'done' ? '重新检查' : '请审阅席检查';
}

export function ReadingCardReviewAgentStrip({
  reviewAgents,
  selectedReviewAgentIds,
  onToggleReviewAgent,
}: {
  reviewAgents: Agent[];
  selectedReviewAgentIds: string[];
  onToggleReviewAgent: (agentId: string) => void;
}) {
  return (
    <div className="reading-card-review-agent-strip">
      <header>
        <span>审阅席</span>
        <p>选择稍后检查这份回执的视角</p>
      </header>
      {reviewAgents.length > 0 ? (
        <div>
          {reviewAgents.map((agent) => {
            const selected = selectedReviewAgentIds.includes(agent.id);
            return (
              <button
                aria-pressed={selected}
                className={selected ? 'is-selected' : ''}
                key={agent.id}
                type="button"
                onClick={() => onToggleReviewAgent(agent.id)}
              >
                <i style={{ background: agent.annotationColor }} />
                <AvatarImage
                  value={agent.avatar}
                  className="size-6"
                  fallback={agent.nickname.slice(0, 1) || 'AI'}
                />
                <strong>{agent.nickname}</strong>
                {selected ? <Check size={13} /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <p>请先在助手设置中创建审阅助手。</p>
      )}
    </div>
  );
}
