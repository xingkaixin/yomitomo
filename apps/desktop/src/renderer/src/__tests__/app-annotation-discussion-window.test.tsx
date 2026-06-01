// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agent, Annotation, ArticleRecord, Comment } from '@yomitomo/shared';
import {
  AnnotationDiscussionWindowApp,
  insertMentionAtSelection,
} from '../app-annotation-discussion-window';

const now = '2026-05-31T06:00:00.000Z';

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
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

    await waitFor(() => expect(desktop.saveArticle).toHaveBeenCalledOnce());
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

    await waitFor(() => expect(desktop.saveArticle).toHaveBeenCalledOnce());
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
    expect(desktop.saveArticle).toHaveBeenCalledTimes(1);

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
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });
  return desktop;
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
