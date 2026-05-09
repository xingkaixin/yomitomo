import React, { useEffect, useMemo, useState } from 'react';
import { Check, ListChecks, LoaderCircle, RefreshCcw, Scale, Sparkles } from 'lucide-react';
import type {
  Agent,
  ArticleRecord,
  ReadingDeliberationRecord,
  ReadingCardRecord,
  ReadingCardReviewRecord,
  ReadingCardReviewerResult,
  ReadingCardSection as PersistedReadingCardSection,
} from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import {
  buildReadingCard,
  buildReadingCardEvidenceUnits,
  buildReadingCardSections,
  buildReadingCardStats,
  questionStatusLabel,
  type ReadingCardEvidenceUnit,
} from '@yomitomo/core';
import {
  articleIdentityLine,
  articlePlainText,
  articleReadingStatsLine,
  formatDate,
  formatDateTime,
} from './app-utils';
import { Button } from './components/ui/button';
import { AvatarImage, CopyIconButton } from './app-ui';
import type { ReadingCardWorkflowStep } from './app-types';

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
  const [deliberation, setDeliberation] = useState<ReadingDeliberationRecord | null>(null);
  const [deliberationError, setDeliberationError] = useState('');
  const [deliberationState, setDeliberationState] = useState<
    'idle' | 'generating' | 'done' | 'error'
  >('idle');
  const [aiCard, setAiCard] = useState<ReadingCardRecord | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiState, setAiState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [reviewError, setReviewError] = useState('');
  const [reviewState, setReviewState] = useState<'idle' | 'reviewing' | 'done' | 'error'>('idle');
  const [retryingReviewerId, setRetryingReviewerId] = useState<string | null>(null);
  const [selectedReviewAgentIds, setSelectedReviewAgentIds] = useState<string[]>([]);
  const deliberationTime = deliberation ? Date.parse(deliberation.updatedAt) : 0;
  const aiCardTime = aiCard ? Date.parse(aiCard.updatedAt) : 0;
  const reviewTime = aiCard?.review ? Date.parse(aiCard.review.updatedAt) : 0;
  const aiCardIsCurrent = Boolean(aiCard && deliberation && aiCardTime >= deliberationTime);
  const reviewIsCurrent = Boolean(aiCard?.review && aiCardIsCurrent && reviewTime >= aiCardTime);
  const currentAiCard = aiCardIsCurrent
    ? { ...aiCard, review: reviewIsCurrent ? aiCard?.review : undefined }
    : null;
  const isWorkflowBusy =
    deliberationState === 'generating' || aiState === 'generating' || reviewState === 'reviewing';
  const articleText = useMemo(() => (article ? articlePlainText(article) : ''), [article]);
  const card = article
    ? currentAiCard?.contentMarkdown || buildReadingCard(article, articleText)
    : '';
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
  const reviewAgentKey = reviewAgentIds.join('|');

  useEffect(() => {
    setDeliberation(article?.readingDeliberation || null);
    setDeliberationError('');
    setDeliberationState(article?.readingDeliberation ? 'done' : 'idle');
    setAiCard(article?.readingCard || null);
    setAiError('');
    setAiState(article?.readingCard ? 'done' : 'idle');
    setReviewError('');
    setRetryingReviewerId(null);
    setReviewState(article?.readingCard?.review ? 'done' : 'idle');
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

  const workflowSteps: ReadingCardWorkflowStep[] = [
    {
      id: 'deliberation',
      number: 1,
      title: '阅读评估',
      description:
        deliberationState === 'generating'
          ? '正在整理证据与分歧'
          : deliberationState === 'error'
            ? '生成失败，可重试'
            : deliberation
              ? `已生成 · ${formatDate(deliberation.updatedAt)}`
              : '从批注和讨论生成报告',
      state:
        deliberationState === 'generating'
          ? 'running'
          : deliberationState === 'error'
            ? 'error'
            : deliberation
              ? 'done'
              : 'active',
      actionLabel: deliberation ? '重新生成' : '生成审议',
      disabled: isWorkflowBusy,
      onAction: generateDeliberation,
    },
    {
      id: 'card',
      number: 2,
      title: 'AI 提炼',
      description:
        aiState === 'generating'
          ? '正在提炼读后笔记'
          : aiState === 'error'
            ? '生成失败，可重试'
            : currentAiCard
              ? `已提炼 · ${formatDate(currentAiCard.updatedAt)}`
              : aiCard && deliberation
                ? '审议已更新，等待重新提炼'
                : deliberation
                  ? '基于审议报告生成笔记'
                  : '完成审议后开始',
      state:
        aiState === 'generating'
          ? 'running'
          : aiState === 'error'
            ? 'error'
            : currentAiCard
              ? 'done'
              : deliberation
                ? 'active'
                : 'waiting',
      actionLabel: currentAiCard ? '重新提炼' : 'AI 提炼',
      disabled: !deliberation || isWorkflowBusy,
      onAction: generateAiCard,
    },
    {
      id: 'review',
      number: 3,
      title: '笔记草稿',
      description:
        reviewState === 'reviewing'
          ? '审核助手正在检查'
          : reviewState === 'error'
            ? '审核失败，可重试'
            : currentAiCard?.review
              ? `已审核 · ${formatDate(currentAiCard.review.updatedAt)}`
              : currentAiCard && aiCard?.review
                ? '读后笔记已更新，等待重新审核'
                : currentAiCard
                  ? selectedReviewAgentIds.length > 0
                    ? '草稿已生成，可审核'
                    : '请选择审核助手'
                  : '完成 AI 提炼后开始',
      state:
        reviewState === 'reviewing'
          ? 'running'
          : reviewState === 'error'
            ? 'error'
            : currentAiCard?.review
              ? 'done'
              : currentAiCard
                ? 'active'
                : 'waiting',
      actionLabel: currentAiCard?.review ? '重新审核' : '审核草稿',
      disabled: !currentAiCard || selectedReviewAgentIds.length === 0 || isWorkflowBusy,
      onAction: reviewAiCard,
    },
  ];

  async function generateAiCard() {
    if (!article || !deliberation || aiState === 'generating' || isWorkflowBusy) return;
    setAiState('generating');
    setAiError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingDeliberation: deliberation || undefined,
      });
      setAiCard(result.readingCard);
      setAiState('done');
      setReviewError('');
      setReviewState('idle');
      onGenerated();
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 提炼失败');
      setAiState('error');
    }
  }

  async function generateDeliberation() {
    if (!article || isWorkflowBusy) return;
    setDeliberationState('generating');
    setDeliberationError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingDeliberation({
        article,
        articleText,
        evidenceUnits,
      });
      setDeliberation(result.readingDeliberation);
      setDeliberationState('done');
      setAiState('idle');
      setReviewState('idle');
      setReviewError('');
      onGenerated();
    } catch (error) {
      setDeliberationError(error instanceof Error ? error.message : '阅读审议生成失败');
      setDeliberationState('error');
    }
  }

  async function reviewAiCard() {
    if (!article || !currentAiCard || reviewState === 'reviewing' || isWorkflowBusy) return;
    if (selectedReviewAgentIds.length === 0) {
      setReviewError('请选择审核助手');
      return;
    }
    setReviewState('reviewing');
    setReviewError('');
    try {
      const result = await window.yomitomoDesktop.reviewReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingCard: currentAiCard,
        reviewAgentIds: selectedReviewAgentIds,
      });
      setAiCard({ ...currentAiCard, review: result.review });
      setReviewState('done');
      onGenerated();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : '读后笔记审稿失败');
      setReviewState('error');
    }
  }

  async function retryReviewAgent(agentId: string) {
    if (!article || !currentAiCard || reviewState === 'reviewing' || retryingReviewerId) return;
    setReviewState('reviewing');
    setRetryingReviewerId(agentId);
    setReviewError('');
    try {
      const result = await window.yomitomoDesktop.reviewReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingCard: currentAiCard,
        previousReview: currentAiCard.review,
        reviewAgentIds: [agentId],
      });
      setAiCard({ ...currentAiCard, review: result.review });
      setReviewState('done');
      onGenerated();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : '读后笔记审稿失败');
      setReviewState('error');
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
      <ReadingCardWorkflow steps={workflowSteps} />
      {currentAiCard ? (
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
                    onClick={() => toggleReviewAgent(agent.id)}
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
      ) : null}
      <div className="reading-card-body">
        <div className="reading-card-output-stack">
          {aiError ? <p className="reading-card-error">{aiError}</p> : null}
          {deliberationError ? <p className="reading-card-error">{deliberationError}</p> : null}
          {reviewError ? <p className="reading-card-error">{reviewError}</p> : null}
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
              onRetryReviewer={retryReviewAgent}
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
        <section className="reading-card-evidence-section">
          <header>
            <div>
              <span>阅读痕迹素材</span>
              <h4>可回溯原文、批注和讨论</h4>
            </div>
            <strong>{evidenceUnits.length}</strong>
          </header>
          {evidenceUnits.length > 0 ? (
            <div className="reading-card-evidence-list">
              {evidenceUnits.map((unit) => (
                <ReadingCardEvidence unit={unit} key={unit.id} />
              ))}
            </div>
          ) : (
            <p className="reading-card-placeholder">暂无</p>
          )}
        </section>
      </div>
    </aside>
  );
}

