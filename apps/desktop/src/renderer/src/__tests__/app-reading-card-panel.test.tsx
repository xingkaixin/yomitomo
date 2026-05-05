// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  ArticleRecord,
  ReadingDeliberationRecord,
  ReadingCardRecord,
} from '@yomitomo/shared';
import { ReadingCard } from '../app-reading-card-panel';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const now = '2026-05-04T00:00:00.000Z';

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '第一性原理读书笔记',
    byline: 'Kevin',
    excerpt: '测试摘要',
    contentHtml: '<article><p>重要原文推动了关键判断。</p></article>',
    contentHash: 'hash_1',
    annotations: [
      {
        id: 'annotation_1',
        anchor: {
          exact: '重要原文',
          prefix: '',
          suffix: '推动了关键判断。',
          start: 0,
          end: 4,
        },
        author: 'user',
        annotationType: 'key_point',
        color: '#f4c95d',
        userNickname: '我',
        userUsername: 'me',
        comments: [
          {
            id: 'comment_1',
            author: 'user',
            content: '这段可以作为证据',
            createdAt: now,
            userNickname: '我',
            userUsername: 'me',
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

function deliberation(
  overrides: Partial<ReadingDeliberationRecord> = {},
): ReadingDeliberationRecord {
  return {
    id: 'deliberation_1',
    articleId: 'article_1',
    title: '审议报告',
    contentMarkdown: '## 证据\n来自 [#1]',
    sections: [{ title: '证据', content: '来自 [#1]' }],
    providerId: 'provider_1',
    providerName: 'Anthropic',
    modelName: 'claude',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function readingCard(overrides: Partial<ReadingCardRecord> = {}): ReadingCardRecord {
  return {
    id: 'reading_card_1',
    articleId: 'article_1',
    title: '读后笔记',
    contentMarkdown: '## 核心主张\n关键判断来自 [#1]',
    sections: [{ title: '核心主张', content: '关键判断来自 [#1]' }],
    providerId: 'provider_1',
    providerName: 'Anthropic',
    modelName: 'claude',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function reviewAgent(): Agent {
  return {
    id: 'agent_1',
    kind: 'review',
    providerId: 'provider_1',
    nickname: '审核助手',
    username: 'reviewer',
    avatar: '',
    annotationColor: '#8ab6d6',
    annotationDensity: 'medium',
    temperature: 0.35,
    soul: 'review',
    createdAt: now,
    updatedAt: now,
  };
}

function installDesktopApi() {
  const generateReadingDeliberation = vi.fn().mockResolvedValue({
    readingDeliberation: deliberation({ updatedAt: '2026-05-04T00:01:00.000Z' }),
  });
  const desktop = {
    generateReadingDeliberation,
    generateReadingCard: vi.fn(),
    reviewReadingCard: vi.fn(),
  };

  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });

  return desktop;
}

describe('ReadingCard', () => {
  it('renders the reading card workflow steps', () => {
    render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: '读后笔记流程进度' })).toBeTruthy();
    expect(screen.getByText('阅读审议报告')).toBeTruthy();
    expect(screen.getByText('AI 提炼', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('笔记审核')).toBeTruthy();
  });

  it('starts deliberation generation with article evidence units', async () => {
    const desktop = installDesktopApi();
    const onGenerated = vi.fn();

    render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={onGenerated}
        onOpenEvidence={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /生成审议/ }));

    await waitFor(() => expect(desktop.generateReadingDeliberation).toHaveBeenCalledTimes(1));
    expect(desktop.generateReadingDeliberation).toHaveBeenCalledWith(
      expect.objectContaining({
        article: expect.objectContaining({ id: 'article_1' }),
        evidenceUnits: [
          expect.objectContaining({
            id: 'annotation_1',
            index: 1,
            quote: '重要原文',
          }),
        ],
      }),
    );
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('renders evidence references and opens the linked annotation', () => {
    const onOpenEvidence = vi.fn();

    render(
      <ReadingCard
        article={article({ readingDeliberation: deliberation(), readingCard: readingCard() })}
        reviewAgents={[reviewAgent()]}
        onGenerated={vi.fn()}
        onOpenEvidence={onOpenEvidence}
      />,
    );

    const reference = screen.getAllByRole('button', { name: '打开批注 #1' })[0];
    expect(reference.textContent).toContain('#1');

    fireEvent.click(reference);

    expect(onOpenEvidence).toHaveBeenCalledWith('annotation_1');
  });
});
