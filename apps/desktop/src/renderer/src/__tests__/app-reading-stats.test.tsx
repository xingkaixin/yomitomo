// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';

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
  ResponsiveContainer: MockResponsiveContainer,
  Tooltip: () => null,
  XAxis: () => <g data-testid="chart-x-axis" />,
  YAxis: () => <g data-testid="chart-y-axis" />,
}));

import { ReadingStatsPanel } from '../app-reading-stats';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    readingCard: {
      id: 'card_1',
      articleId: 'article_1',
      title: '读后笔记',
      contentMarkdown: '## 核心',
      sections: [{ title: '核心', content: '内容' }],
      providerId: 'provider_1',
      providerName: 'Provider',
      modelName: 'model',
      createdAt: now,
      updatedAt: now,
    },
    ...overrides,
  };
}

describe('ReadingStatsPanel', () => {
  it('renders reading metrics and activity heatmap', () => {
    render(<ReadingStatsPanel articles={[article()]} onRefresh={vi.fn()} />);

    expect(screen.getByText('统计')).toBeTruthy();
    expect(screen.getByText('今日')).toBeTruthy();
    expect(screen.getByText('本周')).toBeTruthy();
    expect(screen.getByText('累计')).toBeTruthy();
    expect(screen.getByLabelText('近 70 天伴读活动')).toBeTruthy();
    expect(screen.getByText('70 天伴读地图')).toBeTruthy();
    expect(screen.getAllByLabelText(/伴读旅程尚未开始/)).toHaveLength(69);
    expect(screen.getAllByLabelText(/条批注/)).toHaveLength(1);
    expect(screen.getAllByTestId('chart-line')).toHaveLength(3);
  });

  it('renders a starting state for a new reader', () => {
    render(<ReadingStatsPanel articles={[]} onRefresh={vi.fn()} />);

    expect(screen.getByText('从今天开始，收集你的伴读藏书票')).toBeTruthy();
    expect(screen.getAllByLabelText(/伴读旅程尚未开始/)).toHaveLength(69);
    expect(screen.getByLabelText(/今天读一篇，盖下第一枚藏书票/)).toBeTruthy();
  });

  it('marks a special stamp for seven consecutive active days', () => {
    const articles = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      const createdAt = date.toISOString();
      return article({
        annotations: [],
        createdAt,
        id: `article_${index}`,
        readingCard: undefined,
        updatedAt: createdAt,
      });
    });

    render(<ReadingStatsPanel articles={articles} onRefresh={vi.fn()} />);

    expect(screen.getByLabelText(/连续 7 天特殊印章/)).toBeTruthy();
  });

  it('calls refresh from the panel action', () => {
    const onRefresh = vi.fn();
    render(<ReadingStatsPanel articles={[]} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
