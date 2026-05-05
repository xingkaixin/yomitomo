import React, { useMemo } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  computeReadingActivityDays,
  computeReadingStats,
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
            <AreaChart accessibilityLayer data={chartData} margin={{ left: 0, right: 8 }}>
              <defs>
                <linearGradient id="annotations-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-annotations)" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="var(--color-annotations)" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="comments-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-comments)" stopOpacity={0.24} />
                  <stop offset="95%" stopColor="var(--color-comments)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                tickLine={false}
                tickMargin={10}
                minTickGap={16}
              />
              <YAxis axisLine={false} tickLine={false} width={24} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="annotations"
                fill="url(#annotations-fill)"
                stroke="var(--color-annotations)"
                strokeWidth={2}
                type="monotone"
              />
              <Area
                dataKey="comments"
                fill="url(#comments-fill)"
                stroke="var(--color-comments)"
                strokeWidth={2}
                type="monotone"
              />
              <Area
                dataKey="cards"
                fill="transparent"
                stroke="var(--color-cards)"
                strokeDasharray="4 4"
                strokeWidth={2}
                type="monotone"
              />
            </AreaChart>
          </ChartContainer>
        </div>
        <div className="stats-activity-card">
          <div className="stats-section-heading">
            <h3>伴读打卡</h3>
            <p>近 70 天活动强度</p>
          </div>
          <div className="activity-heatmap" aria-label="近 70 天伴读活动">
            {activityDays.map((day) => (
              <span
                aria-label={`${day.date}：${day.annotations} 条批注，${day.comments} 条讨论，${day.cards} 篇笔记`}
                className={`activity-dot level-${day.level}`}
                key={day.date}
                title={`${day.date} · 批注 ${day.annotations} · 讨论 ${day.comments} · 笔记 ${day.cards}`}
              />
            ))}
          </div>
          <div className="activity-legend" aria-hidden="true">
            <span>少</span>
            <i className="activity-dot level-0" />
            <i className="activity-dot level-1" />
            <i className="activity-dot level-2" />
            <i className="activity-dot level-3" />
            <i className="activity-dot level-4" />
            <span>多</span>
          </div>
        </div>
      </section>
    </div>
  );
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