function ReadingCardWorkflow({ steps }: { steps: ReadingCardWorkflowStep[] }) {
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
            onClick={step.onAction}
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

function ReadingDeliberationPanel({
  deliberation,
  evidenceUnits,
  onOpenEvidence,
}: {
  deliberation: ReadingDeliberationRecord;
  evidenceUnits: ReadingCardEvidenceUnit[];
  onOpenEvidence: (annotationId: string) => void;
}) {
  const evidenceByIndex = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.index, unit])),
    [evidenceUnits],
  );
  const sections =
    deliberation.sections.length > 0
      ? deliberation.sections
      : parseReadingCardMarkdownSections(deliberation.contentMarkdown);

  function openEvidence(event: React.MouseEvent<HTMLDivElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <section className="reading-deliberation-panel">
      <header>
        <div>
          <span>阅读审议</span>
          <h4>{deliberation.title}</h4>
        </div>
        <time>{formatDate(deliberation.updatedAt)}</time>
      </header>
      <div className="reading-deliberation-sections" onClick={openEvidence}>
        {sections.map((section) => (
          <article key={section.title}>
            <h5>{section.title}</h5>
            <div
              className="reading-card-markdown"
              dangerouslySetInnerHTML={{
                __html: renderReadingCardMarkdown(section.content, evidenceByIndex),
              }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function ReadingCardEvidence({ unit }: { unit: ReadingCardEvidenceUnit }) {
  return (
    <article className="reading-card-evidence">
      <header>
        <span className="reading-card-evidence-index">{unit.index}</span>
        <div className="reading-card-evidence-heading">
          <div className="reading-card-evidence-chips">
            {unit.annotationType ? <span>{unit.annotationType}</span> : null}
            {unit.questionStatus ? <span>{questionStatusLabel(unit.questionStatus)}</span> : null}
            <span>{unit.annotationAuthorLabel}</span>
          </div>
          <time>{formatDateTime(unit.createdAt)}</time>
        </div>
      </header>
      <blockquote>{unit.quote}</blockquote>
      {unit.annotationBody || unit.comments.length > 0 ? (
        <div className="reading-card-thread">
          {unit.annotationBody ? (
            <div className="reading-card-comment">
              <strong>{unit.annotationBody.authorLabel} · 批注</strong>
              {unit.annotationBody.questionStatus ? (
                <span>{questionStatusLabel(unit.annotationBody.questionStatus)}</span>
              ) : null}
              <p>{unit.annotationBody.content}</p>
            </div>
          ) : null}
          {unit.comments.map((comment) => (
            <div className="reading-card-comment" key={comment.id}>
              <strong>{comment.authorLabel} · 评论</strong>
              {comment.questionStatus ? (
                <span>{questionStatusLabel(comment.questionStatus)}</span>
              ) : null}
              <p>{comment.content}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ReadingCardDeck({
  article,
  evidenceUnits,
  readingCard,
  retryingReviewerId,
  stats,
  onOpenEvidence,
  onRetryReviewer,
}: {
  article: ArticleRecord;
  evidenceUnits: ReadingCardEvidenceUnit[];
  readingCard: ReadingCardRecord;
  retryingReviewerId: string | null;
  stats: ReturnType<typeof buildReadingCardStats> | null;
  onOpenEvidence: (annotationId: string) => void;
  onRetryReviewer: (reviewerId: string) => void;
}) {
  const sections = normalizeReadingCardViewSections(readingCard);

  return (
    <div className="reading-card-deck">
      <section className="reading-card-cover">
        <div>
          <span>笔记草稿</span>
          <h4>{article.title}</h4>
        </div>
        <dl>
          <div>
            <dt>批注</dt>
            <dd>{stats?.annotations ?? 0}</dd>
          </div>
          <div>
            <dt>评论</dt>
            <dd>{stats?.comments ?? 0}</dd>
          </div>
          <div>
            <dt>助手</dt>
            <dd>{stats?.aiContributions ?? 0}</dd>
          </div>
        </dl>
        <p>
          {readingCard.providerName || '任务供应商'} · {readingCard.modelName || '模型未记录'} ·{' '}
          {formatDate(readingCard.updatedAt)}
        </p>
      </section>

      {readingCard.review ? (
        <ReadingCardReviewPanel
          evidenceUnits={evidenceUnits}
          retryingReviewerId={retryingReviewerId}
          review={readingCard.review}
          onOpenEvidence={onOpenEvidence}
          onRetryReviewer={onRetryReviewer}
        />
      ) : null}

      {sections.map((section) => (
        <ReadingCardSectionCard
          evidenceUnits={evidenceUnits}
          section={section}
          key={section.title}
          onOpenEvidence={onOpenEvidence}
        />
      ))}
    </div>
  );
}

function ReadingCardReviewPanel({
  evidenceUnits,
  retryingReviewerId,
  review,
  onOpenEvidence,
  onRetryReviewer,
}: {
  evidenceUnits: ReadingCardEvidenceUnit[];
  retryingReviewerId: string | null;
  review: ReadingCardReviewRecord;
  onOpenEvidence: (annotationId: string) => void;
  onRetryReviewer: (reviewerId: string) => void;
}) {
  const evidenceByIndex = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.index, unit])),
    [evidenceUnits],
  );
  const issueCount = review.reviewerResults.reduce(
    (count, result) => count + result.findings.length,
    0,
  );
  const passCount = review.reviewerResults.filter((result) => result.verdict === 'pass').length;

  return (
    <section className="reading-card-review-panel">
      <header>
        <div>
          <span>审稿结果</span>
          <h4>读后笔记审核</h4>
        </div>
        <time>{formatDate(review.updatedAt)}</time>
      </header>
      <div className="reading-card-review-summary">
        <div>
          <strong>{review.reviewerResults.length}</strong>
          <span>审核助手</span>
        </div>
        <div>
          <strong>{passCount}</strong>
          <span>通过</span>
        </div>
        <div>
          <strong>{issueCount}</strong>
          <span>问题</span>
        </div>
      </div>
      <div className="reading-card-reviewers">
        {review.reviewerResults.map((result) => (
          <ReadingCardReviewerCard
            evidenceByIndex={evidenceByIndex}
            retrying={retryingReviewerId === result.reviewerId}
            result={result}
            key={result.id}
            onOpenEvidence={onOpenEvidence}
            onRetry={() => onRetryReviewer(result.reviewerId)}
          />
        ))}
      </div>
    </section>
  );
}

function ReadingCardReviewerCard({
  evidenceByIndex,
  retrying,
  result,
  onOpenEvidence,
  onRetry,
}: {
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>;
  retrying: boolean;
  result: ReadingCardReviewerResult;
  onOpenEvidence: (annotationId: string) => void;
  onRetry: () => void;
}) {
  const canRetry = reviewerResultCanRetry(result);

  function openEvidence(event: React.MouseEvent<HTMLElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <article className="reading-card-reviewer-card">
      <header>
        <AvatarImage
          value={result.reviewerAvatar}
          className="size-8"
          fallback={result.reviewerNickname.slice(0, 1) || 'AI'}
        />
        <div>
          <strong>{result.reviewerNickname}</strong>
          <span>@{result.reviewerUsername}</span>
        </div>
        <mark className={result.verdict === 'pass' ? 'is-pass' : 'is-revise'}>
          {result.verdict === 'pass' ? '通过' : '需修改'}
        </mark>
        {canRetry ? (
          <button
            aria-label={`重新审核 ${result.reviewerNickname}`}
            className="reading-card-reviewer-retry"
            type="button"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? (
              <LoaderCircle className="reading-card-spin" size={13} />
            ) : (
              <RefreshCcw size={13} />
            )}
            {retrying ? '审核中' : '重新审核'}
          </button>
        ) : null}
      </header>
      {result.summary ? (
        <p
          onClick={openEvidence}
          dangerouslySetInnerHTML={{
            __html: renderReadingCardInlineMarkdown(result.summary, evidenceByIndex),
          }}
        />
      ) : null}
      {result.findings.length > 0 ? (
        <div className="reading-card-review-findings">
          {result.findings.map((finding, index) => (
            <article className="reading-card-review-finding" key={`${finding.problem}-${index}`}>
              <header>
                <span className={`is-${finding.severity}`}>
                  {reviewSeverityLabel(finding.severity)}
                </span>
                <strong>{finding.section || '整篇笔记'}</strong>
                {finding.evidenceIds.length > 0 ? (
                  <em
                    onClick={openEvidence}
                    dangerouslySetInnerHTML={{
                      __html: renderReadingCardEvidenceReferenceList(
                        finding.evidenceIds,
                        evidenceByIndex,
                      ),
                    }}
                  />
                ) : null}
              </header>
              <p
                onClick={openEvidence}
                dangerouslySetInnerHTML={{
                  __html: renderReadingCardInlineMarkdown(finding.problem, evidenceByIndex),
                }}
              />
              {finding.suggestedRewrite ? (
                <blockquote
                  onClick={openEvidence}
                  dangerouslySetInnerHTML={{
                    __html: renderReadingCardInlineMarkdown(
                      finding.suggestedRewrite,
                      evidenceByIndex,
                    ),
                  }}
                />
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="reading-card-review-empty">未发现需要修改的问题。</p>
      )}
      <ReadingCardReviewList
        evidenceByIndex={evidenceByIndex}
        title="保留点"
        items={result.acceptedClaims}
        onOpenEvidence={onOpenEvidence}
      />
      <ReadingCardReviewList
        evidenceByIndex={evidenceByIndex}
        title="缺口"
        items={result.missingAngles}
        onOpenEvidence={onOpenEvidence}
      />
    </article>
  );
}

function reviewerResultCanRetry(result: ReadingCardReviewerResult) {
  if (result.status === 'error') return true;
  const retryableText = [
    result.summary,
    result.rawResponse,
    ...result.findings.map((finding) => finding.problem),
  ].join('\n');
  return /没有完成审稿|JSON 解析失败|格式异常|max_tokens|max_output_tokens|结构化 JSON/.test(
    retryableText,
  );
}

function ReadingCardReviewList({
  evidenceByIndex,
  title,
  items,
  onOpenEvidence,
}: {
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>;
  title: string;
  items: string[];
  onOpenEvidence: (annotationId: string) => void;
}) {
  if (items.length === 0) return null;

  function openEvidence(event: React.MouseEvent<HTMLElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <div className="reading-card-review-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`} onClick={openEvidence}>
            <span
              dangerouslySetInnerHTML={{
                __html: renderReadingCardInlineMarkdown(item, evidenceByIndex),
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function reviewSeverityLabel(severity: ReadingCardReviewerResult['findings'][number]['severity']) {
  return severity === 'high' ? '高' : severity === 'low' ? '低' : '中';
}

function ReadingCardSectionCard({
  evidenceUnits,
  section,
  onOpenEvidence,
}: {
  evidenceUnits: ReadingCardEvidenceUnit[];
  section: PersistedReadingCardSection;
  onOpenEvidence: (annotationId: string) => void;
}) {
  const blocks = splitReadingCardSection(section.content);
  const isCore = section.title === '核心主张';
  const evidenceByIndex = useMemo(
    () => new Map(evidenceUnits.map((unit) => [unit.index, unit])),
    [evidenceUnits],
  );

  function openEvidence(event: React.MouseEvent<HTMLDivElement>) {
    openReadingCardEvidence(event, evidenceByIndex, onOpenEvidence);
  }

  return (
    <section className={isCore ? 'reading-card-section-card is-core' : 'reading-card-section-card'}>
      <header>
        <span>{readingCardSectionIndex(section.title)}</span>
        <h4>{section.title}</h4>
      </header>
      {blocks.map((block, index) => (
        <article
          className={block.title ? 'reading-card-mini-card has-title' : 'reading-card-mini-card'}
          key={`${section.title}-${block.title || index}`}
        >
          {block.title ? <h5>{block.title}</h5> : null}
          <div
            className="reading-card-markdown"
            dangerouslySetInnerHTML={{
              __html: renderReadingCardMarkdown(block.content, evidenceByIndex),
            }}
            onClick={openEvidence}
          />
        </article>
      ))}
    </section>
  );
}

function normalizeReadingCardViewSections(
  readingCard: ReadingCardRecord,
): PersistedReadingCardSection[] {
  if (readingCard.sections.length > 0) return readingCard.sections;
  return parseReadingCardMarkdownSections(readingCard.contentMarkdown);
}

function parseReadingCardMarkdownSections(markdown: string): PersistedReadingCardSection[] {
  const sections: PersistedReadingCardSection[] = [];
  let current: PersistedReadingCardSection | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) continue;
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }
  if (current) sections.push(current);
  return sections;
}

function splitReadingCardSection(content: string) {
  const blocks: Array<{ title?: string; content: string }> = [];
  let current: { title?: string; content: string } | null = null;

  for (const line of content.split('\n')) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      if (current) blocks.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) current = { content: '' };
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }

  if (current && (current.title || current.content)) blocks.push(current);
  return blocks.length > 0 ? blocks : [{ content: '暂无' }];
}

function renderReadingCardMarkdown(
  content: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
) {
  return replaceReadingCardEvidenceReferences(renderMarkdown(content), evidenceByIndex);
}

function renderReadingCardInlineMarkdown(
  content: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
) {
  const html = renderReadingCardMarkdown(content, evidenceByIndex);
  const paragraph = html.match(/^<p>([\s\S]*)<\/p>$/);
  return paragraph ? paragraph[1] : html;
}

function replaceReadingCardEvidenceReferences(
  html: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) =>
      part.startsWith('<') ? part : renderReadingCardEvidenceReferences(part, evidenceByIndex),
    )
    .join('');
}

function renderReadingCardEvidenceReferences(
  text: string,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
) {
  return text.replace(/\[#(\d+)\]|#(\d+)/g, (match, bracketValue: string, plainValue: string) => {
    const index = Number(bracketValue || plainValue);
    const unit = evidenceByIndex.get(index);
    return unit ? renderReadingCardEvidenceReference(unit) : match;
  });
}

function renderReadingCardEvidenceReferenceList(
  evidenceIds: number[],
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
) {
  return evidenceIds
    .map((id) => {
      const unit = evidenceByIndex.get(id);
      return unit ? renderReadingCardEvidenceReference(unit) : `#${id}`;
    })
    .join(' ');
}

function renderReadingCardEvidenceReference(unit: ReadingCardEvidenceUnit) {
  const index = unit.index;
  const meta = [
    unit.annotationType || '批注',
    unit.annotationAuthorLabel,
    formatDateTime(unit.createdAt),
  ].join(' · ');
  return `<button class="reading-card-ref" type="button" data-reading-card-evidence-index="${index}" aria-label="打开批注 #${index}">
      <span class="reading-card-ref-label">#${index}</span>
      <span class="reading-card-ref-popover" role="tooltip">
        <strong>批注 #${index}</strong>
        <em>${escapeHtml(meta)}</em>
        <q>${escapeHtml(unit.quote)}</q>
        ${
          unit.annotationBody
            ? `<span class="reading-card-ref-comments"><span><b>${escapeHtml(
                unit.annotationBody.authorLabel,
              )} · 批注</b>${escapeHtml(unit.annotationBody.content)}</span></span>`
            : ''
        }
      </span>
    </button>`;
}

function openReadingCardEvidence(
  event: React.MouseEvent<HTMLElement>,
  evidenceByIndex: Map<number, ReadingCardEvidenceUnit>,
  onOpenEvidence: (annotationId: string) => void,
) {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('[data-reading-card-evidence-index]');
  if (!button) return;
  const index = Number(button.dataset.readingCardEvidenceIndex);
  const unit = evidenceByIndex.get(index);
  if (unit) onOpenEvidence(unit.id);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readingCardSectionIndex(title: string) {
  const order = ['核心主张', '我关注了什么', '讨论中浮现了什么', '可复用洞见', '后续行动线索'];
  const index = order.indexOf(title);
  return index >= 0 ? String(index + 1).padStart(2, '0') : '·';
}
