// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';

vi.mock('recharts', async () => {
  const React = await import('react');
  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Area: () => <path data-testid="chart-area" />,
    AreaChart: passthrough,
    CartesianGrid: () => <g data-testid="chart-grid" />,
    ResponsiveContainer: passthrough,
    Tooltip: () => null,
    XAxis: () => <g data-testid="chart-x-axis" />,
    YAxis: () => <g data-testid="chart-y-axis" />,
  };
});

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
      title: '读后卡片',
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
    expect(screen.getAllByLabelText(/条批注/)).toHaveLength(70);
    expect(screen.getAllByTestId('chart-area')).toHaveLength(3);
  });

  it('calls refresh from the panel action', () => {
    const onRefresh = vi.fn();
    render(<ReadingStatsPanel articles={[]} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole('button', { name: /刷新/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
