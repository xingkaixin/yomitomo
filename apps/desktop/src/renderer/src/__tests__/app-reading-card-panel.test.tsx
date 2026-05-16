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
  UserProfile,
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

function userProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'user_1',
    nickname: 'Kevin',
    username: 'kevin',
    avatar: '',
    annotationColor: '#f4c95d',
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
    title: '阅读所得',
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

function annotationAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'reader_agent_1',
    kind: 'annotation',
    enabled: true,
    providerId: 'provider_1',
    nickname: '阅读助手',
    username: 'reader',
    avatar: '',
    annotationColor: '#86a77a',
    annotationDensity: 'medium',
    temperature: 0.35,
    soul: 'reader',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function installDesktopApi() {
  const generateReadingDeliberation = vi.fn().mockResolvedValue({
    readingDeliberation: deliberation({ updatedAt: '2026-05-04T00:01:00.000Z' }),
  });
  const clarificationOpinion = {
    agentId: 'reader_agent_1',
    agentNickname: '阅读助手',
    agentUsername: 'reader',
    agentAvatar: '',
    agentColor: '#86a77a',
    stance: 'include' as const,
    reason: '这条批注能支撑这次阅读留下的判断，应该纳入。',
  };
  const generateReadingReceiptClarification = vi.fn().mockResolvedValue({
    opinions: [clarificationOpinion],
  });
  const generateReadingReceiptClarificationStream = vi.fn(async (_input, onEvent) => {
    onEvent({
      type: 'agent_start',
      agent: {
        agentId: clarificationOpinion.agentId,
        agentNickname: clarificationOpinion.agentNickname,
        agentUsername: clarificationOpinion.agentUsername,
        agentAvatar: clarificationOpinion.agentAvatar,
        agentColor: clarificationOpinion.agentColor,
      },
    });
    onEvent({ type: 'agent_delta', agentId: clarificationOpinion.agentId, delta: '{"reason":"' });
    onEvent({
      type: 'agent_delta',
      agentId: clarificationOpinion.agentId,
      delta: clarificationOpinion.reason,
    });
    onEvent({ type: 'agent_done', opinion: clarificationOpinion });
    return { opinions: [clarificationOpinion] };
  });
  const desktop = {
    generateReadingDeliberation,
    generateReadingReceiptClarification,
    generateReadingReceiptClarificationStream,
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
    ['待澄清', 0],
    ['纳入', 300],
    ['暂放', 600],
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

    expect(screen.getByRole('region', { name: '读后回执生成流程' })).toBeTruthy();
    expect(screen.getByText('当前节点')).toBeTruthy();
    expect(screen.getAllByText('拣选').length).toBeGreaterThan(0);
    expect(screen.queryByText('整理回执', { selector: 'strong' })).toBeNull();
    expect(screen.queryByText('审阅席', { selector: 'strong' })).toBeNull();
    expect(screen.queryByText('选择稍后检查这份回执的视角')).toBeNull();
    expect(screen.getByRole('button', { name: /待澄清 1/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('待澄清列')).toBeTruthy();
    expect(screen.queryByLabelText('待定列')).toBeNull();
    expect(screen.queryByLabelText('追问列')).toBeNull();
    expect(screen.getByLabelText('批注卡片：重要原文')).toBeTruthy();
    expect(screen.getByText('解释')).toBeTruthy();
    expect(screen.getByRole('button', { name: /澄清讨论：重要原文/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '归入纳入 #1' })).toBeNull();
  });

  it('runs clarification rounds from a clarifying card and resolves it', async () => {
    const desktop = installDesktopApi();
    const onUpdateArticle = vi.fn();
    render(
      <ReadingCard
        annotationAgents={[annotationAgent()]}
        article={article()}
        reviewAgents={[]}
        userProfile={userProfile()}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
        onUpdateArticle={onUpdateArticle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /澄清讨论：重要原文/ }));

    expect(screen.getByLabelText('澄清讨论面板：重要原文')).toBeTruthy();
    expect(screen.getByText('讨论成员')).toBeTruthy();
    expect(screen.getByText('Kevin')).toBeTruthy();
    expect(screen.getByRole('button', { name: /关闭讨论：重要原文/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '发表观点' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '添加助手' }));
    expect(screen.getByRole('button', { name: '阅读助手' })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: '阅读助手' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '添加助手' }));
    fireEvent.click(screen.getByRole('button', { name: '阅读助手' }));
    fireEvent.click(screen.getByRole('button', { name: '发表观点' }));

    await waitFor(() =>
      expect(desktop.generateReadingReceiptClarificationStream).toHaveBeenCalledOnce(),
    );
    expect(desktop.generateReadingReceiptClarificationStream).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedAgentIds: ['reader_agent_1'],
        userThought: '',
      }),
      expect.any(Function),
    );
    expect(await screen.findByText('这条批注能支撑这次阅读留下的判断，应该纳入。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '带着我的想法再发表观点' }));
    fireEvent.change(screen.getByPlaceholderText(/写下你的疑问/), {
      target: { value: '我还想确认它是不是只是原文事实。' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发表观点' }));

    await waitFor(() =>
      expect(desktop.generateReadingReceiptClarificationStream).toHaveBeenCalledTimes(2),
    );
    expect(desktop.generateReadingReceiptClarificationStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        previousRounds: [
          expect.objectContaining({
            opinions: [expect.objectContaining({ stance: 'include' })],
          }),
        ],
        userThought: '我还想确认它是不是只是原文事实。',
      }),
      expect.any(Function),
    );

    fireEvent.click(screen.getByRole('button', { name: '我决定纳入' }));

    expect(screen.getByText('1/1 已确认')).toBeTruthy();
    expect(screen.getByRole('button', { name: /生成阅读所得/ }).hasAttribute('disabled')).toBe(
      false,
    );
    await waitFor(() => {
      const update = onUpdateArticle.mock.calls.at(-1)?.[1];
      const saved = update?.(article());
      expect(saved?.readingReceiptState?.dispositions).toEqual([
        { evidenceId: 'annotation_1', disposition: 'include' },
      ]);
      expect(saved?.readingReceiptState?.clarifications[0]?.selectedAgentIds).toEqual([
        'reader_agent_1',
      ]);
      expect(saved?.readingReceiptState?.clarifications[0]?.rounds[0]?.opinions[0]?.reason).toBe(
        '这条批注能支撑这次阅读留下的判断，应该纳入。',
      );
    });
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

    expect(screen.getByText('1/1 已确认')).toBeTruthy();
    expect(screen.getByRole('button', { name: /生成阅读所得/ }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('keeps a card clarifying when less than half overlaps the target column', () => {
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

    expect(screen.getByText('0/1 已确认')).toBeTruthy();
    expect(screen.getByRole('button', { name: /待澄清 1/ }).hasAttribute('disabled')).toBe(true);
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

  it('locks the triage board after reading所得 is generated', () => {
    render(
      <ReadingCard
        article={article({ readingDeliberation: deliberation() })}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
      />,
    );

    const card = screen.getByLabelText('批注卡片：重要原文');
    mockReceiptColumnRects();
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(domRect(300, 240));

    firePointerEvent(card, 'pointerDown', 520);
    firePointerEvent(window, 'pointerMove', 120);
    firePointerEvent(window, 'pointerUp', 120);

    expect(screen.getByText('已确认的阅读所得材料')).toBeTruthy();
    expect(screen.getByText('1/1 已确认')).toBeTruthy();
    expect(screen.getByLabelText('批注卡片：重要原文').className).toContain('is-locked');
    expect(screen.queryByRole('button', { name: /澄清讨论/ })).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /生成阅读所得/ }));

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
    fireEvent.click(screen.getByRole('button', { name: /生成阅读所得/ }));

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
    fireEvent.click(screen.getByRole('button', { name: /生成阅读所得/ }));

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
          title: '旧阅读所得',
          contentMarkdown: '## 旧结论\n不应出现',
          sections: [{ title: '旧结论', content: '不应出现' }],
          updatedAt: '2026-05-04T00:02:00.000Z',
        }),
      });
      await pendingDeliberation.promise;
    });

    expect(screen.getAllByText('第二篇文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('旧阅读所得')).toBeNull();
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

    expect(screen.getByRole('button', { name: /补一句后打磨/ }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.change(screen.getByPlaceholderText('我读完后真正留下的是...'), {
      target: { value: 'AI 审自己的代码时，边界比态度更重要。' },
    });
    fireEvent.click(screen.getByRole('button', { name: /确认并打磨成回执/ }));

    await waitFor(() => expect(desktop.generateReadingCard).toHaveBeenCalledTimes(1));
    expect(desktop.generateReadingCard).toHaveBeenCalledWith(
      expect.objectContaining({
        article: expect.objectContaining({ id: 'article_1' }),
        readingDeliberation: currentDeliberation,
        userJudgment: 'AI 审自己的代码时，边界比态度更重要。',
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

  it('returns from confirmation to triage and discards generated outputs', () => {
    const onUpdateArticle = vi.fn();
    const currentDeliberation = deliberation();
    const currentArticle = article({
      readingDeliberation: currentDeliberation,
      readingReceiptState: {
        sourceUpdatedAt: now,
        dispositions: [{ evidenceId: 'annotation_1', disposition: 'include' }],
        clarifications: [],
        confirmation: {
          userJudgment: '旧判断',
          deliberationUpdatedAt: currentDeliberation.updatedAt,
          updatedAt: now,
        },
        updatedAt: now,
      },
    });

    render(
      <ReadingCard
        article={currentArticle}
        reviewAgents={[]}
        onGenerated={vi.fn()}
        onOpenEvidence={vi.fn()}
        onUpdateArticle={onUpdateArticle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回到拣选' }));

    expect(screen.getByText('把要进入阅读所得的材料确认下来')).toBeTruthy();
    expect(screen.getByLabelText('批注卡片：重要原文').className).not.toContain('is-locked');
    const update = onUpdateArticle.mock.calls.at(-1)?.[1];
    const saved = update?.(currentArticle);
    expect(saved?.readingDeliberation).toBeUndefined();
    expect(saved?.readingCard).toBeUndefined();
    expect(saved?.readingReceiptState?.dispositions).toEqual([
      { evidenceId: 'annotation_1', disposition: 'include' },
    ]);
    expect(saved?.readingReceiptState?.confirmation).toBeUndefined();
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
        article={article({ readingDeliberation: deliberation() })}
        reviewAgents={[reviewAgent()]}
        userProfile={userProfile({
          avatar: 'https://example.com/user-avatar.png',
          nickname: '行开心',
        })}
        onGenerated={vi.fn()}
        onOpenEvidence={onOpenEvidence}
      />,
    );

    const reference = screen.getAllByRole('button', { name: '打开批注 #1' })[0];
    expect(reference.textContent).toContain('#1');
    const popover = reference.querySelector('.reading-card-ref-popover');
    expect(popover?.querySelector('.reading-card-ref-avatar')?.getAttribute('src')).toBe(
      'https://example.com/user-avatar.png',
    );
    expect(popover?.textContent).toContain('行开心');
    expect(popover?.textContent).toContain('关键判断');
    expect(popover?.textContent).toContain('解释');
    expect(popover?.textContent).toContain('这段可以作为证据');
    expect(popover?.textContent).not.toContain('这是一条线程评论');

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
