// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Annotation, ArticleRecord, Comment } from '@yomitomo/shared';
import {
  AnnotationDiscussionWindowApp,
  insertMentionAtSelection,
} from '../annotation-discussion/app-annotation-discussion-window';
import {
  discussionReplyPlaceholder,
  formatRelativeTime,
  replyTargetAgents,
} from '../annotation-discussion/app-annotation-discussion-utils';
import { initializeAppI18n } from '../i18n/app-i18n';
import { publicAnnotationAgents } from '../source/bookcase/source-public-agents';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
  stopAppSoundEffect: vi.fn(),
}));

const now = '2026-05-31T06:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('discussion time formatting', () => {
  it('keeps older Chinese discussion times relative', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'));
    initializeAppI18n('zh-CN');

    expect(formatRelativeTime('2026-06-01T04:17:00.000Z')).toBe('1 周前');
    expect(formatRelativeTime('2026-05-01T04:17:00.000Z')).toBe('1 个月前');
    expect(formatRelativeTime('2025-05-01T04:17:00.000Z')).toBe('1 年前');
  });

  it('keeps older English discussion times relative with pluralization', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'));
    initializeAppI18n('en');

    expect(formatRelativeTime('2026-06-12T11:59:00.000Z')).toBe('1 minute ago');
    expect(formatRelativeTime('2026-06-01T04:17:00.000Z')).toBe('1 week ago');
    expect(formatRelativeTime('2026-05-01T04:17:00.000Z')).toBe('1 month ago');
    expect(formatRelativeTime('2025-05-01T04:17:00.000Z')).toBe('1 year ago');
  });
});

