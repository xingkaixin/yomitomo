import { HugeiconsIcon } from '@hugeicons/react';
import { BarChartIcon, Refresh01Icon } from '@hugeicons/core-free-icons';
import React, {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { Agent, ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import { Button } from '../components/ui/button';
import { SegmentedControl } from '../components/ui/segmented-control';
import { PanelHeader } from '../shell/app-ui';
import { AiUsagePanel } from '../shell/app-assistant-diagnostics';
import { recordStatsTiming, rendererPerformanceElapsedMs } from '../shell/app-renderer-performance';
import { WeReadReadingStatsPanel } from './app-reading-stats-weread';
import {
  activityMapDescription,
  activityStampLabel,
  activityStampTitle,
  getReadingStatsViewData,
  nextGoalText,
  periodSummary,
  preloadReadingStatsFirstPaintData,
  type ReadingStatsViewData,
} from './app-reading-stats-data';

const loadReadingStatsChart = () => import('./app-reading-stats-chart');
const ReadingStatsChart = lazy(() =>
  loadReadingStatsChart().then((module) => ({ default: module.ReadingStatsChart })),
);

const statsLoadPhases = {
  firstPaint: 'first_paint',
  deferredContentStart: 'deferred_content_start',
  contentReady: 'content_ready',
  chartReady: 'chart_ready',
  ready: 'ready',
} as const;

export { preloadReadingStatsFirstPaintData };

export function preloadReadingStatsDeferredModules() {
  return loadReadingStatsChart();
}

export function ReadingStatsPanel({
  agents = [],
  articles,
  navigationStartedAt,
  onRefresh,
}: {
  agents?: Agent[];
  articles: Array<ArticleRecord | ArticleSummaryRecord>;
  navigationStartedAt?: number;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [{ source, view }, dispatch] = useReducer(readingStatsTabsReducer, {
    source: 'local',
    view: 'reading',
  });
  const recordedPhases = useRef(new Map<StatsLoadPhase, number | undefined>());
  const data = useMemo(() => getReadingStatsViewData(articles), [articles]);
  // Paints the overview first and renders charts and insights in a later pass.
  const showDeferredContent = useDeferredValue(articles, null) === articles;
  const sourceOptions = [
    { value: 'local' as const, label: t('readingStats.sources.local') },
    { value: 'weread' as const, label: t('readingStats.sources.weread') },
  ];
  const viewOptions = [
    { value: 'reading' as const, label: t('readingStats.views.reading') },
    { value: 'usage' as const, label: t('readingStats.views.usage') },
  ];
  const articleCount = articles.length;
  const recordedDays = data.recordedDays;

  const recordFirstPaint = useCallback(
    (panel: HTMLDivElement | null) => {
      if (!panel) return;
      recordStatsPhaseOnce(
        recordedPhases.current,
        statsLoadPhases.firstPaint,
        navigationStartedAt,
        { articleCount, recordedDays },
      );
    },
    [articleCount, navigationStartedAt, recordedDays],
  );

  const recordDeferredContentStart = useCallback(
    (grid: HTMLElement | null) => {
      if (!grid) return;
      recordStatsPhaseOnce(
        recordedPhases.current,
        statsLoadPhases.deferredContentStart,
        navigationStartedAt,
        { articleCount, recordedDays },
      );
    },
    [articleCount, navigationStartedAt, recordedDays],
  );

  const recordChartReady = useCallback(() => {
    const recorded = recordedPhases.current;
    const recordedNow = recordStatsPhaseOnce(
      recorded,
      statsLoadPhases.chartReady,
      navigationStartedAt,
      { activityDays: data.activityDays.length, articleCount, recordedDays: data.recordedDays },
    );
    if (recordedNow) recordStatsReadyOnce(recorded, navigationStartedAt, data, articleCount);
  }, [articleCount, data, navigationStartedAt]);

  const recordContentReady = useCallback(() => {
    const recorded = recordedPhases.current;
    const recordedNow = recordStatsPhaseOnce(
      recorded,
      statsLoadPhases.contentReady,
      navigationStartedAt,
      {
        activityDays: data.activityDays.length,
        articleCount,
        insightCount: data.insights.length,
        recordedDays: data.recordedDays,
      },
    );
    if (recordedNow) recordStatsReadyOnce(recorded, navigationStartedAt, data, articleCount);
  }, [articleCount, data, navigationStartedAt]);

  return (
    <div ref={recordFirstPaint} className="settings-panel">
      <PanelHeader
        icon={<HugeiconsIcon icon={BarChartIcon} size={20} />}
        title={t('readingStats.title')}
        description={
          view === 'usage'
            ? t('readingStats.description.usage')
            : source === 'local'
              ? t('readingStats.description.local')
              : t('readingStats.description.weread')
        }
        action={
          view === 'reading' && source === 'local' ? (
            <Button type="button" variant="secondary" onClick={onRefresh}>
              <HugeiconsIcon icon={Refresh01Icon} size={16} />
              {t('readingStats.refresh')}
            </Button>
          ) : null
        }
      />
      <SegmentedControl
        aria-label={t('readingStats.viewTabs')}
        className="stats-view-tabs"
        role="tablist"
        value={view}
        options={viewOptions}
        onValueChange={(nextView) => dispatch({ type: 'viewSelected', view: nextView })}
      />
      {view === 'usage' ? <AiUsagePanel agents={agents} /> : null}
      {view === 'reading' ? (
        <>
          <SegmentedControl
            aria-label={t('readingStats.sourceTabs')}
            className="stats-source-tabs"
            role="tablist"
            value={source}
            options={sourceOptions}
            onValueChange={(nextSource) => dispatch({ type: 'sourceSelected', source: nextSource })}
          />
          {source === 'weread' ? <WeReadReadingStatsPanel /> : null}
          {source === 'local' ? (
            <>
              <StatsFirstPaintOverview data={data} />
              {showDeferredContent ? (
                <>
                  <section ref={recordDeferredContentStart} className="stats-visual-grid">
                    <Suspense fallback={<StatsChartSkeleton />}>
                      <ReadingStatsChart
                        activityDays={data.activityDays}
                        activityStartDate={data.activityStartDate}
                        onReady={recordChartReady}
                        recordedDays={data.recordedDays}
                      />
                    </Suspense>
                    <StatsActivityCard data={data} />
                  </section>
                  <StatsInsights data={data} onReady={recordContentReady} />
                </>
              ) : (
                <StatsDeferredSkeleton />
              )}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function StatsFirstPaintOverview({ data }: { data: ReadingStatsViewData }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="stats-start-overview">
        <section className="stats-status-card">
          <span>{t('readingStats.overview.today')}</span>
          <strong>{periodSummary(data.stats.today)}</strong>
        </section>
        <section className="stats-status-card">
          <span>{t('readingStats.overview.recordedDays', { count: data.recordedDays })}</span>
          <strong>
            {data.peakDay
              ? t('readingStats.overview.weekActiveWithPeak', {
                  count: data.weekActiveDays,
                  label: data.peakDay.label,
                })
              : t('readingStats.overview.weekActiveStartToday', {
                  count: data.weekActiveDays,
                })}
          </strong>
        </section>
        <section className="stats-status-card">
          <span>{t('readingStats.overview.nextGoal')}</span>
          <strong>{nextGoalText(data.litStampCount, data.sevenDayRemaining)}</strong>
        </section>
      </div>
      <div className="stats-total-strip">
        {t('readingStats.overview.total', { summary: periodSummary(data.stats.total) })}
      </div>
    </>
  );
}

function StatsActivityCard({ data }: { data: ReadingStatsViewData }) {
  const { t } = useTranslation();
  return (
    <div className="stats-activity-card">
      <div className="stats-goal-card">
        <div className="stats-goal-copy">
          <span>{t('readingStats.activity.sevenDayProgress')}</span>
          <strong>
            {data.sevenDayProgress}
            <small>/7</small>
          </strong>
          <p>
            {data.sevenDayProgress >= 7
              ? t('readingStats.activity.sevenDayLit')
              : t('readingStats.activity.sevenDayRemaining', {
                  count: data.sevenDayRemaining,
                })}
          </p>
        </div>
        <i className="activity-stamp status-lit level-4 is-special" aria-hidden="true" />
      </div>
      <div className="stats-goal-steps" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span className={index < data.sevenDayProgress ? 'is-lit' : ''} key={index} />
        ))}
      </div>
      <div className="stats-map-heading">
        <h3>
          {data.hasLitStamp
            ? t('readingStats.activity.mapTitle')
            : t('readingStats.activity.mapEmptyTitle')}
        </h3>
        <p>{activityMapDescription(data.hasLitStamp, data.litStampCount, data.currentStreak)}</p>
      </div>
      <div className="activity-heatmap is-compact" aria-label={t('readingStats.activity.mapAria')}>
        {data.activityStamps.map((day) => (
          <span
            aria-label={activityStampLabel(day)}
            className={`activity-stamp status-${day.status} level-${day.level}${day.special ? ' is-special' : ''}`}
            key={day.date}
            title={activityStampTitle(day)}
          />
        ))}
      </div>
      <div className="activity-legend" aria-hidden="true">
        <span>{t('readingStats.activity.legend.unstarted')}</span>
        <i className="activity-stamp status-unstarted level-0" />
        <span>{t('readingStats.activity.legend.low')}</span>
        <i className="activity-stamp status-empty level-0" />
        <i className="activity-stamp status-lit level-1" />
        <i className="activity-stamp status-lit level-2" />
        <i className="activity-stamp status-lit level-3" />
        <i className="activity-stamp status-lit level-4" />
        <span>{t('readingStats.activity.legend.high')}</span>
        <span className="activity-legend-special">
          <i className="activity-stamp status-lit level-4 is-special" />
          <span>{t('readingStats.activity.legend.sevenDay')}</span>
        </span>
      </div>
    </div>
  );
}

function StatsInsights({ data, onReady }: { data: ReadingStatsViewData; onReady: () => void }) {
  const { t } = useTranslation();
  const reportReady = useCallback(
    (insights: HTMLElement | null) => {
      if (insights) onReady();
    },
    [onReady],
  );

  return (
    <section ref={reportReady} className="stats-insights">
      <div className="stats-section-heading">
        <h3>{t('readingStats.insights.title')}</h3>
        <p>{t('readingStats.insights.description')}</p>
      </div>
      <div className="stats-insight-list">
        {data.insights.map((insight) => (
          <p key={insight.id}>{insight.text}</p>
        ))}
      </div>
    </section>
  );
}

function StatsDeferredSkeleton() {
  return (
    <section className="stats-visual-grid" aria-busy="true">
      <StatsChartSkeleton />
      <div className="stats-activity-card stats-deferred-card">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function StatsChartSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="stats-chart-card stats-chart-skeleton" aria-busy="true">
      <div className="stats-section-heading">
        <h3>{t('readingStats.chart.trendTitle')}</h3>
        <p>{t('readingStats.chart.loading')}</p>
      </div>
      <div className="stats-chart-skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

type StatsLoadPhase = (typeof statsLoadPhases)[keyof typeof statsLoadPhases];

type ReadingStatsTabsState = { source: 'local' | 'weread'; view: 'reading' | 'usage' };

type ReadingStatsTabsEvent =
  | { type: 'sourceSelected'; source: ReadingStatsTabsState['source'] }
  | { type: 'viewSelected'; view: ReadingStatsTabsState['view'] };

function readingStatsTabsReducer(
  state: ReadingStatsTabsState,
  event: ReadingStatsTabsEvent,
): ReadingStatsTabsState {
  switch (event.type) {
    case 'sourceSelected':
      return { ...state, source: event.source };
    case 'viewSelected':
      return { ...state, view: event.view };
  }
}

// Each phase is recorded once per navigation; nothing is recorded without a navigation start.
function recordStatsPhaseOnce(
  recorded: Map<StatsLoadPhase, number | undefined>,
  phase: StatsLoadPhase,
  navigationStartedAt: number | undefined,
  data: Record<string, unknown>,
) {
  if (recorded.get(phase) === navigationStartedAt) return false;
  recorded.set(phase, navigationStartedAt);
  recordStatsLoadTiming(phase, navigationStartedAt, data);
  return true;
}

function recordStatsReadyOnce(
  recorded: Map<StatsLoadPhase, number | undefined>,
  navigationStartedAt: number | undefined,
  data: ReadingStatsViewData,
  articleCount: number,
) {
  if (
    recorded.get(statsLoadPhases.chartReady) !== navigationStartedAt ||
    recorded.get(statsLoadPhases.contentReady) !== navigationStartedAt
  )
    return;
  recordStatsPhaseOnce(recorded, statsLoadPhases.ready, navigationStartedAt, {
    activityDays: data.activityDays.length,
    articleCount,
    insightCount: data.insights.length,
    recordedDays: data.recordedDays,
  });
}

function recordStatsLoadTiming(
  phase: StatsLoadPhase,
  navigationStartedAt: number | undefined,
  data: Record<string, unknown>,
) {
  recordStatsTiming(phase, {
    elapsedMs: navigationStartedAt ? rendererPerformanceElapsedMs(navigationStartedAt) : undefined,
    phase,
    ...data,
  });
}
