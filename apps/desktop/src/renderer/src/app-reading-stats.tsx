import React, { useMemo } from 'react';
import { BarChart3, RefreshCcw } from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { computeReadingStats, type ReadingStatsPeriod } from '@yomitomo/core';
import { Button } from './components/ui/button';
import { PanelHeader } from './app-ui';

export function ReadingStatsPanel({
  articles,
  onRefresh,
}: {
  articles: ArticleRecord[];
  onRefresh: () => void;
}) {
  const stats = useMemo(() => computeReadingStats(articles), [articles]);

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<BarChart3 size={20} />}
        title="统计"
        description="基于本地阅读记录生成今日、本周和累计阅读概况。"
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
      <section className="stats-note">
        <h3>阅读时长</h3>
        <p>阅读分钟需要插件端记录阅读器停留时间，后续会和文章记录一起同步到桌面端。</p>
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