describe('AnnotationDiscussionWindowApp', () => {
  it('shows the discussed highlight as a titled context block', async () => {
    installDesktopApi(article(annotation({ anchor: anchor('这是一段正在讨论的划线原文') })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    expect(await screen.findByText('正在讨论的划线')).toBeTruthy();
    expect(screen.getByText('这是一段正在讨论的划线原文')).toBeTruthy();
  });

  it('lets the native title bar truncate the full discussion title', async () => {
    const longQuote = '这是一段明显超过二十八个字符但窗口标题仍应该完整交给系统处理的划线';
    installDesktopApi(article(annotation({ anchor: anchor(longQuote) })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await waitFor(() => expect(document.title).toBe(`批注讨论 - ${longQuote}`));
    expect(document.title).not.toContain('...');
  });

  it('keeps reply counts in the idea list instead of the discussion header', async () => {
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await waitFor(() =>
      expect(
        document.querySelector('.annotation-discussion-idea-main small')?.textContent,
      ).toContain('1 条回复'),
    );
    expect(
      document.querySelector('.annotation-discussion-thread-actions')?.textContent,
    ).not.toContain('条回复');
  });

  it('renders the selected thought inline with the discussion stream', async () => {
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    expect(await screen.findByText('讨论展开')).toBeTruthy();
    expect(screen.queryByText('展开想法')).toBeNull();
    expect(screen.queryByText('收起想法')).toBeNull();
  });

  it('collapses and expands the thought sidebar manually', async () => {
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('讨论展开');
    const layout = discussionLayoutElement();
    expect(layout.classList.contains('is-ideas-collapsed')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '收起想法列表' }));

    expect(layout.classList.contains('is-ideas-collapsed')).toBe(true);
    expect(document.querySelector('.annotation-discussion-ideas-count')?.textContent).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: '展开想法列表' }));

    expect(layout.classList.contains('is-ideas-collapsed')).toBe(false);
    expect(document.querySelector('.annotation-discussion-idea-list')).toBeTruthy();
  });

  it('keeps add thought and sedimentation actions available when collapsed', async () => {
    const desktop = installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('讨论展开');
    fireEvent.click(screen.getByRole('button', { name: '收起想法列表' }));
    fireEvent.click(screen.getByRole('button', { name: '添加想法' }));

    expect(await screen.findByRole('dialog', { name: '添加想法' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭添加想法' }));
    fireEvent.click(screen.getByRole('button', { name: '把这些想法沉淀下来' }));

    expect(desktop.openAnnotationSedimentation).toHaveBeenCalledWith({
      articleId: 'article_1',
      annotationId: 'annotation_1',
      sourceRect: expect.objectContaining({
        height: expect.any(Number),
        width: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    });
  });

  it('auto-collapses the thought sidebar when the discussion layout is narrow', async () => {
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('讨论展开');
    expect(MockResizeObserver.instances).toHaveLength(1);

    act(() => MockResizeObserver.instances[0]?.trigger(720));

    await waitFor(() =>
      expect(discussionLayoutElement().classList.contains('is-ideas-auto-collapsed')).toBe(true),
    );
    expect(discussionLayoutElement().classList.contains('is-ideas-collapsed')).toBe(true);
    expect(discussionLayoutElement().classList.contains('is-ideas-content-collapsed')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '展开想法列表' }));

    expect(discussionLayoutElement().classList.contains('is-ideas-collapsed')).toBe(true);
    expect(discussionLayoutElement().classList.contains('is-ideas-overlay-open')).toBe(true);
    expect(discussionLayoutElement().classList.contains('is-ideas-content-collapsed')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /这是一条不会再被收起的想法/ }));

    expect(discussionLayoutElement().classList.contains('is-ideas-overlay-open')).toBe(false);
    expect(discussionLayoutElement().classList.contains('is-ideas-content-collapsed')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '展开想法列表' }));
    expect(discussionLayoutElement().classList.contains('is-ideas-overlay-open')).toBe(true);

    act(() => MockResizeObserver.instances[0]?.trigger(920));

    await waitFor(() =>
      expect(discussionLayoutElement().classList.contains('is-ideas-collapsed')).toBe(false),
    );
  });

  it('keeps manual collapse preference after a narrow overlay is opened', async () => {
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('讨论展开');
    fireEvent.click(screen.getByRole('button', { name: '收起想法列表' }));
    expect(discussionLayoutElement().classList.contains('is-ideas-collapsed')).toBe(true);

    act(() => MockResizeObserver.instances[0]?.trigger(720));
    fireEvent.click(screen.getByRole('button', { name: '展开想法列表' }));

    expect(discussionLayoutElement().classList.contains('is-ideas-overlay-open')).toBe(true);

    act(() => MockResizeObserver.instances[0]?.trigger(920));

    await waitFor(() =>
      expect(discussionLayoutElement().classList.contains('is-ideas-overlay-open')).toBe(false),
    );
    expect(discussionLayoutElement().classList.contains('is-ideas-collapsed')).toBe(true);
    expect(discussionLayoutElement().classList.contains('is-ideas-content-collapsed')).toBe(true);
  });

  it('keeps following the bottom after sending when the user has not scrolled up', async () => {
    const desktop = installDesktopApi(article(annotation({ comments: discussionComments() })));
    const scrollTo = vi.fn(function scrollToMock(
      this: HTMLElement,
      options?: ScrollToOptions | number,
    ) {
      this.scrollTop =
        typeof options === 'number'
          ? options
          : typeof options?.top === 'number'
            ? options.top
            : this.scrollTop;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const scrollElement = await discussionScrollElement();
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 600, writable: true },
    });
    fireEvent.scroll(scrollElement);
    scrollTo.mockClear();

    const replyInput = screen.getByPlaceholderText(/回复这条想法/);
    fireEvent.change(replyInput, {
      target: { value: '新的回复' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() => expect(desktop.saveArticleComment).toHaveBeenCalledOnce());
    expect(desktop.saveArticle).not.toHaveBeenCalled();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'auto' }));
    await waitFor(() => expect(document.activeElement).toBe(replyInput));
  });

  it('does not force-scroll after sending when the user has scrolled up', async () => {
    const desktop = installDesktopApi(article(annotation({ comments: discussionComments() })));
    const scrollTo = vi.fn(function scrollToMock(
      this: HTMLElement,
      options?: ScrollToOptions | number,
    ) {
      this.scrollTop =
        typeof options === 'number'
          ? options
          : typeof options?.top === 'number'
            ? options.top
            : this.scrollTop;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const scrollElement = await discussionScrollElement();
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 260, writable: true },
    });
    fireEvent.scroll(scrollElement);
    scrollTo.mockClear();

    fireEvent.change(screen.getByPlaceholderText(/回复这条想法/), {
      target: { value: '用户在看历史时发送的回复' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() => expect(desktop.saveArticleComment).toHaveBeenCalledOnce());
    expect(desktop.saveArticle).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('routes unmentioned replies to the assistant that created the root thought', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          comments: [
            aiComment({
              id: 'thought_ai',
              agentId: 'agent_1',
              agentNickname: '周现',
              agentUsername: 'zhou',
            }),
          ],
        }),
      ),
    );
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const replyInput = await screen.findByPlaceholderText(
      '回复这条助手想法；不 @ 时默认由 周现 回应，也可 @ 其他助手',
    );
    fireEvent.change(replyInput, { target: { value: '我同意这个方向' } });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() => expect(desktop.requestAgentCommentStream).toHaveBeenCalledOnce());
    expect(desktop.requestAgentCommentStream.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent_1',
      agentUsername: 'zhou',
      instruction: '我同意这个方向',
    });
  });

  it('keeps disabled root assistants hidden while allowing the automatic reply rule', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          comments: [
            aiComment({
              id: 'thought_ai',
              agentId: 'agent_2',
              agentNickname: '林知',
              agentUsername: 'lin',
            }),
          ],
        }),
      ),
      {
        agents: agents().concat(
          agent({ id: 'agent_2', nickname: '林知', username: 'lin', enabled: false }),
        ),
      },
    );
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const replyInput = await screen.findByPlaceholderText(
      '回复这条想法，输入 @助手 可邀请助手参与讨论',
    );
    fireEvent.change(replyInput, { target: { value: '继续说' } });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() => expect(desktop.requestAgentCommentStream).toHaveBeenCalledOnce());
    expect(desktop.requestAgentCommentStream.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent_2',
      agentUsername: 'lin',
      instruction: '继续说',
      allowDisabledAgentForRule: true,
    });
  });

  it('respects explicit mentions instead of adding the root assistant', async () => {
    const desktop = installDesktopApi(
      article(
        annotation({
          comments: [
            aiComment({
              id: 'thought_ai',
              agentId: 'agent_1',
              agentNickname: '周现',
              agentUsername: 'zhou',
            }),
          ],
        }),
      ),
      {
        agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
      },
    );
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    fireEvent.change(await screen.findByPlaceholderText(/默认由 周现 回应/), {
      target: { value: '@lin 你怎么看' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() => expect(desktop.requestAgentCommentStream).toHaveBeenCalledOnce());
    expect(desktop.requestAgentCommentStream.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent_2',
      agentUsername: 'lin',
      instruction: '你怎么看',
    });
  });

  it('shows active and queued assistant replies above the composer', async () => {
    const firstRequest = deferred<Comment>();
    const secondRequest = deferred<Comment>();
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })), {
      agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
      requestAgentCommentStream: vi.fn((payload) =>
        payload.agentUsername === 'zhou' ? firstRequest.promise : secondRequest.promise,
      ),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    fireEvent.change(await screen.findByPlaceholderText(/回复这条想法/), {
      target: { value: '@zhou @lin 你们分别回应一下' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    expect(await screen.findByRole('region', { name: '助手回复队列' })).toBeTruthy();
    expect(
      document.querySelector('.annotation-discussion-reply-agent-active [title="周现"]'),
    ).toBeTruthy();
    expect(screen.queryByText('周现 正在回复')).toBeNull();
    expect(document.querySelector('[title="林知"]')).toBeTruthy();
    expect(desktop.requestAgentCommentStream).toHaveBeenCalledOnce();

    await act(async () => {
      firstRequest.resolve(
        aiComment({ agentId: 'agent_1', agentNickname: '周现', agentUsername: 'zhou' }),
      );
      await firstRequest.promise;
    });

    await waitFor(() => expect(desktop.requestAgentCommentStream).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        document.querySelector(
          '.annotation-discussion-reply-agent-active-avatar.is-promoted[title="林知"]',
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('林知 正在回复')).toBeNull();

    await act(async () => {
      secondRequest.resolve(
        aiComment({ agentId: 'agent_2', agentNickname: '林知', agentUsername: 'lin' }),
      );
      await secondRequest.promise;
    });

    await waitFor(() => expect(screen.queryByRole('region', { name: '助手回复队列' })).toBeNull());
  });

  it('turns a failed assistant reply into a discussion message', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })), {
      requestAgentCommentStream: vi.fn(async () => {
        throw new Error('PROVIDER_API_KEY_REQUIRED');
      }),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    fireEvent.change(await screen.findByPlaceholderText(/回复这条想法/), {
      target: { value: '@zhou 你怎么看' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() =>
      expect(
        document.querySelector('.annotation-discussion-message.is-assistant')?.textContent,
      ).toContain('请先为供应商配置 API Key。'),
    );
    expect(screen.queryByRole('region', { name: '助手回复队列' })).toBeNull();
    expect(screen.queryByText('助手回复中')).toBeNull();
    expect(screen.queryByText('回复发送失败')).toBeNull();
    expect(desktop.saveArticleComment).toHaveBeenCalledTimes(2);
    expect(desktop.saveArticleComment.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        author: 'ai',
        content: '请先为供应商配置 API Key。',
        pending: false,
        replyTo: 'thought_1',
      }),
    );
  });

  it('keeps a reply-free thought at the top instead of scrolling to the bottom', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    installDesktopApi(article(annotation({ comments: [rootThought()] })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const scrollElement = await discussionScrollElement();
    await waitFor(() => expect(screen.getByText('当前没有讨论')).toBeTruthy());
    await flushAnimationFrames();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollElement.scrollTop).toBe(0);
  });

  it('scrolls to the latest reply when opening a thought that already has replies', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await discussionScrollElement();
    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' })),
    );
  });

  it('keeps an assistant-created reply-free thought at the top after success', async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });
    const desktop = installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' })),
    );
    scrollTo.mockClear();

    await openAssistantThoughtDialog('@zhou 补一条独立想法');

    await waitFor(() => expect(desktop.saveArticleComment).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '添加想法' })).toBeNull(), {
      timeout: 1800,
    });
    await waitFor(() => expect(screen.getAllByText('助手想法').length).toBeGreaterThan(0));
    await flushAnimationFrames();

    expect(screen.getByText('当前没有讨论')).toBeTruthy();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('does not render an empty composer status row before sending', async () => {
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await discussionScrollElement();
    expect(
      document.querySelector('.annotation-discussion-composer .floating-composer-status'),
    ).toBeNull();
  });

  it('starts assistant thought requests in parallel', async () => {
    const firstRequest = deferred<Comment>();
    const secondRequest = deferred<Comment>();
    const desktop = installDesktopApi(article(annotation()), {
      agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
      requestAgentCommentStream: vi.fn((payload) =>
        payload.agentUsername === 'zhou' ? firstRequest.promise : secondRequest.promise,
      ),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await openAssistantThoughtDialog('@zhou @lin 分别补一条想法');

    await waitFor(() => expect(desktop.requestAgentCommentStream).toHaveBeenCalledTimes(2));
    expect(
      desktop.requestAgentCommentStream.mock.calls.map((call) => call[0].agentUsername),
    ).toEqual(['zhou', 'lin']);
    firstRequest.resolve(aiComment({ agentUsername: 'zhou' }));
    secondRequest.resolve(aiComment({ agentUsername: 'lin' }));
  });

  it('keeps failed assistant thought runs open and retries only the failed agent', async () => {
    let linAttempts = 0;
    const desktop = installDesktopApi(article(annotation()), {
      agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
      requestAgentCommentStream: vi.fn(async (payload) => {
        if (payload.agentUsername === 'lin') linAttempts += 1;
        if (payload.agentUsername === 'lin' && linAttempts === 1) {
          throw new Error('模型暂时不可用');
        }
        return aiComment({
          agentId: payload.agentId,
          agentNickname: payload.agentUsername === 'lin' ? '林知' : '周现',
          agentUsername: payload.agentUsername,
          content: `${payload.agentUsername} 想法`,
        });
      }),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await openAssistantThoughtDialog('@zhou @lin 分别补一条想法');

    expect(await screen.findByText('1 位助手已完成，1 位助手失败')).toBeTruthy();
    expect(screen.getByText('模型暂时不可用')).toBeTruthy();
    expect(desktop.saveArticleComment).toHaveBeenCalledTimes(1);
    expect(desktop.saveArticle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(desktop.requestAgentCommentStream).toHaveBeenCalledTimes(3));
    expect(desktop.requestAgentCommentStream.mock.calls[2]?.[0].agentUsername).toBe('lin');
  });
});

describe('insertMentionAtSelection', () => {
  it('inserts a mention at the caret instead of appending it', () => {
    expect(insertMentionAtSelection('开头 结尾', 'zhou', 3, 3, null)).toEqual({
      content: '开头 @zhou 结尾',
      caretIndex: 9,
    });
  });

  it('replaces the selected text and keeps the caret after the inserted mention', () => {
    expect(insertMentionAtSelection('请 顾行简 看这里', 'zhou', 2, 5, null)).toEqual({
      content: '请 @zhou 看这里',
      caretIndex: 8,
    });
  });
});

describe('discussion reply targeting', () => {
  it('falls back to the root assistant by username when id is unavailable', () => {
    expect(
      replyTargetAgents(
        '继续说',
        aiComment({ agentId: undefined, agentUsername: 'zhou' }),
        publicAnnotationAgents(agents()),
      ).map((item) => item.username),
    ).toEqual(['zhou']);
  });

  it('keeps user-created thoughts passive until an assistant is mentioned', () => {
    const publicAgents = publicAnnotationAgents(agents());

    expect(replyTargetAgents('继续说', rootThought(), publicAgents)).toEqual([]);
    expect(discussionReplyPlaceholder(rootThought(), publicAgents)).toBe(
      '回复这条想法，输入 @助手 可邀请助手参与讨论',
    );
  });

  it('can target a disabled root assistant only when using the rule roster', () => {
    const disabledRoot = aiComment({
      agentId: 'agent_2',
      agentUsername: 'lin',
      agentNickname: '林知',
    });
    const roster = agents().concat(
      agent({ id: 'agent_2', nickname: '林知', username: 'lin', enabled: false }),
    );
    const visibleAgents = publicAnnotationAgents(roster);
    const ruleAgents = publicAnnotationAgents(roster, undefined, { includeDisabled: true });

    expect(replyTargetAgents('继续说', disabledRoot, visibleAgents)).toEqual([]);
    expect(
      replyTargetAgents('继续说', disabledRoot, ruleAgents).map((item) => item.username),
    ).toEqual(['lin']);
    expect(discussionReplyPlaceholder(disabledRoot, visibleAgents)).toBe(
      '回复这条想法，输入 @助手 可邀请助手参与讨论',
    );
  });
});

function installDesktopApi(
  sourceArticle: ArticleRecord,
  options: {
    agents?: Agent[];
    requestAgentCommentStream?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const desktop = {
    getArticle: vi.fn().mockResolvedValue(sourceArticle),
    getState: vi.fn().mockResolvedValue({ agents: options.agents || agents() }),
    planAgentMentionRoute: vi.fn(async (payload) => ({
      createUserThought: false,
      directives: payload.agents.map((mentionedAgent: Agent) => ({
        agentId: mentionedAgent.id,
        agentUsername: mentionedAgent.username,
        action: 'create_thought' as const,
      })),
    })),
    requestAgentCommentStream:
      options.requestAgentCommentStream ||
      vi.fn(async (payload) =>
        aiComment({
          agentId: payload.agentId,
          agentNickname: payload.agentUsername,
          agentUsername: payload.agentUsername,
        }),
      ),
    saveArticle: vi.fn().mockResolvedValue(undefined),
    saveArticleComment: vi.fn().mockResolvedValue(undefined),
    openAnnotationSedimentation: vi.fn().mockResolvedValue(undefined),
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });
  return desktop;
}

function discussionLayoutElement() {
  const element = document.querySelector<HTMLElement>('.annotation-discussion-layout');
  if (!element) throw new Error('Expected discussion layout');
  return element;
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe = vi.fn();

  disconnect = vi.fn();

  unobserve = vi.fn();

  trigger(width: number) {
    this.callback(
      [
        {
          contentRect: { width },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
}

async function openAssistantThoughtDialog(value: string) {
  await screen.findByText('正在讨论的划线');
  fireEvent.click(screen.getByRole('button', { name: '添加想法' }));
  fireEvent.click(screen.getByRole('tab', { name: '让助手来' }));
  fireEvent.change(screen.getByPlaceholderText('告诉助手要写什么想法...'), {
    target: { value },
  });
  fireEvent.click(screen.getByRole('button', { name: '添加' }));
}

async function flushAnimationFrames() {
  await act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

function openDiscussionRoute() {
  window.history.replaceState({}, '', '/?articleId=article_1&annotationId=annotation_1');
}

async function discussionScrollElement() {
  let scrollElement: HTMLElement | undefined;
  await waitFor(() => {
    const element = document.querySelector<HTMLElement>('.annotation-discussion-thread-scroll');
    expect(element).toBeTruthy();
    scrollElement = element || undefined;
  });
  if (!scrollElement) throw new Error('Expected discussion scroll container');
  return scrollElement;
}

function article(sourceAnnotation: Annotation): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '测试文章',
    byline: '作者',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [sourceAnnotation],
    createdAt: now,
    updatedAt: now,
  };
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: anchor('值得讨论的一段划线'),
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function anchor(exact: string): Annotation['anchor'] {
  return {
    exact,
    prefix: '',
    suffix: '',
    start: 0,
    end: exact.length,
  };
}

function rootThought(): Comment {
  return {
    id: 'thought_1',
    author: 'user',
    content: '这是一条很长的想法'.repeat(20),
    createdAt: now,
  };
}

function discussionComments(): Comment[] {
  return [
    {
      id: 'thought_1',
      author: 'user',
      content: '这是一条不会再被收起的想法',
      createdAt: now,
    },
    {
      id: 'reply_1',
      author: 'ai',
      content: '这是第一条回复',
      createdAt: '2026-05-31T06:01:00.000Z',
      replyTo: 'thought_1',
      agentId: 'agent_1',
      agentUsername: 'zhou',
      agentNickname: '周现',
      agentAvatar: '',
    },
  ];
}

function agents(): Agent[] {
  return [agent()];
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    providerId: 'provider_1',
    nickname: '周现',
    username: 'zhou',
    avatar: '',
    annotationColor: '#f4c95d',
    annotationDensity: 'medium',
    temperature: 0.5,
    soul: '',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function aiComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: `comment_${overrides.agentUsername || 'ai'}`,
    author: 'ai',
    content: '助手想法',
    createdAt: now,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
