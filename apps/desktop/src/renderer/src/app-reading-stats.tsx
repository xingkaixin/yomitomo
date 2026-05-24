import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { Button } from './components/ui/button';
import { PanelHeader } from './app-ui';
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
  articles,
  navigationStartedAt,
  onRefresh,
}: {
  articles: ArticleSummaryRecord[];
  navigationStartedAt?: number;
  onRefresh: () => void;
}) {
  const [showDeferredContent, setShowDeferredContent] = useState(false);
  const recordedNavigationStartRef = useRef<number | undefined>(undefined);
  const recordedDeferredStartRef = useRef<number | undefined>(undefined);
  const recordedContentReadyRef = useRef<number | undefined>(undefined);
  const recordedChartReadyRef = useRef<number | undefined>(undefined);
  const recordedReadyRef = useRef<number | undefined>(undefined);
  const data = useMemo(() => getReadingStatsViewData(articles), [articles]);

  useEffect(() => {
    setShowDeferredContent(false);
    const timeoutId = window.setTimeout(() => setShowDeferredContent(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, [articles]);

  useEffect(() => {
    if (recordedNavigationStartRef.current === navigationStartedAt) return;
    recordedNavigationStartRef.current = navigationStartedAt;
    recordStatsLoadTiming(statsLoadPhases.firstPaint, navigationStartedAt, {
      articleCount: articles.length,
      recordedDays: data.recordedDays,
    });
  }, [articles.length, data.recordedDays, navigationStartedAt]);

  useEffect(() => {
    if (!showDeferredContent || recordedDeferredStartRef.current === navigationStartedAt) return;
    recordedDeferredStartRef.current = navigationStartedAt;
    recordStatsLoadTiming(statsLoadPhases.deferredContentStart, navigationStartedAt, {
      articleCount: articles.length,
      recordedDays: data.recordedDays,
    });
  }, [articles.length, data.recordedDays, navigationStartedAt, showDeferredContent]);

  function recordChartReady() {
    if (recordedChartReadyRef.current === navigationStartedAt) return;
    recordedChartReadyRef.current = navigationStartedAt;
    recordStatsLoadTiming(statsLoadPhases.chartReady, navigationStartedAt, {
      activityDays: data.activityDays.length,
      articleCount: articles.length,
      recordedDays: data.recordedDays,
    });
    recordStatsReady();
  }

  function recordContentReady() {
    if (recordedContentReadyRef.current === navigationStartedAt) return;
    recordedContentReadyRef.current = navigationStartedAt;
    recordStatsLoadTiming(statsLoadPhases.contentReady, navigationStartedAt, {
      activityDays: data.activityDays.length,
      articleCount: articles.length,
      insightCount: data.insights.length,
      recordedDays: data.recordedDays,
    });
    recordStatsReady();
  }

  function recordStatsReady() {
    if (
      recordedChartReadyRef.current !== navigationStartedAt ||
      recordedContentReadyRef.current !== navigationStartedAt
    )
      return;
    if (recordedReadyRef.current === navigationStartedAt) return;
    recordedReadyRef.current = navigationStartedAt;
    recordStatsLoadTiming(statsLoadPhases.ready, navigationStartedAt, {
      activityDays: data.activityDays.length,
      articleCount: articles.length,
      insightCount: data.insights.length,
      recordedDays: data.recordedDays,
    });
  }

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<BarChart3 size={20} />}
        title="统计"
        description="基于本地批注、讨论和阅读记录生成阅读概况。"
        action={
          <Button type="button" variant="secondary" onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </Button>
        }
      />
      <StatsFirstPaintOverview data={data} />
      {showDeferredContent ? (
        <>
          <section className="stats-visual-grid">
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
    </div>
  );
}

function StatsFirstPaintOverview({ data }: { data: ReadingStatsViewData }) {
  return (
    <>
      <div className="stats-start-overview">
        <section className="stats-status-card">
          <span>今日活动</span>
          <strong>{periodSummary(data.stats.today)}</strong>
        </section>
        <section className="stats-status-card">
          <span>已记录 {data.recordedDays} 天</span>
          <strong>
            本周活跃 {data.weekActiveDays} 天，
            {data.peakDay ? `高峰在 ${data.peakDay.label}` : '今天开始记录'}
          </strong>
        </section>
        <section className="stats-status-card">
          <span>下一目标</span>
          <strong>{nextGoalText(data.litStampCount, data.sevenDayRemaining)}</strong>
        </section>
      </div>
      <div className="stats-total-strip">累计：{periodSummary(data.stats.total)}</div>
    </>
  );
}

function StatsActivityCard({ data }: { data: ReadingStatsViewData }) {
  return (
    <div className="stats-activity-card">
      <div className="stats-goal-card">
        <div className="stats-goal-copy">
          <span>七日章进度</span>
          <strong>
            {data.sevenDayProgress}
            <small>/7</small>
          </strong>
          <p>
            {data.sevenDayProgress >= 7
              ? '七日章已点亮'
              : `再读 ${data.sevenDayRemaining} 天点亮七日章`}
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
        <h3>{data.hasLitStamp ? '70 天伴读地图' : '从今天开始，收集你的伴读藏书票'}</h3>
        <p>{activityMapDescription(data.hasLitStamp, data.litStampCount, data.currentStreak)}</p>
      </div>
      <div className="activity-heatmap is-compact" aria-label="近 70 天伴读活动">
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
        <span>未开始</span>
        <i className="activity-stamp status-unstarted level-0" />
        <span>少</span>
        <i className="activity-stamp status-empty level-0" />
        <i className="activity-stamp status-lit level-1" />
        <i className="activity-stamp status-lit level-2" />
        <i className="activity-stamp status-lit level-3" />
        <i className="activity-stamp status-lit level-4" />
        <span>多</span>
        <span className="activity-legend-special">
          <i className="activity-stamp status-lit level-4 is-special" />
          <span>七日章</span>
        </span>
      </div>
    </div>
  );
}

function StatsInsights({ data, onReady }: { data: ReadingStatsViewData; onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <section className="stats-insights">
      <div className="stats-section-heading">
        <h3>伴读洞察</h3>
        <p>基于本地阅读记录生成</p>
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
  return (
    <div className="stats-chart-card stats-chart-skeleton" aria-busy="true">
      <div className="stats-section-heading">
        <h3>伴读活动趋势</h3>
        <p>正在准备活动趋势</p>
      </div>
      <div className="stats-chart-skeleton-lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function recordStatsTiming(event: string, data: Record<string, unknown>) {
  const desktop = window.yomitomoDesktop;
  if (!desktop?.recordPerformanceTiming) return;
  void desktop.recordPerformanceTiming({ event: `stats.${event}`, data }).catch(() => undefined);
}

function recordStatsLoadTiming(
  phase: (typeof statsLoadPhases)[keyof typeof statsLoadPhases],
  navigationStartedAt: number | undefined,
  data: Record<string, unknown>,
) {
  recordStatsTiming(phase, {
    elapsedMs: navigationStartedAt ? elapsedMs(navigationStartedAt) : undefined,
    phase,
    ...data,
  });
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
