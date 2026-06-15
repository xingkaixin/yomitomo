import React, { useEffect, useMemo, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type {
  WeReadReadingStatsMode,
  WeReadReadingStatsSnapshot,
  WeReadReadingStatsState,
} from '@yomitomo/shared';
import { formatDateTimeValue } from '@yomitomo/shared';
import { Button } from '../components/ui/button';
import { SegmentedControl } from '../components/ui/segmented-control';
import { appToast } from '../shell/app-toast';

const MODES: WeReadReadingStatsMode[] = ['weekly', 'monthly', 'annually', 'overall'];

export function WeReadReadingStatsPanel() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<WeReadReadingStatsMode>('monthly');
  const [periodStart, setPeriodStart] = useState(() => getPeriodStart('monthly'));
  const [state, setState] = useState<WeReadReadingStatsState>({ snapshots: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const activePeriodStart = mode === 'overall' ? 0 : periodStart;
  const snapshot = useMemo(
    () =>
      state.snapshots.find((item) => item.mode === mode && item.periodStart === activePeriodStart),
    [activePeriodStart, mode, state.snapshots],
  );
  const latestSnapshot = state.snapshots[0];

  useEffect(() => {
    let canceled = false;
    void window.yomitomoDesktop
      .getWeReadReadingStats()
      .then((nextState) => {
        if (!canceled) setState(nextState);
      })
      .catch((error: unknown) => {
        if (!canceled) setMessage(errorMessage(error, t('readingStats.weread.cacheReadFailed')));
      });
    return () => {
      canceled = true;
    };
  }, []);

  function changeMode(nextMode: WeReadReadingStatsMode) {
    setMode(nextMode);
    setMessage('');
    if (nextMode !== 'overall') setPeriodStart(getPeriodStart(nextMode));
  }

  async function queryStats() {
    setLoading(true);
    setMessage('');
    try {
      const nextState = await window.yomitomoDesktop.queryWeReadReadingStats({
        mode,
        ...(mode === 'overall' ? {} : { baseTime: activePeriodStart * 1000 }),
      });
      setState(nextState);
      const queriedSnapshot = nextState.snapshots.find(
        (item) => item.mode === mode && item.periodStart === activePeriodStart,
      );
      appToast.success(t('readingStats.weread.querySuccess'), {
        description: queriedSnapshot
          ? t('readingStats.weread.querySuccessDescription', {
              days: queriedSnapshot.data.readDays ?? 0,
              duration: formatDuration(queriedSnapshot.data.totalReadTime),
              period: periodLabel(mode, activePeriodStart),
            })
          : t('readingStats.weread.querySuccessDescriptionFallback', {
              period: periodLabel(mode, activePeriodStart),
            }),
      });
    } catch (error) {
      const failureMessage = errorMessage(error, t('readingStats.weread.queryFailed'));
      setMessage(failureMessage);
      appToast.error(t('readingStats.weread.queryFailed'), { description: failureMessage });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="weread-stats-panel">
      <div className="weread-stats-toolbar">
        <SegmentedControl
          aria-label={t('readingStats.weread.periodTabs')}
          className="stats-chart-switch"
          role="tablist"
          value={mode}
          options={MODES.map((modeOption) => ({
            value: modeOption,
            label: t(`readingStats.weread.mode.${modeOption}`),
          }))}
          onValueChange={changeMode}
        />
        <div className="weread-stats-period">
          {mode === 'overall' ? null : (
            <button
              type="button"
              aria-label={t('readingStats.weread.previousPeriod')}
              onClick={() => setPeriodStart(shiftPeriod(mode, activePeriodStart, -1))}
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <span>{periodLabel(mode, activePeriodStart)}</span>
          {mode === 'overall' ? null : (
            <button
              type="button"
              aria-label={t('readingStats.weread.nextPeriod')}
              disabled={activePeriodStart >= getPeriodStart(mode)}
              onClick={() => setPeriodStart(shiftPeriod(mode, activePeriodStart, 1))}
            >
              <ChevronRight size={15} />
            </button>
          )}
        </div>
        <Button type="button" variant="secondary" disabled={loading} onClick={queryStats}>
          {loading ? <RefreshCw size={16} className="is-spinning" /> : <Search size={16} />}
          {snapshot ? t('readingStats.weread.queryAgain') : queryButtonLabel(mode)}
        </Button>
      </div>
      {message ? <p className="weread-stats-message is-error">{message}</p> : null}
      {snapshot ? (
        <WeReadStatsSnapshotView snapshot={snapshot} />
      ) : (
        <div className="weread-stats-empty">
          <h3>{t('readingStats.weread.emptyTitle', { period: periodNoun(mode) })}</h3>
          <p>{t('readingStats.weread.emptyDescription', { action: queryButtonLabel(mode) })}</p>
          {latestSnapshot ? (
            <span>
              {t('readingStats.weread.latestQuery', {
                date: formatDateTime(latestSnapshot.fetchedAt),
                period: periodLabel(latestSnapshot.mode, latestSnapshot.periodStart),
              })}
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}

function WeReadStatsSnapshotView({ snapshot }: { snapshot: WeReadReadingStatsSnapshot }) {
  const { t } = useTranslation();
  const data = snapshot.data;
  const readTimes = Object.entries(data.readTimes)
    .map(([key, value]) => ({ key, label: readTimeBucketLabel(snapshot.mode, key), value }))
    .filter((item) => item.value > 0)
    .toSorted((left, right) => Number(left.key) - Number(right.key));
  const maxReadTime = Math.max(...readTimes.map((item) => item.value), 1);

  return (
    <>
      <div className="weread-stats-summary">
        <section className="stats-status-card">
          <span>{periodLabel(snapshot.mode, snapshot.periodStart)}</span>
          <strong>{formatDuration(data.totalReadTime)}</strong>
        </section>
        <section className="stats-status-card">
          <span>{t('readingStats.weread.readDays')}</span>
          <strong>{t('readingStats.weread.days', { count: data.readDays ?? 0 })}</strong>
        </section>
        <section className="stats-status-card">
          <span>{t('readingStats.weread.dailyAverage')}</span>
          <strong>{formatDuration(data.dayAverageReadTime || 0)}</strong>
        </section>
      </div>
      <div className="weread-stats-meta">
        <span>
          {t('readingStats.weread.queriedAt', { date: formatDateTime(snapshot.fetchedAt) })}
        </span>
        {data.preferTimeWord ? <span>{data.preferTimeWord}</span> : null}
        {data.preferCategoryWord ? <span>{data.preferCategoryWord}</span> : null}
      </div>
      <section className="weread-stats-grid">
        <div className="stats-insights weread-stats-card">
          <div className="stats-section-heading">
            <h3>{t('readingStats.weread.overview')}</h3>
            <p>{t('readingStats.weread.overviewDescription')}</p>
          </div>
          <div className="weread-stats-kpis">
            {data.readStat.map((item) => (
              <span key={`${item.stat}:${item.counts}`}>
                <strong>{item.counts}</strong>
                {wereadStatLabel(item.stat)}
              </span>
            ))}
            {data.authorCount !== undefined ? (
              <span>
                <strong>{data.authorCount}</strong>
                {t('readingStats.weread.authors')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="stats-insights weread-stats-card">
          <div className="stats-section-heading">
            <h3>{t('readingStats.weread.distribution')}</h3>
            <p>{readTimeBucketDescription(snapshot.mode)}</p>
          </div>
          <div className="weread-stats-bars">
            {readTimes.length > 0 ? (
              readTimes.map((item) => (
                <div key={item.key}>
                  <span>{item.label}</span>
                  <i style={{ width: `${Math.max(6, (item.value / maxReadTime) * 100)}%` }} />
                  <strong>{formatDuration(item.value)}</strong>
                </div>
              ))
            ) : (
              <p>{t('readingStats.weread.noBucketData')}</p>
            )}
          </div>
        </div>
      </section>
      {data.readLongest.length > 0 ? (
        <section className="stats-insights weread-stats-card">
          <div className="stats-section-heading">
            <h3>{t('readingStats.weread.topBooks')}</h3>
            <p>{t('readingStats.weread.topBooksDescription')}</p>
          </div>
          <div className="weread-stats-book-list">
            {data.readLongest.slice(0, 6).map((book, index) => (
              <article key={`${book.bookId || book.title || index}`}>
                {book.cover ? <img alt="" src={book.cover} loading="lazy" /> : <span />}
                <div>
                  <strong>{book.title || t('readingStats.weread.untitledBook')}</strong>
                  <p>
                    {[book.author, formatDuration(book.readTime || 0)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function readTimeBucketLabel(mode: WeReadReadingStatsMode, key: string) {
  const timestamp = Number(key);
  if (!Number.isFinite(timestamp)) return key;
  const date = new Date(timestamp * 1000);
  if (mode === 'overall')
    return i18next.t('readingStats.weread.bucket.year', { year: date.getFullYear() });
  if (mode === 'annually')
    return i18next.t('readingStats.weread.bucket.month', { month: date.getMonth() + 1 });
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function wereadStatLabel(value: string) {
  return i18next.t(`readingStats.weread.readStat.${value}`, { defaultValue: value });
}

function readTimeBucketDescription(mode: WeReadReadingStatsMode) {
  if (mode === 'overall') return i18next.t('readingStats.weread.bucket.byYear');
  if (mode === 'annually') return i18next.t('readingStats.weread.bucket.byMonth');
  return i18next.t('readingStats.weread.bucket.byDate');
}

function getPeriodStart(mode: WeReadReadingStatsMode, value = Date.now()) {
  if (mode === 'overall') return 0;
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  if (mode === 'weekly') {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  } else if (mode === 'monthly') {
    date.setDate(1);
  } else {
    date.setMonth(0, 1);
  }
  return Math.floor(date.getTime() / 1000);
}

function shiftPeriod(mode: WeReadReadingStatsMode, periodStart: number, amount: number) {
  const date = new Date(periodStart * 1000);
  if (mode === 'weekly') date.setDate(date.getDate() + amount * 7);
  else if (mode === 'monthly') date.setMonth(date.getMonth() + amount);
  else if (mode === 'annually') date.setFullYear(date.getFullYear() + amount);
  return getPeriodStart(mode, date.getTime());
}

function periodLabel(mode: WeReadReadingStatsMode, periodStart: number) {
  if (mode === 'overall') return i18next.t('readingStats.weread.mode.overall');
  const date = new Date(periodStart * 1000);
  if (mode === 'weekly') {
    const end = new Date(date);
    end.setDate(date.getDate() + 6);
    return i18next.t('readingStats.weread.period.weekly', {
      endDay: end.getDate(),
      endMonth: end.getMonth() + 1,
      startDay: date.getDate(),
      startMonth: date.getMonth() + 1,
      year: date.getFullYear(),
    });
  }
  if (mode === 'monthly')
    return i18next.t('readingStats.weread.period.monthly', {
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    });
  return i18next.t('readingStats.weread.period.annually', { year: date.getFullYear() });
}

function queryButtonLabel(mode: WeReadReadingStatsMode) {
  return i18next.t(`readingStats.weread.query.${mode}`);
}

function periodNoun(mode: WeReadReadingStatsMode) {
  return i18next.t(`readingStats.weread.periodNoun.${mode}`);
}

function formatDuration(value: number) {
  const minutes = Math.round(value / 60);
  if (minutes < 60) return i18next.t('readingStats.weread.duration.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest
    ? i18next.t('readingStats.weread.duration.hoursMinutes', { hours, minutes: rest })
    : i18next.t('readingStats.weread.duration.hours', { count: hours });
}

function formatDateTime(value: string) {
  return formatDateTimeValue(value, i18next.language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
