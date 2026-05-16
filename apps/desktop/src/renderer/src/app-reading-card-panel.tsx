import React, { useMemo } from 'react';
import { Check, ListChecks, LoaderCircle, Scale, Sparkles } from 'lucide-react';
import type { Agent, ArticleRecord } from '@yomitomo/shared';
import {
  buildReadingCard,
  buildReadingCardEvidenceUnits,
  buildReadingCardSections,
  buildReadingCardStats,
} from '@yomitomo/core';
import { articleIdentityLine, articlePlainText, articleReadingStatsLine } from './app-utils';
import { Button } from './components/ui/button';
import { AvatarImage, CopyIconButton } from './app-ui';
import { useReadingCardWorkflow } from './app-reading-card-workflow';
import type { ReadingCardWorkflowStep, ReadingCardWorkflowStepId } from './app-types';
import {
  ReadingCardDeck,
  ReadingCardEvidencePanel,
  ReadingDeliberationPanel,
} from './app-reading-card-display';

export function ReadingCard({
  article,
  reviewAgents,
  onGenerated,
  onOpenEvidence,
}: {
  article: ArticleRecord | null;
  reviewAgents: Agent[];
  onGenerated: () => void;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const articleText = useMemo(() => (article ? articlePlainText(article) : ''), [article]);
  const stats = useMemo(() => (article ? buildReadingCardStats(article) : null), [article]);
  const evidenceUnits = useMemo(
    () => (article ? buildReadingCardEvidenceUnits(article) : []),
    [article],
  );
  const sections = useMemo(
    () => (article ? buildReadingCardSections(article, articleText) : []),
    [article, articleText],
  );
  const draftSections = sections.filter((section) => section.title !== '阅读轨迹');
  const reviewAgentIds = useMemo(() => reviewAgents.map((agent) => agent.id), [reviewAgents]);
  const {
    actions,
    currentAiCard,
    deliberation,
    errors,
    retryingReviewerId,
    selectedReviewAgentIds,
    workflowSteps,
  } = useReadingCardWorkflow({
    article,
    articleText,
    evidenceUnits,
    reviewAgentIds,
    onGenerated,
  });
  const workflowActions: Record<ReadingCardWorkflowStepId, () => void> = {
    deliberation: actions.generateDeliberation,
    card: actions.generateAiCard,
    review: actions.reviewAiCard,
  };
  const card = article
    ? currentAiCard?.contentMarkdown || buildReadingCard(article, articleText)
    : '';

  if (!article) {
    return (
      <aside className="reading-card">
        <div className="reading-card-empty">选择一篇文章查看读后笔记</div>
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
          <span className="reading-card-current-view">当前：读后笔记</span>
          <CopyIconButton label="复制读后笔记 Markdown" value={card} />
        </div>
      </div>
      <ReadingCardWorkflow actions={workflowActions} steps={workflowSteps} />
      {currentAiCard ? (
        <ReadingCardReviewAgentStrip
          reviewAgents={reviewAgents}
          selectedReviewAgentIds={selectedReviewAgentIds}
          onToggleReviewAgent={actions.toggleReviewAgent}
        />
      ) : null}
      <div className="reading-card-body">
        <div className="reading-card-output-stack">
          {errors.ai ? <p className="reading-card-error">{errors.ai}</p> : null}
          {errors.deliberation ? <p className="reading-card-error">{errors.deliberation}</p> : null}
          {errors.review ? <p className="reading-card-error">{errors.review}</p> : null}
          {deliberation ? (
            <ReadingDeliberationPanel
              deliberation={deliberation}
              evidenceUnits={evidenceUnits}
              onOpenEvidence={onOpenEvidence}
            />
          ) : null}
          {currentAiCard ? (
            <ReadingCardDeck
              article={article}
              evidenceUnits={evidenceUnits}
              readingCard={currentAiCard}
              retryingReviewerId={retryingReviewerId}
              stats={stats}
              onOpenEvidence={onOpenEvidence}
              onRetryReviewer={actions.retryReviewAgent}
            />
          ) : (
            <div className="reading-card-draft-grid">
              {draftSections.map((section) => (
                <section className="reading-card-draft-section" key={section.title}>
                  <h4>{section.title}</h4>
                  <ul>
                    {(section.items.length > 0 ? section.items : ['暂无']).map((item, index) => (
                      <li key={`${section.title}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
        <ReadingCardEvidencePanel evidenceUnits={evidenceUnits} />
      </div>
    </aside>
  );
}

function ReadingCardWorkflow({
  actions,
  steps,
}: {
  actions: Record<ReadingCardWorkflowStepId, () => void>;
  steps: ReadingCardWorkflowStep[];
}) {
  return (
    <section className="reading-card-workflow" aria-label="读后笔记流程进度">
      {steps.map((step) => (
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
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
          </header>
          <Button
            type="button"
            size="sm"
            variant={step.state === 'active' || step.state === 'error' ? 'default' : 'secondary'}
            disabled={step.disabled}
            onClick={actions[step.id]}
          >
            {step.id === 'deliberation' ? <ListChecks size={14} /> : null}
            {step.id === 'card' ? <Sparkles size={14} /> : null}
            {step.id === 'review' ? <Scale size={14} /> : null}
            {step.actionLabel}
          </Button>
        </article>
      ))}
    </section>
  );
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
      <span>审核助手</span>
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
        <p>请先在助手设置中创建审核助手。</p>
      )}
    </div>
  );
}
