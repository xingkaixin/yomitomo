import React, { useMemo } from 'react';
import { Lightbulb, Puzzle, Sparkles, Sprout, TriangleAlert, type LucideIcon } from 'lucide-react';
import type {
  AnnotationType,
  ArticleRecord,
  ReadingCardRecord,
  ReadingCardSection as PersistedReadingCardSection,
  ReadingDeliberationRecord,
} from '@yomitomo/shared';
import {
  buildReadingCardStats,
  questionStatusLabel,
  type ReadingCardEvidenceUnit,
} from '@yomitomo/core';
import { formatDate, formatDateTime } from './app-utils';
import {
  openReadingCardEvidence,
  parseReadingCardMarkdownSections,
  readingCardSectionIndex,
  renderReadingCardMarkdown,
  splitReadingCardSection,
} from './app-reading-card-markdown';
import { ReadingCardReviewPanel } from './app-reading-card-review';

const annotationTypeIcons: Record<AnnotationType, LucideIcon> = {
  key_point: Lightbulb,
  assumption: TriangleAlert,
  concept: Puzzle,
  question: Sprout,
  quote: Sparkles,
};

export function ReadingDeliberationPanel({
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

export function ReadingCardEvidencePanel({
  evidenceUnits,
}: {
  evidenceUnits: ReadingCardEvidenceUnit[];
}) {
  return (
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
  );
}

function ReadingCardEvidence({ unit }: { unit: ReadingCardEvidenceUnit }) {
  return (
    <article className="reading-card-evidence">
      <header>
        <span className="reading-card-evidence-index">{unit.index}</span>
        <div className="reading-card-evidence-heading">
          <div className="reading-card-evidence-chips">
            {unit.annotationType ? <ReadingCardAnnotationTypeChip unit={unit} /> : null}
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

function ReadingCardAnnotationTypeChip({ unit }: { unit: ReadingCardEvidenceUnit }) {
  const Icon = unit.annotationTypeKey ? annotationTypeIcons[unit.annotationTypeKey] : null;
  return (
    <span>
      {Icon ? (
        <Icon
          aria-hidden="true"
          className="reading-card-evidence-chip-icon"
          focusable="false"
          size={12}
          strokeWidth={2.4}
        />
      ) : null}
      {unit.annotationType}
    </span>
  );
}

export function ReadingCardDeck({
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
