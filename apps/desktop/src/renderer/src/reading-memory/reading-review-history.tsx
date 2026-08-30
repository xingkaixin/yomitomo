import { useTranslation } from 'react-i18next';
import { formatDateTimeValue } from '@yomitomo/shared';
import type { ReadingReviewHistoryPage } from '../../../ipc-contract';
import { Button } from '../components/ui/button';
import './reading-review-history.css';

export function ReadingReviewHistory({
  baseJudgment,
  history,
  status,
  onLoadMore,
}: {
  baseJudgment: string;
  history: ReadingReviewHistoryPage;
  status: 'idle' | 'loading' | 'failed';
  onLoadMore: () => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <section
      className="reading-review-history"
      aria-label={t('readingMemory.review.history.title')}
    >
      <h3>{t('readingMemory.review.history.title')}</h3>
      <section
        className="reading-review-history-base"
        aria-label={t('readingMemory.review.history.originalJudgment')}
      >
        <h4>{t('readingMemory.review.history.originalJudgment')}</h4>
        <p className="reading-review-history-text">{baseJudgment}</p>
      </section>
      {history.events.length > 0 ? (
        <ol className="reading-review-history-events">
          {history.events.map((event) => (
            <li key={event.id}>
              <article className="reading-review-history-event">
                <header className="reading-review-history-event-header">
                  <strong className="reading-review-history-decision">
                    {t(`readingMemory.review.decisions.${event.decision}`)}
                  </strong>
                  <time dateTime={event.createdAt}>
                    {formatDateTimeValue(event.createdAt, i18n.language, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </header>
                <dl className="reading-review-history-details">
                  <div>
                    <dt>{t('readingMemory.review.history.snapshot')}</dt>
                    <dd className="reading-review-history-text">{event.judgmentSnapshot}</dd>
                  </div>
                  <div>
                    <dt>{t('readingMemory.review.history.answer')}</dt>
                    <dd className="reading-review-history-text">
                      {event.answer || t('readingMemory.review.history.noAnswer')}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          ))}
        </ol>
      ) : status === 'idle' ? (
        <p className="reading-review-history-status">{t('readingMemory.review.history.empty')}</p>
      ) : null}
      {status === 'loading' ? (
        <p className="reading-review-history-status" role="status">
          {t('readingMemory.review.history.loading')}
        </p>
      ) : null}
      {status === 'failed' ? (
        <p className="reading-review-history-status" role="alert">
          {t('readingMemory.review.history.failed')}
        </p>
      ) : null}
      {history.nextCursor !== null || status === 'failed' ? (
        <Button
          className="reading-review-history-more"
          type="button"
          variant="secondary"
          disabled={status === 'loading'}
          onClick={onLoadMore}
        >
          {t(
            status === 'failed'
              ? 'readingMemory.review.history.retry'
              : 'readingMemory.review.history.loadMore',
          )}
        </Button>
      ) : null}
    </section>
  );
}
