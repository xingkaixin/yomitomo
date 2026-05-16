import React, { useMemo } from 'react';
import { LoaderCircle, RefreshCcw } from 'lucide-react';
import type { ReadingCardReviewRecord, ReadingCardReviewerResult } from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit } from '@yomitomo/core';
import { AvatarImage } from './app-ui';
import { formatDate } from './app-utils';
import {
  openReadingCardEvidence,
  renderReadingCardEvidenceReferenceList,
  renderReadingCardInlineMarkdown,
} from './app-reading-card-markdown';

export function ReadingCardReviewPanel({
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
          <span>审阅席</span>
          <h4>审阅助手检查</h4>
        </div>
        <time>{formatDate(review.updatedAt)}</time>
      </header>
      <div className="reading-card-review-summary">
        <div>
          <strong>{review.reviewerResults.length}</strong>
          <span>审阅助手</span>
        </div>
        <div>
          <strong>{passCount}</strong>
          <span>通过</span>
        </div>
        <div>
          <strong>{issueCount}</strong>
          <span>建议</span>
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
