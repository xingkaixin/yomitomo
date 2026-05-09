import React, { useMemo } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis, type CurveProps } from 'recharts';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  computeReadingActivityDays,
  computeReadingStats,
  type ReadingActivityDay,
  type ReadingStatsPeriod,
} from '@yomitomo/core';
import { Button } from './components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from './components/ui/chart';
import { PanelHeader } from './app-ui';

const chartConfig = {
  annotations: {
    label: '批注',
    color: 'var(--chart-1)',
  },
  comments: {
    label: '讨论',
    color: 'var(--chart-2)',
  },
  cards: {
    label: '读后笔记',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig;

type ActivityStamp = ReadingActivityDay & {
  special: boolean;
  streak: number;
  status: ActivityStampStatus;
};

type ActivityStampStatus = 'unstarted' | 'empty' | 'today' | 'lit';

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
  const stats = useMemo(() => computeReadingStats(articles), [articles]);
  const activityDays = useMemo(() => computeReadingActivityDays(articles), [articles]);
  const chartData = activityDays.slice(-21);
  const activityStamps = useMemo(
    () => buildActivityStamps(activityDays, articles),
    [activityDays, articles],
  );
  const hasLitStamp = activityStamps.some((day) => day.status === 'lit');
  const litStampCount = activityStamps.filter((day) => day.status === 'lit').length;
  const currentStreak = activityStamps.at(-1)?.streak || 0;
  const mapDescription = activityMapDescription(hasLitStamp, litStampCount, currentStreak);

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
      <div className="stats-periods">
        <StatsPeriod title="今日" stats={stats.today} />
        <StatsPeriod title="本周" stats={stats.week} />
        <StatsPeriod title="累计" stats={stats.total} />
      </div>
      <section className="stats-visual-grid">
        <div className="stats-chart-card">
          <div className="stats-section-heading">
            <h3>近 21 天活动</h3>
            <p>批注、讨论和读后笔记趋势</p>
          </div>
          <ChartContainer className="h-[240px] w-full" config={chartConfig}>
            <LineChart accessibilityLayer data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="2 8" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                minTickGap={16}
              />
              <YAxis axisLine={false} tickLine={false} width={24} />
              <ChartTooltip content={<ChartTooltipContent className="stats-chart-tooltip" />} />
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
              <Line
                activeDot={{ r: 5, strokeWidth: 0 }}
                className="stats-handdrawn-stroke"
                dataKey="cards"
                dot={false}
                shape={renderCardsLine}
                stroke="var(--color-cards)"
                strokeDasharray="6 8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                type="linear"
              />
            </LineChart>
          </ChartContainer>
        </div>
        <div className="stats-activity-card">
          <div className="stats-section-heading">
            <h3>{hasLitStamp ? '70 天伴读地图' : '从今天开始，收集你的伴读藏书票'}</h3>
            <p>{mapDescription}</p>
          </div>
          <div className="activity-heatmap" aria-label="近 70 天伴读活动">
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
    </div>
  );
}

function renderAnnotationsLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={11} />;
}

function renderCommentsLine(props: CurveProps) {
  return <HandDrawnCurve {...props} seed={23} />;
}

function renderCardsLine(props: CurveProps) {
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

function buildActivityStamps(
  days: ReadingActivityDay[],
  articles: ArticleRecord[],
): ActivityStamp[] {
  const today = days.at(-1)?.date || localDateKey(new Date().toISOString());
  const startDate = firstActivityDate(articles) || today;
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

function localDateKey(value: string | undefined) {
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

function StatsPeriod({ stats, title }: { stats: ReadingStatsPeriod; title: string }) {
  return (
    <section className="stats-period">
      <h3>{title}</h3>
      <div className="stats-grid">
        <StatsMetric label="文章" value={stats.articles} />
        <StatsMetric label="批注" value={stats.annotations} />
        <StatsMetric label="讨论" value={stats.comments} />
        <StatsMetric label="AI 参与" value={stats.aiComments} />
      </div>
    </section>
  );
}

function StatsMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="stats-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
