// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import { SelectionMenu } from './reader-selection-menu';
import { Composer, measureComposerPosition } from './reader-composer';
import { ReaderChatPanel } from './reader-chat-panel';
import { ReaderFloatingToolbar, ReaderToolbar } from './reader-toolbar';
import { ReaderTocPanel } from './reader-toc-panel';
import { defaultReaderUiLabels } from './reader-app-view-types';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function agent(id: string, nickname: string): PublicAgent {
  return {
    id,
    kind: 'annotation',
    enabled: true,
    nickname,
    username: id,
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: nickname,
    temperature: 0.3,
  };
}

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation-1',
    anchor: {
      exact: '需要批注的原文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 7,
    },
    author: 'user',
    annotationType: 'key_point',
    color: userProfile.annotationColor,
    userId: userProfile.id,
    userUsername: userProfile.username,
    userNickname: userProfile.nickname,
    comments: [
      {
        id: 'comment-1',
        author: 'user',
        content: '这是一段足够长的批注正文。'.repeat(12),
        createdAt: now,
        userId: userProfile.id,
        userUsername: userProfile.username,
        userNickname: userProfile.nickname,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Composer shortcut labels', () => {
  it('keeps cancel and submit shortcuts out of visible button labels', () => {
    const { container } = render(
      <Composer
        agents={[agent('agent_1', '林知微')]}
        composer={{ x: 0, y: 0 }}
        messageSendShortcut="enter"
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const cancelButton = screen.getByRole('button', { name: '取消' });
    const highlightButton = screen.getByRole('button', { name: '划线' });

    expect(cancelButton.textContent).toBe('取消');
    expect(highlightButton.textContent).toBe('划线');
    expect(cancelButton.querySelector('.reader-kbd')).toBeNull();
    expect(highlightButton.querySelector('.reader-kbd')).toBeNull();
    expect(container.querySelector('.reader-tooltip-content')).toBeNull();
  });

  it('switches the submit label to publish after text input', () => {
    render(
      <Composer
        agents={[agent('agent_1', '林知微')]}
        composer={{ x: 0, y: 0 }}
        messageSendShortcut="enter"
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('想法内容'), { target: { value: '  我的想法  ' } });

    expect(screen.getByRole('button', { name: '发布' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '划线' })).toBeNull();
  });

  it('places the composer above the selection when bottom space is insufficient', () => {
    const canvas = document.createElement('div');
    const surface = document.createElement('div');
    const composerElement = document.createElement('div');

    surface.className = 'reader-surface';
    Object.defineProperty(surface, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(surface, 'clientHeight', { configurable: true, value: 360 });
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 720 });
    Object.defineProperty(canvas, 'offsetTop', { configurable: true, value: 0 });
    Object.defineProperty(composerElement, 'offsetWidth', { configurable: true, value: 520 });
    Object.defineProperty(composerElement, 'offsetHeight', { configurable: true, value: 220 });

    surface.append(canvas);
    canvas.append(composerElement);

    expect(measureComposerPosition({ x: 180, y: 330 }, composerElement)).toMatchObject({
      left: 180,
      placement: 'above',
      top: 100,
    });
  });

  it('keeps the composer inside the visible reader viewport', () => {
    const canvas = document.createElement('div');
    const surface = document.createElement('div');
    const composerElement = document.createElement('div');

    surface.className = 'reader-surface';
    Object.defineProperty(surface, 'scrollTop', { configurable: true, value: 140 });
    Object.defineProperty(surface, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 460 });
    Object.defineProperty(canvas, 'offsetTop', { configurable: true, value: 40 });
    Object.defineProperty(composerElement, 'offsetWidth', { configurable: true, value: 420 });
    Object.defineProperty(composerElement, 'offsetHeight', { configurable: true, value: 220 });

    surface.append(canvas);
    canvas.append(composerElement);

    expect(measureComposerPosition({ x: 440, y: 430 }, composerElement)).toMatchObject({
      left: 28,
      placement: 'above',
      top: 168,
    });
  });
});

