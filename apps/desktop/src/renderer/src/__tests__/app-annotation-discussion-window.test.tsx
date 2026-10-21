// @vitest-environment jsdom

import React from 'react';
import i18next from 'i18next';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Agent,
  Annotation,
  ArticleRecord,
  ArticleStorePatch,
  AssistantDeliveryRequest,
  AssistantRunEvent,
  Comment,
} from '@yomitomo/shared';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../../ipc-errors';
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
import { emptyStore } from '../settings/app-settings';
import { appToast } from '../shell/app-toast';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
  stopAppSoundEffect: vi.fn(),
}));

const now = '2026-05-31T06:00:00.000Z';

beforeEach(() => {
  initializeAppI18n('zh-CN');
  vi.spyOn(appToast, 'warning');
  vi.spyOn(appToast, 'error');
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  act(() => appToast.dismiss());
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
  it('receives an early thought draft after subscribing and saves only through the composer', async () => {
    const desktop = installDesktopApi(article(annotation()));
    desktop.consumeThoughtDraft.mockResolvedValueOnce('从书库回答带来的想法');
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const thoughtInput = (await screen.findByRole('textbox', {
      name: '想法内容',
    })) as HTMLTextAreaElement;
    expect(thoughtInput.value).toBe('从书库回答带来的想法');
    expect(screen.getByRole('tab', { name: '自己写' }).getAttribute('aria-selected')).toBe('true');
    expect(desktop.onThoughtDraftAvailable.mock.invocationCallOrder[0]).toBeLessThan(
      desktop.consumeThoughtDraft.mock.invocationCallOrder[0],
    );
    expect(desktop.saveArticleComment).not.toHaveBeenCalled();
    expect(desktop.saveArticle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() =>
      expect(desktop.saveArticleComment).toHaveBeenCalledWith(
        expect.objectContaining({
          articleId: 'article_1',
          annotationId: 'annotation_1',
          comment: expect.objectContaining({ content: '从书库回答带来的想法' }),
        }),
      ),
    );
    expect(desktop.saveArticle).not.toHaveBeenCalled();
  });

  it('receives a new thought draft when an existing window is notified', async () => {
    const desktop = installDesktopApi(article(annotation()));
    openDiscussionRoute();
    render(<AnnotationDiscussionWindowApp />);
    await screen.findByText('正在讨论的划线');
    await waitFor(() => expect(desktop.consumeThoughtDraft).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog', { name: '添加想法' })).toBeNull();

    desktop.consumeThoughtDraft.mockResolvedValueOnce('复用窗口收到的新想法');
    act(() => desktop.notifyThoughtDraftAvailable());

    const thoughtInput = (await screen.findByRole('textbox', {
      name: '想法内容',
    })) as HTMLTextAreaElement;
    expect(thoughtInput.value).toBe('复用窗口收到的新想法');
    expect(desktop.consumeThoughtDraft).toHaveBeenCalledTimes(2);
    expect(desktop.onThoughtDraftAvailable).toHaveBeenCalledOnce();
    expect(desktop.saveArticleComment).not.toHaveBeenCalled();
  });

  it('keeps the first draft when two consumed drafts arrive in one render batch', async () => {
    const firstDraft = deferred<string | null>();
    const secondDraft = deferred<string | null>();
    const desktop = installDesktopApi(article(annotation()));
    desktop.consumeThoughtDraft
      .mockReturnValueOnce(firstDraft.promise)
      .mockReturnValueOnce(secondDraft.promise);
    openDiscussionRoute();
    render(<AnnotationDiscussionWindowApp />);
    await screen.findByText('正在讨论的划线');
    await waitFor(() => expect(desktop.consumeThoughtDraft).toHaveBeenCalledOnce());
    act(() => desktop.notifyThoughtDraftAvailable());
    expect(desktop.consumeThoughtDraft).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstDraft.resolve('先收到的想法');
      secondDraft.resolve('后收到的想法');
    });

    const thoughtInput = screen.getByRole('textbox', { name: '想法内容' }) as HTMLTextAreaElement;
    expect(thoughtInput.value).toBe('先收到的想法');
    expect(appToast.warning).toHaveBeenCalledWith(
      i18next.t('readingMemory.library.thought.draftBusy'),
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭添加想法' }));
    desktop.consumeThoughtDraft.mockResolvedValueOnce('清空编辑器后收到的想法');
    act(() => desktop.notifyThoughtDraftAvailable());

    const nextThoughtInput = await screen.findByRole<HTMLTextAreaElement>('textbox', {
      name: '想法内容',
    });
    expect(nextThoughtInput.value).toBe('清空编辑器后收到的想法');
  });

  it('does not overwrite text entered while a thought draft is being consumed', async () => {
    const pendingDraft = deferred<string | null>();
    const desktop = installDesktopApi(article(annotation()));
    desktop.consumeThoughtDraft.mockReturnValueOnce(pendingDraft.promise);
    openDiscussionRoute();
    render(<AnnotationDiscussionWindowApp />);
    await screen.findByText('正在讨论的划线');
    fireEvent.click(screen.getByRole('button', { name: '添加想法' }));
    const thoughtInput = screen.getByRole('textbox', { name: '想法内容' }) as HTMLTextAreaElement;
    fireEvent.change(thoughtInput, { target: { value: '我正在编辑的想法' } });

    await act(async () => pendingDraft.resolve('迟到的书库想法'));

    expect(thoughtInput.value).toBe('我正在编辑的想法');
    expect(appToast.warning).toHaveBeenCalledWith(
      i18next.t('readingMemory.library.thought.draftBusy'),
    );
    expect(desktop.consumeThoughtDraft).toHaveBeenCalledOnce();
    expect(desktop.onThoughtDraftAvailable).toHaveBeenCalledOnce();
    expect(desktop.saveArticleComment).not.toHaveBeenCalled();
    const feedback = await screen.findByText(i18next.t('readingMemory.library.thought.draftBusy'), {
      selector: 'span',
    });
    expect(screen.getAllByRole('alert')).toContain(feedback.closest('[role="alert"]'));
  });

  it('keeps the current thought while its save is pending', async () => {
    const pendingSave = deferred<void>();
    const desktop = installDesktopApi(article(annotation()));
    desktop.saveArticleComment.mockReturnValueOnce(pendingSave.promise);
    openDiscussionRoute();
    render(<AnnotationDiscussionWindowApp />);
    await screen.findByText('正在讨论的划线');
    fireEvent.click(screen.getByRole('button', { name: '添加想法' }));
    const thoughtInput = screen.getByRole('textbox', { name: '想法内容' }) as HTMLTextAreaElement;
    fireEvent.change(thoughtInput, { target: { value: '正在保存的想法' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    desktop.consumeThoughtDraft.mockResolvedValueOnce('不应替换保存中的想法');

    act(() => desktop.notifyThoughtDraftAvailable());

    await waitFor(() => expect(appToast.warning).toHaveBeenCalledOnce());
    expect(thoughtInput.value).toBe('正在保存的想法');
    expect(thoughtInput.disabled).toBe(true);
    expect(desktop.saveArticleComment).toHaveBeenCalledOnce();
    await act(async () => pendingSave.resolve());
  });

  it('does not open a new thought while an assistant reply is being sent', async () => {
    const pendingDelivery = deferred<{ runKey: string | null }>();
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })), {
      deliver: vi.fn(() => pendingDelivery.promise),
    });
    openDiscussionRoute();
    render(<AnnotationDiscussionWindowApp />);
    const replyInput = await screen.findByPlaceholderText(/回复这条想法/);
    fireEvent.change(replyInput, { target: { value: '@zhou 继续展开' } });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));
    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    desktop.consumeThoughtDraft.mockResolvedValueOnce('等待助手完成后再添加');

    act(() => desktop.notifyThoughtDraftAvailable());

    await waitFor(() => expect(appToast.warning).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog', { name: '添加想法' })).toBeNull();
    await act(async () => pendingDelivery.resolve({ runKey: null }));
  });

  it('ignores a thought draft that arrives after the window is unmounted', async () => {
    const pendingDraft = deferred<string | null>();
    const desktop = installDesktopApi(article(annotation()));
    desktop.consumeThoughtDraft.mockReturnValueOnce(pendingDraft.promise);
    openDiscussionRoute();
    const view = render(<AnnotationDiscussionWindowApp />);
    await screen.findByText('正在讨论的划线');

    view.unmount();
    await act(async () => pendingDraft.resolve('已经关闭的窗口不再接收'));

    expect(desktop.unsubscribeThoughtDraft).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: '添加想法' })).toBeNull();
    expect(appToast.warning).not.toHaveBeenCalled();
    expect(appToast.error).not.toHaveBeenCalled();
    expect(desktop.saveArticleComment).not.toHaveBeenCalled();
  });

  it('reports a thought draft consumption failure without opening the composer', async () => {
    const error = new Error('draft unavailable');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const desktop = installDesktopApi(article(annotation()));
    desktop.consumeThoughtDraft.mockRejectedValueOnce(error);
    openDiscussionRoute();
    render(<AnnotationDiscussionWindowApp />);

    await waitFor(() =>
      expect(appToast.error).toHaveBeenCalledWith(
        i18next.t('readingMemory.library.thought.draftLoadFailed'),
      ),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[annotation-discussion] thought draft loading failed',
      expect.objectContaining({ error }),
    );
    const feedback = await screen.findByText(
      i18next.t('readingMemory.library.thought.draftLoadFailed'),
      { selector: 'span' },
    );
    expect(screen.getAllByRole('alert')).toContain(feedback.closest('[role="alert"]'));
    expect(screen.queryByRole('dialog', { name: '添加想法' })).toBeNull();
    expect(desktop.saveArticleComment).not.toHaveBeenCalled();
  });

  it('shows the discussed highlight as a titled context block', async () => {
    installDesktopApi(article(annotation({ anchor: anchor('这是一段正在讨论的划线原文') })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    expect(await screen.findByText('正在讨论的划线')).toBeTruthy();
    expect(screen.getByText('这是一段正在讨论的划线原文')).toBeTruthy();
  });

  it('renders the selected thought inline with the discussion stream', async () => {
    installDesktopApi(article(annotation({ comments: discussionComments() })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    expect(await screen.findByText('讨论展开')).toBeTruthy();
    expect(screen.queryByText('展开想法')).toBeNull();
    expect(screen.queryByText('收起想法')).toBeNull();
  });

  it('derives the removed screen from the window status after deletion', async () => {
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })));
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('正在讨论的划线');
    desktop.getArticle.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: '更多想法操作' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除这条想法和它的回复' }));
    fireEvent.click(screen.getByRole('button', { name: '删除想法' }));

    expect(await screen.findByText('这条批注已删除')).toBeTruthy();
    expect(desktop.deleteArticleComment).toHaveBeenCalledOnce();
  });

  it('keeps the discussion open and reports comment deletion failures', async () => {
    const deleteError = new Error('delete failed');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })));
    desktop.deleteArticleComment.mockRejectedValueOnce(deleteError);
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('正在讨论的划线');
    fireEvent.click(screen.getByRole('button', { name: '更多想法操作' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除这条想法和它的回复' }));
    fireEvent.click(screen.getByRole('button', { name: '删除想法' }));

    expect(await screen.findByText('delete failed')).toBeTruthy();
    expect(screen.queryByText('这条批注已删除')).toBeNull();
    expect(document.querySelector('.annotation-discussion-ideas-count')?.textContent).toBe('1');
    expect(warnSpy).toHaveBeenCalledWith(
      '[annotation-discussion] comment deletion failed',
      expect.objectContaining({
        articleId: 'article_1',
        annotationId: 'annotation_1',
        commentId: 'thought_1',
        error: deleteError,
      }),
    );
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

  it('restores a reply draft without rendering an unsaved comment', async () => {
    const saveError = new Error('save failed');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })));
    desktop.saveArticleComment.mockRejectedValueOnce(saveError);
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    const replyInput = await screen.findByPlaceholderText(/回复这条想法/);
    fireEvent.change(replyInput, { target: { value: '未保存的回复' } });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    expect(await screen.findByText('save failed')).toBeTruthy();
    expect((replyInput as HTMLTextAreaElement).value).toBe('未保存的回复');
    expect(
      document.querySelector('.annotation-discussion-thread-scroll')?.textContent,
    ).not.toContain('未保存的回复');
    expect(warnSpy).toHaveBeenCalledWith(
      '[annotation-discussion] reply submission failed',
      expect.objectContaining({
        articleId: 'article_1',
        annotationId: 'annotation_1',
        error: saveError,
      }),
    );
  });

  it('keeps a new thought draft without rendering unsaved content', async () => {
    const saveError = new Error('save failed');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })));
    desktop.saveArticleComment.mockRejectedValueOnce(saveError);
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await screen.findByText('正在讨论的划线');
    fireEvent.click(screen.getByRole('button', { name: '添加想法' }));
    const thoughtInput = screen.getByRole('textbox', { name: '想法内容' });
    fireEvent.change(thoughtInput, { target: { value: '未保存的新想法' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    expect(await screen.findByText('save failed')).toBeTruthy();
    expect((thoughtInput as HTMLTextAreaElement).value).toBe('未保存的新想法');
    expect(document.querySelector('.annotation-discussion-idea-list')?.textContent).not.toContain(
      '未保存的新想法',
    );
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

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    expect(desktop.deliver.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent_1',
      channel: { kind: 'thread', annotationId: 'annotation_1', threadId: 'thought_ai' },
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

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    expect(desktop.deliver.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent_2',
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

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    expect(desktop.deliver.mock.calls[0]?.[0]).toMatchObject({
      agentId: 'agent_2',
      instruction: '你怎么看',
    });
  });

  it('shows a streaming placeholder for each assistant replying in parallel', async () => {
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })), {
      agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
      deliver: vi.fn(async (request: AssistantDeliveryRequest) => ({
        runKey: `run_${request.agentId}`,
      })),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    fireEvent.change(await screen.findByPlaceholderText(/回复这条想法/), {
      target: { value: '@zhou @lin 你们分别回应一下' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledTimes(2));
    const [zhouRequest, linRequest] = desktop.deliver.mock.calls.map(
      (call) => call[0] as AssistantDeliveryRequest,
    );
    desktop.emitRun(runEvent(zhouRequest, 'run_agent_1', { text: '第一份草稿' }));
    desktop.emitRun(runEvent(linRequest, 'run_agent_2', { text: '第二份草稿' }));

    expect(await screen.findByText('第一份草稿')).toBeTruthy();
    expect(screen.getByText('第二份草稿')).toBeTruthy();
    expect(document.querySelectorAll('.annotation-discussion-message.is-pending')).toHaveLength(2);

    desktop.emitRun(runEvent(zhouRequest, 'run_agent_1', { status: 'failed', text: '' }));

    await waitFor(() => expect(screen.queryByText('第一份草稿')).toBeNull());
    expect(screen.getByText('第二份草稿')).toBeTruthy();
    expect(await screen.findByText('回复发送失败')).toBeTruthy();
  });

  it('keeps the placeholder until the finished reply reaches the window', async () => {
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })), {
      deliver: vi.fn(async () => ({ runKey: 'run_agent_1' })),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    fireEvent.change(await screen.findByPlaceholderText(/回复这条想法/), {
      target: { value: '@zhou 请继续' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));
    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
    const request = desktop.deliver.mock.calls[0]?.[0] as AssistantDeliveryRequest;

    desktop.emitRun(runEvent(request, 'run_agent_1', { text: '完整的回复' }));
    desktop.emitRun(
      runEvent(request, 'run_agent_1', {
        status: 'done',
        text: '完整的回复',
        commentId: 'comment_reply',
      }),
    );
    expect(screen.getByText('完整的回复')).toBeTruthy();

    await desktop.saveAgentComment(
      'annotation_1',
      aiComment({ id: 'comment_reply', content: '完整的回复', replyTo: 'thought_1' }),
    );

    await waitFor(() =>
      expect(document.querySelector('.annotation-discussion-message.is-pending')).toBeNull(),
    );
    expect(screen.getAllByText('完整的回复')).toHaveLength(1);
  });

  it('reports a delivery that cannot start', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const desktop = installDesktopApi(article(annotation({ comments: [rootThought()] })), {
      deliver: vi.fn(async () => {
        throw new DesktopIpcError(desktopIpcErrorCodes.providerApiKeyRequired);
      }),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    fireEvent.change(await screen.findByPlaceholderText(/回复这条想法/), {
      target: { value: '@zhou 你怎么看' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    expect(await screen.findByText('请先为供应商配置 API Key。')).toBeTruthy();
    expect(desktop.saveArticleComment).toHaveBeenCalledOnce();
    expect(document.querySelector('.annotation-discussion-message.is-assistant')).toBeNull();
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

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledOnce());
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
    const desktop = installDesktopApi(article(annotation()), {
      agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
      deliver: vi.fn(async () => ({ runKey: null })),
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await openAssistantThoughtDialog('@zhou @lin 分别补一条想法');

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledTimes(2));
    expect(desktop.deliver.mock.calls.map((call) => call[0])).toEqual([
      expect.objectContaining({
        agentId: 'agent_1',
        channel: { kind: 'annotation', annotationId: 'annotation_1' },
      }),
      expect.objectContaining({ agentId: 'agent_2' }),
    ]);
  });

  it('keeps failed assistant thought runs open and retries only the failed agent', async () => {
    let linAttempts = 0;
    const desktop = installDesktopApi(article(annotation()), {
      agents: agents().concat(agent({ id: 'agent_2', nickname: '林知', username: 'lin' })),
    });
    desktop.deliver.mockImplementation(async (request: AssistantDeliveryRequest) => {
      if (request.agentId === 'agent_2') linAttempts += 1;
      if (request.agentId === 'agent_2' && linAttempts === 1) {
        throw new Error('模型暂时不可用');
      }
      return desktop.finishSoon(request);
    });
    openDiscussionRoute();

    render(<AnnotationDiscussionWindowApp />);

    await openAssistantThoughtDialog('@zhou @lin 分别补一条想法');

    expect(await screen.findByText('1 位助手已完成，1 位助手失败')).toBeTruthy();
    expect(screen.getByText('模型暂时不可用')).toBeTruthy();
    expect(desktop.saveArticleComment).not.toHaveBeenCalled();
    expect(desktop.saveArticle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => expect(desktop.deliver).toHaveBeenCalledTimes(3));
    expect(desktop.deliver.mock.calls[2]?.[0].agentId).toBe('agent_2');
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
  it('falls back to the root assistant by username when id does not match', () => {
    expect(
      replyTargetAgents(
        '继续说',
        aiComment({ agentId: 'missing-agent', agentUsername: 'zhou' }),
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
    deliver?: ReturnType<typeof vi.fn>;
  } = {},
) {
  let currentArticle = sourceArticle;
  let thoughtDraftListener: (() => void) | undefined;
  const runListeners = new Set<(event: AssistantRunEvent) => void>();
  let patchListener: ((patch: ArticleStorePatch) => void) | undefined;
  const unsubscribeThoughtDraft = vi.fn(() => {
    thoughtDraftListener = undefined;
  });
  // Mirrors main: the comment is saved and broadcast before the run reports done.
  const saveAgentComment = async (annotationId: string, comment: Comment) => {
    currentArticle = {
      ...currentArticle,
      annotations: currentArticle.annotations.map((item) =>
        item.id === annotationId ? { ...item, comments: [...item.comments, comment] } : item,
      ),
    };
    const patch = {
      type: 'article-upsert',
      article: currentArticle,
    } as unknown as ArticleStorePatch;
    await act(async () => patchListener?.(patch));
  };
  const finishSoon = (request: AssistantDeliveryRequest) => {
    const runKey = `run_${request.agentId}_${request.triggerId}`;
    setTimeout(() => {
      const comment = aiComment({
        id: `${runKey}_comment`,
        agentId: request.agentId,
        ...(request.channel.kind === 'thread' ? { replyTo: request.channel.threadId } : {}),
      });
      if (request.channel.kind === 'chat') return;
      void saveAgentComment(request.channel.annotationId, comment).then(() =>
        emitRun(
          runEvent(request, runKey, {
            status: 'done',
            text: comment.content,
            commentId: comment.id,
          }),
        ),
      );
    });
    return { runKey };
  };
  const emitRun = (event: AssistantRunEvent) =>
    act(() => {
      for (const listener of runListeners) listener(event);
    });
  const desktop = {
    getArticle: vi.fn(async (): Promise<ArticleRecord | null> => currentArticle),
    getState: vi.fn().mockResolvedValue({
      ...emptyStore,
      agents: options.agents || agents(),
    }),
    planAgentMentionRoute: vi.fn(async (payload) => ({
      createUserThought: false,
      directives: payload.agents.map((mentionedAgent: Agent) => ({
        agentId: mentionedAgent.id,
        agentUsername: mentionedAgent.username,
        action: 'create_thought' as const,
      })),
    })),
    deliver:
      options.deliver || vi.fn(async (request: AssistantDeliveryRequest) => finishSoon(request)),
    emitRun,
    finishSoon,
    saveAgentComment,
    deleteArticleComment: vi.fn().mockResolvedValue(undefined),
    saveArticle: vi.fn().mockResolvedValue(undefined),
    saveArticleComment: vi.fn().mockResolvedValue(undefined),
    openAnnotationSedimentation: vi.fn().mockResolvedValue(undefined),
    consumeThoughtDraft: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
    onThoughtDraftAvailable: vi.fn((callback: () => void) => {
      thoughtDraftListener = callback;
      return unsubscribeThoughtDraft;
    }),
    notifyThoughtDraftAvailable: () => thoughtDraftListener?.(),
    unsubscribeThoughtDraft,
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      platform: 'darwin',
      agent: {
        planMentionRoute: desktop.planAgentMentionRoute,
      },
      assistant: {
        deliver: desktop.deliver,
        runs: vi.fn().mockResolvedValue([]),
        onRun: (callback: (event: AssistantRunEvent) => void) => {
          runListeners.add(callback);
          return () => runListeners.delete(callback);
        },
      },
      annotations: {
        discussion: {
          consumeThoughtDraft: desktop.consumeThoughtDraft,
          onThoughtDraftAvailable: desktop.onThoughtDraftAvailable,
        },
        sedimentation: {
          open: desktop.openAnnotationSedimentation,
        },
      },
      article: {
        deleteComment: desktop.deleteArticleComment,
        get: desktop.getArticle,
        saveComment: desktop.saveArticleComment,
        onPatched: (callback: (patch: ArticleStorePatch) => void) => {
          patchListener = callback;
          return () => {
            patchListener = undefined;
          };
        },
      },
      store: {
        getState: desktop.getState,
      },
    },
  });
  return desktop;
}

function runEvent(
  request: AssistantDeliveryRequest,
  runKey: string,
  overrides: Partial<AssistantRunEvent> = {},
): AssistantRunEvent {
  return {
    runKey,
    articleId: request.articleId,
    agentId: request.agentId,
    channel: request.channel,
    status: 'running',
    text: '',
    ...overrides,
  };
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
      this,
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
    author: { kind: 'user', username: 'reader' },
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
    author: { kind: 'user', username: 'reader' },
    content: '这是一条很长的想法'.repeat(20),
    createdAt: now,
  };
}

function discussionComments(): Comment[] {
  return [
    {
      id: 'thought_1',
      author: { kind: 'user', username: 'reader' },
      content: '这是一条不会再被收起的想法',
      createdAt: now,
    },
    {
      id: 'reply_1',
      author: {
        kind: 'agent',
        agentId: 'agent_1',
        username: 'zhou',
        nickname: '周现',
        avatar: '',
      },
      content: '这是第一条回复',
      createdAt: '2026-05-31T06:01:00.000Z',
      replyTo: 'thought_1',
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

type AiCommentOverrides = Omit<Partial<Comment>, 'author'> & {
  agentId?: string;
  agentUsername?: string;
  agentNickname?: string;
  agentAvatar?: string;
};

function aiComment(overrides: AiCommentOverrides = {}): Comment {
  const {
    agentId = 'agent_1',
    agentUsername = 'assistant',
    agentNickname,
    agentAvatar,
    ...commentOverrides
  } = overrides;
  return {
    id: `comment_${agentUsername}`,
    author: {
      kind: 'agent',
      agentId,
      username: agentUsername,
      nickname: agentNickname,
      avatar: agentAvatar,
    },
    content: '助手想法',
    createdAt: now,
    ...commentOverrides,
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
