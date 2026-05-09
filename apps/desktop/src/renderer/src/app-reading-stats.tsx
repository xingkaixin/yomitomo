import React, { useMemo, useState } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  XAxis,
  YAxis,
  type CurveProps,
} from 'recharts';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  computeReadingActivityDays,
  computeReadingStats,
  type ReadingActivityDay,
  type ReadingStatsPeriod,
} from '@yomitomo/core';
import { Button } from './components/ui/button';
import { ChartContainer, ChartTooltip, type ChartConfig } from './components/ui/chart';
import { PanelHeader } from './app-ui';

const chartConfig = {
  articles: {
    label: '文章',
    color: 'var(--chart-3)',
  },
  annotations: {
    label: '批注',
    color: 'var(--chart-1)',
  },
  comments: {
    label: '讨论',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

type ActivityStamp = ReadingActivityDay & {
  special: boolean;
  streak: number;
  status: ActivityStampStatus;
};

type ActivityStampStatus = 'unstarted' | 'empty' | 'today' | 'lit';

type ChartActivityDay = Omit<ReadingActivityDay, 'articles' | 'annotations' | 'comments'> & {
  articles: number | null;
  annotations: number | null;
  comments: number | null;
  recordStatus: 'unstarted' | 'recording';
};

type ChartMode = 'recorded' | 'window';

type ReadingInsight = {
  id: string;
  text: string;
};

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: React.ReactNode;
  color?: string;
  payload?: ChartActivityDay;
};

type InkPoint = {
  x: number;
  y: number;
};

export function ReadingStatsPanel({
  articles,
  onRefresh,
}: {
  articles: ArticleRecord[];
  onRefresh: () => void;
}) {
  const [chartMode, setChartMode] = useState<ChartMode>('recorded');
  const stats = useMemo(() => computeReadingStats(articles), [articles]);
  const activityDays = useMemo(() => computeReadingActivityDays(articles), [articles]);
  const activityStartDate = useMemo(
    () => firstActivityDate(articles) || activityDays.at(-1)?.date || localDateKey(new Date()),
    [activityDays, articles],
  );
  const fullChartData = useMemo(
    () => buildChartData(activityDays.slice(-21), activityStartDate),
    [activityDays, activityStartDate],
  );
  const activityStamps = useMemo(
    () => buildActivityStamps(activityDays, activityStartDate),
    [activityDays, activityStartDate],
  );
  const hasLitStamp = activityStamps.some((day) => day.status === 'lit');
  const litStampCount = activityStamps.filter((day) => day.status === 'lit').length;
  const currentStreak = activityStamps.at(-1)?.streak || 0;
  const recordedDays = activityStamps.filter((day) => day.status !== 'unstarted').length;
  const chartRecordedDays = fullChartData.filter((day) => day.recordStatus === 'recording').length;
  const effectiveChartMode = chartRecordedDays >= 21 ? 'window' : chartMode;
  const recordedChartData = fullChartData.filter((day) => day.recordStatus === 'recording');
  const chartData = effectiveChartMode === 'recorded' ? recordedChartData : fullChartData;
  const chartUnstartedRange =
    effectiveChartMode === 'window' ? unstartedChartRange(fullChartData) : null;
  const chartTitle = chartRecordedDays >= 21 ? '近 21 天活动' : '伴读活动趋势';
  const chartDescription = chartActivityDescription(recordedDays);
  const weekActiveDays = activityDays.slice(-7).filter((day) => day.score > 0).length;
  const peakDay = peakActivityDay(activityDays, activityStartDate);
  const sevenDayProgress = Math.min(7, currentStreak || Math.min(litStampCount, 7));
  const sevenDayRemaining = Math.max(0, 7 - sevenDayProgress);
  const insights = buildReadingInsights(activityDays, activityStartDate, stats.total);

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<BarChart3 size={20} />}
        title="统计"
        description="基于本地批注、讨论和读后笔记生成阅读概况。"
        action={
          <Button type="button" variant="secondary" onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </Button>
        }
      />
      <div className="stats-start-overview">
        <section className="stats-status-card">
          <span>今日活动</span>
          <strong>{periodSummary(stats.today)}</strong>
        </section>
        <section className="stats-status-card">
          <span>已记录 {recordedDays} 天</span>
          <strong>
            本周活跃 {weekActiveDays} 天，{peakDay ? `高峰在 ${peakDay.label}` : '今天开始记录'}
          </strong>
        </section>
        <section className="stats-status-card">
          <span>下一目标</span>
          <strong>{nextGoalText(litStampCount, sevenDayRemaining)}</strong>
        </section>
      </div>
      <div className="stats-total-strip">累计：{periodSummary(stats.total)}</div>
      <section className="stats-visual-grid">
        <div className="stats-chart-card">
          <div className="stats-section-heading">
            <h3>{chartTitle}</h3>
            <p>{chartDescription}</p>
          </div>
          <div className="stats-chart-toolbar">
            {chartRecordedDays < 21 ? (
              <div aria-label="趋势范围" className="stats-chart-switch" role="group">
                <button
                  aria-pressed={effectiveChartMode === 'recorded'}
                  onClick={() => setChartMode('recorded')}
                  type="button"
                >
                  已记录 {recordedDays} 天
                </button>
                <button
                  aria-pressed={effectiveChartMode === 'window'}
                  onClick={() => setChartMode('window')}
                  type="button"
                >
                  近 21 天
                </button>
              </div>
            ) : null}
            <div className="stats-chart-legend" aria-hidden="true">
              <span>
                <i style={{ background: chartConfig.articles.color }} />
                文章
              </span>
              <span>
                <i style={{ background: chartConfig.annotations.color }} />
                批注
              </span>
              <span>
                <i style={{ background: chartConfig.comments.color }} />
                讨论
              </span>
            </div>
          </div>
          <ChartContainer className="h-[240px] w-full" config={chartConfig}>
            <LineChart accessibilityLayer data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
              {chartUnstartedRange ? (
                <ReferenceArea
                  className="stats-chart-unstarted-area"
                  ifOverflow="visible"
                  label={{
                    className: 'stats-chart-unstarted-label',
                    offset: 12,
                    position: 'insideTopLeft',
                    value: '尚未开始记录',
                  }}
                  stroke="none"
                  x1={chartUnstartedRange.x1}
                  x2={chartUnstartedRange.x2}
                />
              ) : null}
              <CartesianGrid strokeDasharray="2 8" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                minTickGap={16}
              />
              <YAxis axisLine={false} tickLine={false} width={24} />
              <ChartTooltip content={<StatsChartTooltip />} />
              <Line
                activeDot={{ r: 5, strokeWidth: 0 }}
                className="stats-handdrawn-stroke"
                dataKey="articles"
                dot={false}
                shape={renderArticlesLine}
                stroke="var(--color-articles)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                type="linear"
              />
              <Line
                activeDot={{ r: 5, strokeWidth: 0 }}
                className="stats-handdrawn-stroke"
                dataKey="annotations"
                dot={false}
                shape={renderAnnotationsLine}
                stroke="var(--color-annotations)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                type="linear"
              />
              <Line
                activeDot={{ r: 5, strokeWidth: 0 }}
                className="stats-handdrawn-stroke"
                dataKey="comments"
                dot={false}
                shape={renderCommentsLine}
                stroke="var(--color-comments)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                type="linear"
              />
            </LineChart>
          </ChartContainer>
        </div>
        <div className="stats-activity-card">
          <div className="stats-goal-card">
            <div className="stats-goal-copy">
              <span>七日章进度</span>
              <strong>
                {sevenDayProgress}
                <small>/7</small>
              </strong>
              <p>
                {sevenDayProgress >= 7 ? '七日章已点亮' : `再读 ${sevenDayRemaining} 天点亮七日章`}
              </p>
            </div>
            <i className="activity-stamp status-lit level-4 is-special" aria-hidden="true" />
          </div>
          <div className="stats-goal-steps" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <span className={index < sevenDayProgress ? 'is-lit' : ''} key={index} />
            ))}
          </div>
          <div className="stats-map-heading">
            <h3>{hasLitStamp ? '70 天伴读地图' : '从今天开始，收集你的伴读藏书票'}</h3>
            <p>{activityMapDescription(hasLitStamp, litStampCount, currentStreak)}</p>
          </div>
          <div className="activity-heatmap is-compact" aria-label="近 70 天伴读活动">
            {activityStamps.map((day) => (
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
      </section>
      <section className="stats-insights">
        <div className="stats-section-heading">
          <h3>伴读洞察</h3>
          <p>基于本地阅读记录生成</p>
        </div>
        <div className="stats-insight-list">
          {insights.map((insight) => (
            <p key={insight.id}>{insight.text}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

function renderArticlesLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={11} />;
}

function renderAnnotationsLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={23} />;
}

function renderCommentsLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={37} />;
}

function HandDrawnCurve({
  className,
  clipPath,
  pathRef,
  points,
  stroke,
  strokeDasharray,
  strokeWidth,
  seed,
}: CurveProps & { seed: number }) {
  const width = strokeWidthValue(strokeWidth);
  const primaryPath = buildHandDrawnPath(points, seed, 0);
  const ghostPath = buildHandDrawnPath(points, seed, 1);
  if (!primaryPath) return null;

  return (
    <g className={className} clipPath={clipPath}>
      <path
        d={ghostPath}
        fill="none"
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.28}
        strokeWidth={width + 1.2}
      />
      <path
        d={primaryPath}
        fill="none"
        ref={pathRef}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={width}
      />
    </g>
  );
}

function StatsChartTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: React.ReactNode;
  payload?: ChartTooltipPayload[];
}) {
  if (!active) return null;

  const data = payload?.[0]?.payload;
  if (data?.recordStatus === 'unstarted') {
    return (
      <div className="stats-chart-tooltip">
        <div className="stats-chart-tooltip-label">{label}</div>
        <div className="stats-chart-tooltip-empty">尚未开始记录</div>
      </div>
    );
  }

  const items = payload?.filter((item) => item.value !== undefined && item.value !== null) || [];
  if (items.length === 0) return null;

  return (
    <div className="stats-chart-tooltip">
      <div className="stats-chart-tooltip-label">{label}</div>
      <div className="stats-chart-tooltip-items">
        {items.map((item) => {
          const key = String(item.dataKey || item.name || '');
          const itemConfig = chartConfig[key as keyof typeof chartConfig];
          return (
            <div className="stats-chart-tooltip-item" key={key}>
              <span
                className="stats-chart-tooltip-dot"
                style={{ background: item.color || itemConfig?.color }}
              />
              <span>{itemConfig?.label || item.name}</span>
              <strong>{item.value}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildChartData(days: ReadingActivityDay[], startDate: string): ChartActivityDay[] {
  return days.map((day) => {
    if (day.date < startDate) {
      return {
        ...day,
        articles: null,
        annotations: null,
        comments: null,
        recordStatus: 'unstarted',
      };
    }

    return {
      ...day,
      recordStatus: 'recording',
    };
  });
}

function unstartedChartRange(days: ChartActivityDay[]) {
  const unstarted = days.filter((day) => day.recordStatus === 'unstarted');
  const first = unstarted[0];
  const last = unstarted.at(-1);
  if (!first || !last) return null;
  return { x1: first.label, x2: last.label };
}

function chartActivityDescription(recordedDays: number) {
  if (recordedDays >= 21) return '批注、讨论和读后笔记趋势';
  if (recordedDays <= 6) return `已记录 ${recordedDays} 天，正在形成你的伴读节奏`;
  return `已记录 ${recordedDays} 天，读完文章后会生成批注、讨论和读后笔记趋势`;
}

function periodSummary(stats: ReadingStatsPeriod) {
  return `${stats.articles} 篇文章 · ${stats.comments} 次讨论 · ${stats.annotations} 条批注 · ${stats.aiComments} 次助手参与`;
}

function nextGoalText(litStampCount: number, remaining: number) {
  if (remaining <= 0) return '七日章已点亮，继续收集下一枚藏书票';
  return `已收集 ${litStampCount} 枚藏书票，再读 ${remaining} 天点亮七日章`;
}

function peakActivityDay(days: ReadingActivityDay[], startDate: string) {
  const activeDays = days.filter((day) => day.date >= startDate && day.score > 0);
  return activeDays.reduce<ReadingActivityDay | null>((peak, day) => {
    if (!peak || dayInteractions(day) > dayInteractions(peak)) return day;
    return peak;
  }, null);
}

function buildReadingInsights(
  days: ReadingActivityDay[],
  startDate: string,
  stats: ReadingStatsPeriod,
): ReadingInsight[] {
  const activeDays = days.filter((day) => day.date >= startDate && day.score > 0);
  const peak = peakActivityDay(days, startDate);

  if (activeDays.length === 0) {
    return [
      { id: 'start', text: '今天读完一篇文章后，这里会出现第一条伴读洞察。' },
      { id: 'trend', text: '批注、讨论和助手参与会一起形成你的阅读趋势。' },
    ];
  }

  return [
    peak
      ? {
          id: 'peak',
          text: `你在 ${peak.label} 最活跃，产生了 ${dayInteractions(peak)} 次互动。`,
        }
      : { id: 'peak', text: `已记录 ${activeDays.length} 个活跃日，伴读节奏正在成形。` },
    stats.annotations >= stats.comments
      ? {
          id: 'depth',
          text: `目前已留下 ${stats.annotations} 条批注，深读痕迹正在累积。`,
        }
      : {
          id: 'discussion',
          text: `讨论 ${stats.comments} 次，问题推进是当前主要节奏。`,
        },
    stats.aiComments > 0
      ? {
          id: 'ai',
          text: `助手参与 ${stats.aiComments} 次，阅读高峰日的协作更集中。`,
        }
      : { id: 'ai', text: '完成一次助手讨论后，这里会显示协作趋势。' },
  ];
}

function dayInteractions(day: ReadingActivityDay) {
  return day.articles + day.annotations + day.comments + day.cards + day.aiComments;
}

function buildActivityStamps(days: ReadingActivityDay[], startDate: string): ActivityStamp[] {
  const today = days.at(-1)?.date || localDateKey(new Date().toISOString());
  let streak = 0;
  return days.map((day) => {
    streak = day.score > 0 ? streak + 1 : 0;
    const status = activityStampStatus(day, startDate, today);
    return {
      ...day,
      special: status === 'lit' && streak > 0 && streak % 7 === 0,
      streak,
      status,
    };
  });
}

function activityStampLabel(day: ActivityStamp) {
  if (day.status === 'unstarted') return `${day.date}：伴读旅程尚未开始`;
  if (day.status === 'today') return `${day.date}：今天读一篇，盖下第一枚藏书票`;
  const special = day.special ? `，连续 ${day.streak} 天特殊印章` : '';
  return `${day.date}：${day.annotations} 条批注，${day.comments} 条讨论，${day.cards} 篇笔记${special}`;
}

function activityStampTitle(day: ActivityStamp) {
  if (day.status === 'unstarted') return `${day.date} · 未开始`;
  if (day.status === 'today') return `${day.date} · 今天读一篇，盖下第一枚藏书票`;
  const special = day.special ? ` · 连续 ${day.streak} 天特殊印章` : '';
  return `${day.date} · 批注 ${day.annotations} · 讨论 ${day.comments} · 笔记 ${day.cards}${special}`;
}

function activityMapDescription(
  hasLitStamp: boolean,
  litStampCount: number,
  currentStreak: number,
) {
  if (!hasLitStamp) return '今天读一篇，盖下第一枚藏书票。连续 7 天会点亮纪念章。';
  if (currentStreak > 0 && currentStreak < 7)
    return `已收集 ${litStampCount} 枚藏书票，再读 ${7 - currentStreak} 天点亮七日章。`;
  return `已收集 ${litStampCount} 枚藏书票。连续 7 天会点亮纪念章。`;
}

function activityStampStatus(
  day: ReadingActivityDay,
  startDate: string,
  today: string,
): ActivityStampStatus {
  if (day.score > 0) return 'lit';
  if (day.date < startDate) return 'unstarted';
  if (day.date === today) return 'today';
  return 'empty';
}

function firstActivityDate(articles: ArticleRecord[]) {
  const dates = articles.flatMap((article) => [
    localDateKey(article.createdAt),
    localDateKey(article.updatedAt),
    localDateKey(article.readingCard?.createdAt),
    ...article.annotations.flatMap((annotation) => [
      localDateKey(annotation.createdAt),
      ...annotation.comments.map((comment) => localDateKey(comment.createdAt)),
    ]),
  ]);
  return dates.filter(Boolean).toSorted()[0] || '';
}

function localDateKey(value: string | Date | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function buildHandDrawnPath(points: CurveProps['points'], seed: number, pass: number) {
  const inkPoints = toInkPoints(points);
  const [firstPoint] = inkPoints;
  if (!firstPoint) return '';

  const segments = [`M ${svgNumber(firstPoint.x)} ${svgNumber(firstPoint.y)}`];
  for (let index = 1; index < inkPoints.length; index += 1) {
    const start = inkPoints[index - 1];
    const end = inkPoints[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const xAmp = Math.min(3.6, Math.max(1.4, Math.abs(dx) * 0.03));
    const yAmp = Math.min(4.2, Math.max(2.1, Math.abs(dy) * 0.04));
    const base = seed * 101 + pass * 37 + index * 17;
    const first = {
      x: start.x + dx * 0.34 + jitter(base + 1, xAmp),
      y: start.y + dy * 0.34 + jitter(base + 2, yAmp),
    };
    const second = {
      x: start.x + dx * 0.68 + jitter(base + 3, xAmp),
      y: start.y + dy * 0.68 + jitter(base + 4, yAmp),
    };

    segments.push(
      `L ${svgNumber(first.x)} ${svgNumber(first.y)}`,
      `L ${svgNumber(second.x)} ${svgNumber(second.y)}`,
      `L ${svgNumber(end.x)} ${svgNumber(end.y)}`,
    );
  }
  return segments.join(' ');
}

function toInkPoints(points: CurveProps['points']): InkPoint[] {
  return (points || []).flatMap((point) => {
    if (typeof point.x !== 'number' || typeof point.y !== 'number') return [];
    return [{ x: point.x, y: point.y }];
  });
}

function jitter(seed: number, amplitude: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value) - 0.5) * amplitude * 2;
}

function strokeWidthValue(value: CurveProps['strokeWidth']) {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(String(value || 3));
  return Number.isFinite(parsed) ? parsed : 3;
}

function svgNumber(value: number) {
  return value.toFixed(2);
}