describe('ReaderChatPanel', () => {
  it('uses avatar assistant selection and keeps quoted context inside the composer', () => {
    const agents = [agent('agent_1', '林知微'), agent('agent_2', '周砚')];

    const { container } = render(
      <ReaderChatPanel
        agents={agents}
        draftContext={{
          sourceType: 'web',
          quote: '这是划线引用',
          title: '文章',
        }}
        messageSendShortcut="enter"
        open
        selectedAssistantId="agent_2"
        shortcutModifier="⌘"
        state={{
          articleId: 'article_1',
          activeSessionId: 'session_1',
          selectedAssistantId: 'agent_2',
          sessions: [
            {
              id: 'session_1',
              articleId: 'article_1',
              createdAt: now,
              updatedAt: now,
              messages: [
                {
                  id: 'message_1',
                  role: 'assistant',
                  assistantId: 'agent_2',
                  content: '回答内容',
                  createdAt: now,
                },
              ],
            },
          ],
          createdAt: now,
          updatedAt: now,
        }}
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(container.querySelector('.reader-chat-composer .reader-chat-context')).toBeTruthy();
    expect(screen.getByText('这是划线引用')).toBeTruthy();
    expect(
      container.querySelectorAll('.reader-chat-agent-tray .reader-agent-avatar-stack-item'),
    ).toHaveLength(2);
    expect(
      container.querySelector('.reader-chat-agent-tray .reader-agent-avatar-stack-item.is-active'),
    ).toBeTruthy();
    expect(screen.getAllByText('周砚')).toHaveLength(1);
    expect(container.querySelector('.reader-chat-agent-tray')?.textContent).not.toContain('周砚');
    expect(screen.getByText('回答内容')).toBeTruthy();
    expect(container.querySelector('.reader-chat-message time')).toBeTruthy();
  });
});

describe('AnnotationCard', () => {
  it('summarizes thoughts without rendering the inline discussion', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation()}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded={false}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('1 条想法')).toBeTruthy();
    expect(container.querySelector('.reader-note.has-discussion')).toBeTruthy();
    expect(container.querySelector('.reader-note-quote-badge')).toBeTruthy();
    expect(container.querySelector('.reader-note-left-line')).toBeTruthy();
    expect(screen.getByRole('button', { name: '进入讨论区' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '添加想法' })).toBeNull();
    expect(screen.queryByRole('button', { name: '回复' })).toBeNull();
    expect(screen.queryByText('@kevin')).toBeNull();
    expect(screen.queryByLabelText('留言内容')).toBeNull();
  });

  it('opens the discussion entry through an optional callback', () => {
    const onFocus = vi.fn();
    const onOpenDiscussion = vi.fn();

    render(
      <AnnotationCard
        active={false}
        agents={[]}
        annotation={annotation()}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded={false}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={onFocus}
        onOpenDiscussion={onOpenDiscussion}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '进入讨论区' }));

    expect(onFocus).toHaveBeenCalledWith('annotation-1');
    expect(onOpenDiscussion).toHaveBeenCalledWith(
      'annotation-1',
      expect.objectContaining({
        height: expect.any(Number),
        width: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
  });

  it('shows participating assistant summary from thoughts, replies and pending work', () => {
    const baseComment = annotation().comments[0];

    render(
      <AnnotationCard
        active
        agents={[agent('agent-1', '林知微'), agent('agent-2', '周砚')]}
        annotation={annotation({
          comments: [
            baseComment,
            {
              ...baseComment,
              id: 'comment-agent-1',
              author: 'ai',
              agentId: 'agent-1',
              agentUsername: 'agent-1',
              agentNickname: '林知微',
              content: '第一个助手评论',
            },
            {
              ...baseComment,
              id: 'reply-agent-2',
              author: 'ai',
              agentId: 'agent-2',
              agentUsername: 'agent-2',
              agentNickname: '周砚',
              content: '一个助手回复',
              replyTo: 'comment-1',
            },
          ],
        })}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        pendingAgents={[agent('agent-3', '沈白')]}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('3 条想法，助手处理中')).toBeTruthy();
    expect(screen.getByLabelText('3 条想法，林知微、周砚等 3 位助手，处理中')).toBeTruthy();
    expect(screen.queryByText('林知微、周砚等 3 位助手，处理中')).toBeNull();
    expect(screen.queryByText('第一个助手评论')).toBeNull();
    expect(screen.queryByText('一个助手回复')).toBeNull();
  });

  it('keeps review entry out of the annotation card', () => {
    const reviewAgent = { ...agent('review_1', '梁证言'), kind: 'review' as const };
    const secondReviewAgent = { ...agent('review_2', '何明衡'), kind: 'review' as const };

    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation()}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded={false}
        reviewAgents={[reviewAgent, secondReviewAgent]}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '邀请审阅' })).toBeNull();
    expect(screen.getByRole('button', { name: '进入讨论区' })).toBeTruthy();
  });

  it('shows published distillation content on the annotation card', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation({
          distillation: {
            status: 'published',
            content: '可迁移的沉淀判断',
            publishedAt: now,
            updatedAt: now,
          },
        })}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded={false}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByText('可迁移的沉淀判断')).toBeTruthy();
    expect(container.querySelector('.reader-note.has-distillation')).toBeTruthy();
    expect(container.querySelector('.reader-note-distillation-ticket')).toBeTruthy();
    expect(container.querySelector('.reader-note-quote-badge')).toBeNull();
    expect(screen.queryByText('需要批注的原文')).toBeNull();
  });

  it('keeps long-press delete on the annotation card', () => {
    vi.useFakeTimers();
    const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'setPointerCapture',
    );
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const onDelete = vi.fn();
    const onDeleteComment = vi.fn();

    try {
      render(
        <AnnotationCard
          active
          agents={[]}
          annotation={annotation()}
          commentsCloseKey={0}
          messageSendShortcut="enter"
          noteRef={vi.fn()}
          primaryCommentExpanded
          shortcutModifier="⌘"
          userProfile={userProfile}
          onAddComment={vi.fn()}
          onDelete={onDelete}
          onDeleteComment={onDeleteComment}
          onFocus={vi.fn()}
          onPrimaryCommentExpandedChange={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: '打开划线操作' }));
      fireEvent.pointerDown(screen.getByRole('button', { name: '长按删除划线' }), {
        pointerId: 1,
      });
      vi.advanceTimersByTime(1600);

      expect(onDelete).toHaveBeenCalledWith('annotation-1');
      expect(onDeleteComment).not.toHaveBeenCalled();
    } finally {
      if (originalSetPointerCapture) {
        Object.defineProperty(
          HTMLElement.prototype,
          'setPointerCapture',
          originalSetPointerCapture,
        );
      }
    }
  });
});

