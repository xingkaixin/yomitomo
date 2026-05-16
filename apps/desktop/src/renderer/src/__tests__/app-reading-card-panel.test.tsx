// @vitest-environment jsdom

import React from 'react';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  ArticleRecord,
  ReadingDeliberationRecord,
  ReadingCardRecord,
  ReadingCardReviewRecord,
} from '@yomitomo/shared';
import { ReadingCard, ReadingCardReviewAgentStrip } from '../app-reading-card-panel';

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
        readingIntent: 'explain',
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
          {
            id: 'comment_2',
            author: 'ai',
            content: '这是一条线程评论',
            createdAt: now,
            agentNickname: '助手',
            agentUsername: 'assistant',
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

function failedReview(): ReadingCardReviewRecord {
  return {
    id: 'review_1',
    articleId: 'article_1',
    readingCardId: 'reading_card_1',
    reviewerResults: [
      {
        id: 'result_1',
        reviewerId: 'agent_1',
        reviewerNickname: '审核助手',
        reviewerUsername: 'reviewer',
        reviewerAvatar: '',
        reviewerColor: '#8ab6d6',
        status: 'error',
        verdict: 'revise',
        summary: '审核助手 没有完成审稿：模型输出达到 max_tokens=3200',
        findings: [
          {
            section: '整篇笔记',
            severity: 'high',
            problem: '模型输出达到 max_tokens=3200，结构化 JSON 可能已被截断',
            evidenceIds: [],
          },
        ],
        acceptedClaims: [],
        missingAngles: [],
        rawResponse: '模型输出达到 max_tokens=3200',
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function reviewWithReferences(): ReadingCardReviewRecord {
  return {
    id: 'review_1',
    articleId: 'article_1',
    readingCardId: 'reading_card_1',
    reviewerResults: [
      {
        id: 'result_1',
        reviewerId: 'agent_1',
        reviewerNickname: '审核助手',
        reviewerUsername: 'reviewer',
        reviewerAvatar: '',
        reviewerColor: '#8ab6d6',
        status: 'done',
        verdict: 'revise',
        summary: '整体需要回看 #1',
        findings: [
          {
            section: '核心主张',
            severity: 'medium',
            problem: '这条判断对应 [#1]，但归因需要更具体。',
            evidenceIds: [1],
            suggestedRewrite: '保留 #1 的原始语境。',
          },
        ],
        acceptedClaims: ['关键判断保留 #1'],
        missingAngles: ['补充 [#1] 的讨论来源'],
        rawResponse: '',
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function reviewAgent(): Agent {
  return {
    id: 'agent_1',
    kind: 'review',
    enabled: true,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function domRect(left: number, width: number, top = 0, height = 120): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function firePointerEvent(
  element: Element | Window,
  eventName: 'pointerDown' | 'pointerMove' | 'pointerUp',
  clientX: number,
  clientY = 40,
) {
  const event =
    eventName === 'pointerDown'
      ? createEvent.pointerDown(element, { button: 0 })
      : eventName === 'pointerMove'
        ? createEvent.pointerMove(element)
        : createEvent.pointerUp(element, { button: 0 });
  Object.defineProperty(event, 'clientX', {
    configurable: true,
    value: clientX,
  });
  Object.defineProperty(event, 'clientY', {
    configurable: true,
    value: clientY,
  });
  fireEvent(element, event);
}

function mockReceiptColumnRects() {
  const leftByColumn = new Map([
    ['待定', 0],
    ['纳入', 300],
    ['追问', 600],
    ['暂放', 900],
  ]);
  for (const [label, left] of leftByColumn) {
    vi.spyOn(screen.getByLabelText(`${label}列`), 'getBoundingClientRect').mockReturnValue(
      domRect(left, 240),
    );
  }
  return leftByColumn;
}

function dragReceiptCard(quote: string, columnLabel: string) {
  const card = screen.getByLabelText(`批注卡片：${quote}`);
  const leftByColumn = mockReceiptColumnRects();
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(domRect(0, 240));

  firePointerEvent(card, 'pointerDown', 220);
  firePointerEvent(window, 'pointerMove', (leftByColumn.get(columnLabel) || 0) + 220);
  firePointerEvent(window, 'pointerUp', (leftByColumn.get(columnLabel) || 0) + 220);
}

describe('ReadingCard', () => {
  it('renders the review agent strip empty state', () => {
    render(
      <ReadingCardReviewAgentStrip
        reviewAgents={[]}
        selectedReviewAgentIds={[]}
        onToggleReviewAgent={vi.fn()}
      />,
    );

    expect(screen.getByText('请先在助手设置中创建审阅助手。')).toBeTruthy();
  });

  it('toggles a review agent from the strip', () => {
    const onToggleReviewAgent = vi.fn();

    render(
      <ReadingCardReviewAgentStrip
        reviewAgents={[reviewAgent()]}
        selectedReviewAgentIds={['agent_1']}
        onToggleReviewAgent={onToggleReviewAgent}
      />,
    );

    const button = screen.getByRole('button', { name: /审核助手/ });
    expect(button.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button);

    expect(onToggleReviewAgent).toHaveBeenCalledWith('agent_1');
  });

  it('renders the reading card workflow steps', () => {
    render(
      <ReadingCard
        article={article()}
        reviewAgents={[reviewAgent()]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: '读后回执收束操作' })).toBeTruthy();
    expect(screen.getByText('当前节点')).toBeTruthy();
    expect(screen.getAllByText('收束阅读').length).toBeGreaterThan(0);
    expect(screen.queryByText('整理回执', { selector: 'strong' })).toBeNull();
    expect(screen.queryByText('审阅席', { selector: 'strong' })).toBeNull();
    expect(screen.queryByText('选择稍后检查这份回执的视角')).toBeNull();
    expect(screen.getByRole('button', { name: /待归类 1/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('批注卡片：重要原文')).toBeTruthy();
    expect(screen.getByText('解释')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '归入纳入 #1' })).toBeNull();
  });

  it('drops a card once half of it overlaps the target column', () => {
    render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    const card = screen.getByLabelText('批注卡片：重要原文');
    mockReceiptColumnRects();
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(domRect(0, 240));

    firePointerEvent(card, 'pointerDown', 220);
    firePointerEvent(window, 'pointerMove', 410);
    firePointerEvent(window, 'pointerUp', 410);

    expect(screen.getByText('1/1 已归类')).toBeTruthy();
    expect(screen.getByRole('button', { name: /收束这次阅读/ }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('keeps a card pending when less than half overlaps the target column', () => {
    render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    const card = screen.getByLabelText('批注卡片：重要原文');
    mockReceiptColumnRects();
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(domRect(0, 240));

    firePointerEvent(card, 'pointerDown', 20);
    firePointerEvent(window, 'pointerMove', 450);
    firePointerEvent(window, 'pointerUp', 450);

    expect(screen.getByText('0/1 已归类')).toBeTruthy();
    expect(screen.getByRole('button', { name: /待归类 1/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('批注卡片：重要原文').className).toContain('is-active');
  });

  it('temporarily removes the source card while dragging it', () => {
    render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    const card = screen.getByLabelText('批注卡片：重要原文');
    mockReceiptColumnRects();
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(domRect(0, 240));

    firePointerEvent(card, 'pointerDown', 220);
    firePointerEvent(window, 'pointerMove', 340);

    expect(screen.queryByLabelText('批注卡片：重要原文')).toBeNull();

    firePointerEvent(window, 'pointerUp', 340);
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

    dragReceiptCard('重要原文', '纳入');
    fireEvent.click(screen.getByRole('button', { name: /收束这次阅读/ }));

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
        receiptDecisions: [
          expect.objectContaining({
            disposition: 'include',
            evidenceId: 'annotation_1',
            evidenceIndex: 1,
          }),
        ],
      }),
    );
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('passes receipt disposition changes into deliberation generation', async () => {
    const desktop = installDesktopApi();

    render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    dragReceiptCard('重要原文', '暂放');
    fireEvent.click(screen.getByRole('button', { name: /收束这次阅读/ }));

    await waitFor(() => expect(desktop.generateReadingDeliberation).toHaveBeenCalledTimes(1));
    expect(desktop.generateReadingDeliberation).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptDecisions: [
          expect.objectContaining({
            disposition: 'exclude',
            evidenceId: 'annotation_1',
            evidenceIndex: 1,
          }),
        ],
      }),
    );
  });

  it('ignores stale deliberation results after switching articles', async () => {
    const desktop = installDesktopApi();
    const pendingDeliberation = deferred<{ readingDeliberation: ReadingDeliberationRecord }>();
    desktop.generateReadingDeliberation.mockReturnValueOnce(pendingDeliberation.promise);
    const onGenerated = vi.fn();
    const { rerender } = render(
      <ReadingCard
        article={article()}
        reviewAgents={[]}
        onGenerated={onGenerated}
        onOpenEvidence={vi.fn()}
      />,
    );

    dragReceiptCard('重要原文', '纳入');
    fireEvent.click(screen.getByRole('button', { name: /收束这次阅读/ }));

    await waitFor(() => expect(desktop.generateReadingDeliberation).toHaveBeenCalledTimes(1));
    rerender(
      <ReadingCard
        article={article({
          id: 'article_2',
          title: '第二篇文章',
          contentHtml: '<article><p>另一篇正文。</p></article>',
          contentHash: 'hash_2',
          annotations: [],
        })}
        reviewAgents={[]}
        onGenerated={onGenerated}
        onOpenEvidence={vi.fn()}
      />,
    );

    await act(async () => {
      pendingDeliberation.resolve({
        readingDeliberation: deliberation({
          title: '旧文章审议',
          contentMarkdown: '## 旧结论\n不应出现',
          sections: [{ title: '旧结论', content: '不应出现' }],
          updatedAt: '2026-05-04T00:02:00.000Z',
        }),
      });
      await pendingDeliberation.promise;
    });

    expect(screen.getAllByText('第二篇文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('旧文章审议')).toBeNull();
    expect(screen.queryByText('旧结论')).toBeNull();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it('starts AI card generation from the current deliberation', async () => {
    const desktop = installDesktopApi();
    const currentDeliberation = deliberation();
    desktop.generateReadingCard.mockResolvedValue({
      readingCard: readingCard({ updatedAt: '2026-05-04T00:02:00.000Z' }),
    });
    const onGenerated = vi.fn();

    render(
      <ReadingCard
        article={article({ readingDeliberation: currentDeliberation })}
        reviewAgents={[]}
        onGenerated={onGenerated}
        onOpenEvidence={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /打磨成回执/ }));

    await waitFor(() => expect(desktop.generateReadingCard).toHaveBeenCalledTimes(1));
    expect(desktop.generateReadingCard).toHaveBeenCalledWith(
      expect.objectContaining({
        article: expect.objectContaining({ id: 'article_1' }),
        readingDeliberation: currentDeliberation,
        receiptDecisions: [
          expect.objectContaining({
            disposition: 'include',
            evidenceId: 'annotation_1',
            evidenceIndex: 1,
          }),
        ],
      }),
    );
    expect(onGenerated).toHaveBeenCalledTimes(1);
  });

  it('starts review with selected review agents', async () => {
    const desktop = installDesktopApi();
    const currentCard = readingCard();
    desktop.reviewReadingCard.mockResolvedValue({
      review: reviewWithReferences(),
    });
    const onGenerated = vi.fn();

    render(
      <ReadingCard
        article={article({ readingDeliberation: deliberation(), readingCard: currentCard })}
        reviewAgents={[reviewAgent()]}
        onGenerated={onGenerated}
        onOpenEvidence={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /请审阅席检查/ }));

    await waitFor(() => expect(desktop.reviewReadingCard).toHaveBeenCalledTimes(1));
    expect(desktop.reviewReadingCard).toHaveBeenCalledWith(
      expect.objectContaining({
        article: expect.objectContaining({ id: 'article_1' }),
        readingCard: currentCard,
        reviewAgentIds: ['agent_1'],
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
    expect(reference.querySelector('.reading-card-ref-popover')?.textContent).not.toContain(
      '这是一条线程评论',
    );

    fireEvent.click(reference);

    expect(onOpenEvidence).toHaveBeenCalledWith('annotation_1');
  });

  it('formats review references and opens linked annotations', () => {
    const onOpenEvidence = vi.fn();

    render(
      <ReadingCard
        article={article({
          readingDeliberation: deliberation(),
          readingCard: readingCard({ review: reviewWithReferences() }),
        })}
        reviewAgents={[reviewAgent()]}
        onGenerated={vi.fn()}
        onOpenEvidence={onOpenEvidence}
      />,
    );

    const references = screen.getAllByRole('button', { name: '打开批注 #1' });
    expect(references.length).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText('[#1]')).toBeNull();

    fireEvent.click(references[0]);

    expect(onOpenEvidence).toHaveBeenCalledWith('annotation_1');
  });

  it('retries a failed reviewer without discarding the existing review', async () => {
    const desktop = installDesktopApi();
    const previousReview = failedReview();
    desktop.reviewReadingCard.mockResolvedValue({
      review: {
        ...previousReview,
        reviewerResults: [
          {
            ...previousReview.reviewerResults[0],
            status: 'done',
            verdict: 'pass',
            summary: '重新审核通过',
            findings: [],
            rawResponse: undefined,
          },
        ],
        updatedAt: '2026-05-04T00:02:00.000Z',
      },
    });

    render(
      <ReadingCard
        article={article({
          readingDeliberation: deliberation(),
          readingCard: readingCard({ review: previousReview }),
        })}
        reviewAgents={[reviewAgent()]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '重新审核 审核助手' }));

    await waitFor(() => expect(desktop.reviewReadingCard).toHaveBeenCalledTimes(1));
    expect(desktop.reviewReadingCard).toHaveBeenCalledWith(
      expect.objectContaining({
        previousReview,
        reviewAgentIds: ['agent_1'],
      }),
    );
  });
});
