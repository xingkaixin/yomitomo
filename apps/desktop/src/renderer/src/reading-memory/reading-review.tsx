import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReadingReviewDecision } from '@yomitomo/shared';
import { readingReviewAnswerLimit, type ReadingReviewQueueItem } from '../../../ipc-contract';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { formatDate } from '../shell/app-article-presentation';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { ReadingReviewEvidence } from './reading-review-evidence';
import { ReadingReviewHistory } from './reading-review-history';
import { useReadingReview } from './use-reading-review';
import './reading-review.css';

const decisions: ReadingReviewDecision[] = ['still_agree', 'changed', 'need_evidence'];

export function ReadingReview({
  catalogRevision,
  onOpenEvidenceSource,
}: {
  catalogRevision: unknown;
  onOpenEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
}) {
  const { t } = useTranslation();
  const review = useReadingReview(catalogRevision);
  const { state, queue } = review;
  const queueRegion = useRef<HTMLElement>(null);
  const stageTitle = useRef<HTMLHeadingElement>(null);
  const answerInput = useRef<HTMLTextAreaElement>(null);
  const blindStatus = state.phase === 'blind' ? state.status : null;
  const revealed = 'result' in state ? state.result : null;
  const evidenceResult =
    review.comparison && 'result' in review.comparison ? review.comparison.result : null;

  useEffect(() => {
    if (state.phase === 'queue') return;
    if (state.phase === 'blind' && blindStatus === 'ready') answerInput.current?.focus();
    else stageTitle.current?.focus();
    return () => queueRegion.current?.focus();
  }, [state.phase, blindStatus]);

  return (
    <div className="reading-review">
      <div className="reading-review-inner">
        <header className="reading-review-heading">
          <h1>{t('readingMemory.review.title')}</h1>
          <p>{t('readingMemory.review.description')}</p>
          <p className="reading-review-progress" role="status">
            {t('readingMemory.review.completedCount', { count: review.completedCount })}
          </p>
        </header>

        {state.phase === 'queue' ? (
          <section
            ref={queueRegion}
            tabIndex={-1}
            className="reading-review-queue"
            aria-label={t('readingMemory.review.title')}
          >
            {queue.status === 'loading' ? (
              <p role="status">{t('readingMemory.review.queueLoading')}</p>
            ) : null}
            {queue.status === 'failed' ? (
              <div>
                <p role="alert">{t('readingMemory.review.queueFailed')}</p>
                <Button type="button" variant="secondary" onClick={() => void review.loadQueue()}>
                  {t('readingMemory.review.retryQueue')}
                </Button>
              </div>
            ) : null}
            {queue.status === 'ready' ? (
              <>
                <div className="reading-review-queue-summary">
                  <h2>{t('readingMemory.review.queueCount', { count: review.items.length })}</h2>
                  <p>
                    {t(
                      queue.result.mode === 'semantic'
                        ? 'readingMemory.review.semanticOrder'
                        : 'readingMemory.review.timeOrder',
                    )}
                  </p>
                  <p>
                    {t('readingMemory.review.candidateCoverage', {
                      eligible: queue.result.coverage.eligibleAssetCount,
                      time: queue.result.coverage.timeCandidateCount,
                      semantic: queue.result.coverage.semanticCandidateCount,
                    })}
                  </p>
                  {queue.result.mode === 'semantic' ? (
                    <p>
                      {t('readingMemory.review.candidateWindow', {
                        candidates: queue.result.semanticWindow.candidateLimit,
                        evidence: queue.result.semanticWindow.evidenceLimit,
                        days: queue.result.semanticWindow.lookbackDays,
                      })}
                    </p>
                  ) : null}
                </div>
                {review.items.length === 0 ? (
                  <div className="reading-review-empty">
                    <p>{t('readingMemory.review.emptyQueue')}</p>
                    {review.completedCount === 0 ? (
                      <p>{t('readingMemory.review.emptyHint')}</p>
                    ) : null}
                  </div>
                ) : (
                  <ol className="reading-review-queue-list">
                    {review.items.map((item) => (
                      <li key={`${item.asset.assetType}:${item.asset.assetId}`}>
                        <article
                          className="reading-review-queue-item"
                          aria-label={item.source.title}
                        >
                          <ReviewSource item={item} />
                          <div className="reading-review-actions">
                            <Button type="button" onClick={() => void review.start(item)}>
                              {t('readingMemory.review.start')}
                            </Button>
                          </div>
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : null}
          </section>
        ) : null}

        {state.phase === 'blind' ? (
          <section
            className="reading-review-stage"
            aria-label={t('readingMemory.review.blindTitle')}
          >
            <h2 ref={stageTitle} tabIndex={-1}>
              {t('readingMemory.review.blindTitle')}
            </h2>
            <ReviewSource item={'session' in state ? state.session : state.item} />
            <p>{t('readingMemory.review.blindDescription')}</p>
            {state.status === 'starting' ? (
              <p role="status">{t('readingMemory.review.starting')}</p>
            ) : null}
            {state.status === 'start-failed' ? (
              <div>
                <p role="alert">{t('readingMemory.review.startFailed')}</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void review.start(state.item)}
                >
                  {t('readingMemory.review.retryStart')}
                </Button>
              </div>
            ) : null}
            {'session' in state ? (
              <>
                <label className="reading-review-answer-label">
                  <span>{t('readingMemory.review.answer')}</span>
                  <Textarea
                    ref={answerInput}
                    maxLength={readingReviewAnswerLimit}
                    value={state.answer}
                    readOnly={state.status !== 'ready'}
                    placeholder={t('readingMemory.review.placeholder')}
                    onChange={(event) => review.setAnswer(event.target.value)}
                  />
                </label>
                {state.status === 'revealing' ? (
                  <p role="status">{t('readingMemory.review.revealing')}</p>
                ) : null}
                {state.status === 'reveal-failed' ? (
                  <p role="alert">{t('readingMemory.review.revealFailed')}</p>
                ) : null}
                {state.status === 'conflict' ? (
                  <p role="alert">{t('readingMemory.review.conflict')}</p>
                ) : null}
                <div className="reading-review-actions">
                  {state.status === 'ready' ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void review.reveal(true)}
                      >
                        {t('readingMemory.review.needEvidenceFirst')}
                      </Button>
                      <Button
                        type="button"
                        disabled={!state.answer.trim()}
                        onClick={() => void review.reveal()}
                      >
                        {t('readingMemory.review.reveal')}
                      </Button>
                    </>
                  ) : null}
                  {state.status === 'reveal-failed' ? (
                    <Button type="button" onClick={() => void review.reveal()}>
                      {t('readingMemory.review.retryReveal')}
                    </Button>
                  ) : null}
                  {state.status === 'conflict' ? (
                    <Button type="button" onClick={() => void review.start(state.session)}>
                      {t('readingMemory.review.restart')}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
            <div className="reading-review-actions">
              <Button type="button" variant="secondary" onClick={review.cancel}>
                {t('readingMemory.review.cancel')}
              </Button>
            </div>
          </section>
        ) : null}

        {revealed && (state.phase === 'revealed' || state.phase === 'submitting') ? (
          <section
            className="reading-review-stage"
            aria-label={t('readingMemory.review.revealedTitle')}
          >
            <h2 ref={stageTitle} tabIndex={-1}>
              {t('readingMemory.review.revealedTitle')}
            </h2>
            <ReviewSource item={revealed} />
            <div className="reading-review-view-pair">
              <section aria-label={t('readingMemory.review.currentAnswer')}>
                <h3>{t('readingMemory.review.currentAnswer')}</h3>
                <blockquote>{revealed.answer || t('readingMemory.review.noAnswer')}</blockquote>
              </section>
              <section aria-label={t('readingMemory.review.previousJudgment')}>
                <h3>{t('readingMemory.review.previousJudgment')}</h3>
                <blockquote>{revealed.currentJudgment}</blockquote>
              </section>
            </div>
            <p className="reading-review-note">{t('readingMemory.review.answerFrozen')}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenEvidenceSource({ ...revealed.sourceTarget, view: 'source' })}
            >
              {t('readingEvidence.openSource')}
            </Button>
            {state.phase === 'revealed' ? (
              <fieldset className="reading-review-decision">
                <legend>{t('readingMemory.review.decisionPrompt')}</legend>
                <div className="reading-review-actions">
                  {decisions.map((decision) => (
                    <Button
                      key={decision}
                      type="button"
                      variant={decision === 'need_evidence' ? 'secondary' : 'default'}
                      disabled={decision !== 'need_evidence' && !revealed.answer.trim()}
                      onClick={() => void review.submit(decision)}
                    >
                      {t(`readingMemory.review.decisions.${decision}`)}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {state.phase === 'submitting' ? (
              <div className="reading-review-save-status">
                {state.status === 'pending' ? (
                  <p role="status">{t('readingMemory.review.submitting')}</p>
                ) : (
                  <p role="alert">
                    {t(
                      state.status === 'conflict'
                        ? 'readingMemory.review.conflict'
                        : 'readingMemory.review.submitFailed',
                    )}
                  </p>
                )}
                {state.status === 'failed' ? (
                  <Button type="button" onClick={() => void review.retrySubmit()}>
                    {t('readingMemory.review.retrySubmit')}
                  </Button>
                ) : null}
                {state.status === 'conflict' ? (
                  <Button type="button" onClick={() => void review.start(revealed)}>
                    {t('readingMemory.review.restart')}
                  </Button>
                ) : null}
              </div>
            ) : null}
            <fieldset className="reading-review-support" disabled={state.phase !== 'revealed'}>
              <ReadingReviewEvidence
                provider={evidenceResult ? evidenceResult.provider : revealed.provider}
                state={review.comparison}
                onCompare={() => void review.compare()}
                onConfirmPrivacy={() => void review.confirmComparisonPrivacy()}
                onDismissPrivacy={review.dismissComparisonPrivacy}
                onCancel={review.cancelComparison}
                onOpenEvidenceSource={onOpenEvidenceSource}
              />
              <ReadingReviewHistory
                baseJudgment={revealed.baseJudgment}
                history={revealed.history}
                status={review.historyStatus}
                onLoadMore={() => void review.loadHistory()}
              />
            </fieldset>
            <div className="reading-review-actions">
              <Button type="button" variant="secondary" onClick={review.cancel}>
                {t('readingMemory.review.cancel')}
              </Button>
            </div>
          </section>
        ) : null}

        {state.phase === 'done' ? (
          <section
            className="reading-review-stage"
            aria-label={t('readingMemory.review.doneTitle')}
          >
            <h2 ref={stageTitle} tabIndex={-1}>
              {t('readingMemory.review.doneTitle')}
            </h2>
            <p>{t('readingMemory.review.doneDescription')}</p>
            <strong>{t(`readingMemory.review.decisions.${state.event.decision}`)}</strong>
            {state.event.answer ? (
              <blockquote className="reading-review-saved-answer">{state.event.answer}</blockquote>
            ) : null}
            <div className="reading-review-actions">
              <Button type="button" variant="secondary" onClick={review.cancel}>
                {t('readingMemory.review.returnQueue')}
              </Button>
              {review.items[0] ? (
                <Button type="button" onClick={() => void review.start(review.items[0])}>
                  {t('readingMemory.review.next')}
                </Button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ReviewSource({ item }: { item: ReadingReviewQueueItem }) {
  const { t } = useTranslation();
  return (
    <div className="reading-review-source">
      <strong>{item.source.title}</strong>
      {item.source.byline ? <span>{item.source.byline}</span> : null}
      <blockquote aria-label={t('readingMemory.review.sourceQuote')}>
        {item.quote || t('readingMemory.review.missingQuote')}
      </blockquote>
      <div className="reading-review-source-dates">
        <span>{t('readingMemory.review.formedAt', { date: formatDate(item.formedAt) })}</span>
        <span>
          {item.lastReviewedAt
            ? t('readingMemory.review.lastReviewedAt', { date: formatDate(item.lastReviewedAt) })
            : t('readingMemory.review.neverReviewed')}
        </span>
      </div>
    </div>
  );
}