describe('ReaderTocPanel', () => {
  it('summarizes highlights and distillations with icon stats', () => {
    render(
      <ReaderTocPanel
        annotationTotals={{ annotations: 2, distillations: 3 }}
        hasToc
        tocAnnotationStats={new Map()}
        tocItems={[{ index: 1, text: '引文', depth: 2, start: 0, end: 10 }]}
        tocOpen
        onScrollToHeading={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('2 划线，3 沉淀')).toBeTruthy();
    expect(screen.queryByText(/批注/)).toBeNull();
    expect(screen.queryByText(/评论/)).toBeNull();
  });
});

describe('ReaderToolbar', () => {
  it('renders a library back button and clamps reading progress', () => {
    const onClose = vi.fn();

    const { container } = render(
      <ReaderToolbar
        extracted={{ title: 'Agentic Coding 的边界', byline: 'tison', content: '' }}
        labels={{
          ...defaultReaderUiLabels,
          backToLibrary: '返回阅读库',
          readingProgress: '阅读进度',
          readerLibrary: '阅读库',
        }}
        readingProgress={1.42}
        toolbarArticleAction={<button type="button">打开</button>}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Agentic Coding 的边界')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: '阅读进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(container.querySelector('.reader-toolbar-progress span')?.getAttribute('style')).toBe(
      'width: 100%;',
    );
  });

  it('keeps cover visuals separate from right-side actions', () => {
    const { container } = render(
      <ReaderToolbar
        articleLeadingVisual={<span data-testid="cover">封面</span>}
        extracted={{ title: '电子书', content: '' }}
        headerMeta={{ title: '电子书', byline: '作者', hasCover: true }}
        toolbarArticleAction={<button type="button">右侧操作</button>}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('cover')).toBeTruthy();
    expect(container.querySelector('.reader-toolbar-article-visual')?.textContent).toBe('封面');
    expect(container.querySelector('.reader-toolbar-actions')?.textContent).toBe('右侧操作');
  });
});

describe('ReaderFloatingToolbar search mode', () => {
  it('replaces the normal toolbar controls while searching', () => {
    const onClose = vi.fn();

    render(
      <ReaderFloatingToolbar
        annotationNavigation={{ previousId: 'a1', nextId: 'a2', totalCount: 2, currentIndex: 1 }}
        controls={<button type="button">Aa</button>}
        hasToc
        search={{
          activeMatchIndex: 0,
          limited: true,
          matches: [{ id: 'm1', start: 0, end: 4, preview: '目标' }],
          open: true,
          query: '目标',
          onClose,
          onNextMatch: vi.fn(),
          onOpen: vi.fn(),
          onPreviousMatch: vi.fn(),
          onQueryChange: vi.fn(),
        }}
        showAnnotationNavigation
        tocOpen={false}
        onNavigateAnnotation={vi.fn()}
        onToggleToc={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('搜索正文')).toBeTruthy();
    expect(screen.getByText('1/1+')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '切换目录' })).toBeNull();
    expect(screen.queryByRole('button', { name: '上一个划线' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aa' })).toBeNull();

    fireEvent.keyDown(screen.getByLabelText('正文搜索'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('SelectionMenu', () => {
  it('renders configured action shortcut keys', () => {
    render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        shortcuts={{ copy: 'X', annotate: 'B', ask: 'Y' }}
        onAnnotate={vi.fn()}
        onAsk={vi.fn()}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('Y')).toBeTruthy();
  });
});
