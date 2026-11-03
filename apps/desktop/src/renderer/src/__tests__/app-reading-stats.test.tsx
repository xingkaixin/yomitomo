// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
});

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function article(overrides: Partial<WebArticleRecord> = {}): WebArticleRecord {
  const now = new Date().toISOString();
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
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
        author: { kind: 'user', username: 'reader' },
        color: '#f4c95d',
        comments: [
          {
            id: 'comment_1',
            author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
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
});
