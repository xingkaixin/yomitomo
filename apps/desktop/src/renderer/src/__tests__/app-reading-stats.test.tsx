// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';

function MockResponsiveContainer({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function MockLineChart({ children }: { children?: React.ReactNode }) {
  return <svg>{children}</svg>;
}

vi.mock('recharts', () => ({
  CartesianGrid: () => <g data-testid="chart-grid" />,
  Line: () => <path data-testid="chart-line" />,
  LineChart: MockLineChart,
  ReferenceArea: () => <rect data-testid="chart-unstarted-area" />,
  ResponsiveContainer: MockResponsiveContainer,
  Tooltip: () => null,
  XAxis: () => <g data-testid="chart-x-axis" />,
  YAxis: () => <g data-testid="chart-y-axis" />,
}));

import { ReadingStatsPanel } from '../reading-stats/app-reading-stats';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  const now = new Date().toISOString();
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [
      {
        id: 'annotation_1',
        anchor: {
          exact: '正文',
          prefix: '',
          suffix: '',
          start: 0,
          end: 2,
        },
        author: 'user',
        color: '#f4c95d',
        comments: [
          {
            id: 'comment_1',
            author: 'ai',
            content: 'AI 评论',
            createdAt: now,
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('ReadingStatsPanel', () => {
  it('renders reading metrics and activity heatmap', async () => {
    render(<ReadingStatsPanel articles={[article()]} onRefresh={vi.fn()} />);

    expect(screen.getByText('统计')).toBeTruthy();
    expect(screen.getByText('今日活动')).toBeTruthy();
    expect(screen.getAllByText(/已记录/).length).toBeGreaterThan(0);
    expect(screen.getByText('下一目标')).toBeTruthy();
    expect(screen.getByText(/累计：/)).toBeTruthy();
    expect(await screen.findByText('伴读活动趋势')).toBeTruthy();
    expect(await screen.findByText('伴读洞察')).toBeTruthy();
    expect(screen.getByLabelText('近 70 天伴读活动')).toBeTruthy();
    expect(screen.getByText('70 天伴读地图')).toBeTruthy();
    expect(screen.getAllByLabelText(/伴读旅程尚未开始/)).toHaveLength(69);
    expect(screen.getAllByLabelText(/条划线/)).toHaveLength(1);
    await waitFor(() => expect(screen.getAllByTestId('chart-line')).toHaveLength(3));
  });

  it('renders a starting state for a new reader', async () => {
    render(<ReadingStatsPanel articles={[]} onRefresh={vi.fn()} />);

    expect(await screen.findByText('从今天开始，收集你的伴读藏书票')).toBeTruthy();
    expect(screen.getAllByLabelText(/伴读旅程尚未开始/)).toHaveLength(69);
    expect(screen.getByLabelText(/今天读一篇，盖下第一枚藏书票/)).toBeTruthy();
  });

  it('marks a special stamp for seven consecutive active days', async () => {
    const articles = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const createdAt = date.toISOString();
      return article({
        annotations: [],
        createdAt,
        id: `article_${index}`,
        updatedAt: createdAt,
      });
    });

    render(<ReadingStatsPanel articles={articles} onRefresh={vi.fn()} />);

    expect(await screen.findByLabelText(/连续 7 天特殊印章/)).toBeTruthy();
  });

  it('calls refresh from the panel action', () => {
    const onRefresh = vi.fn();
    render(<ReadingStatsPanel articles={[]} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('hides the WeRead stats source when the WeRead library source is disabled', () => {
    render(
      <ReadingStatsPanel
        articles={[]}
        settings={{
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: true },
            { id: 'pdf', enabled: true },
            { id: 'weread', enabled: false },
          ],
        }}
        onRefresh={vi.fn()}
      />,
    );

    const sourceTabs = screen.getByRole('tablist', { name: '统计来源' });
    expect(sourceTabs.textContent).toContain('本地阅读');
    expect(sourceTabs.textContent).not.toContain('微信读书');
  });

  it('records stats loading timing phases', async () => {
    const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { recordPerformanceTiming },
    });

    render(
      <ReadingStatsPanel
        articles={[article()]}
        navigationStartedAt={performance.now() - 12}
        onRefresh={vi.fn()}
      />,
    );

    await waitFor(() => {
      const events = recordPerformanceTiming.mock.calls.map(([input]) => input.event);
      expect(events).toContain('stats.first_paint');
      expect(events).toContain('stats.deferred_content_start');
      expect(events).toContain('stats.content_ready');
      expect(events).toContain('stats.chart_ready');
      expect(events).toContain('stats.ready');
    });

    expect(recordPerformanceTiming).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'stats.ready',
        data: expect.objectContaining({
          articleCount: 1,
          elapsedMs: expect.any(Number),
          phase: 'ready',
        }),
      }),
    );
  });
});
