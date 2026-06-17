// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import { SelectionMenu } from './reader-selection-menu';
import { Composer, measureComposerPosition } from './reader-composer';
import { ReaderChatPanel } from './reader-chat-panel';
import { EmptyNotes } from './reader-empty-notes';
import { ReaderFloatingToolbar, ReaderToolbar } from './reader-toolbar';
import { ReaderSettingsToolbarControls } from './reader-toolbar-controls';
import { ReaderSurfaceView } from './reader-surface-view';
import { ReaderTocPanel } from './reader-toc-panel';
import { defaultReaderUiLabels } from './reader-app-view-types';
import { AvatarBadge } from '../shared/reader-component-primitives';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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

describe('AvatarBadge', () => {
  it('renders packaged file URLs as images', () => {
    const avatar = 'file:///Applications/Yomitomo.app/Contents/Resources/app/assets/agent.webp';
    const { container } = render(<AvatarBadge avatar={avatar} fallback="AI" />);

    const badge = container.querySelector('.reader-avatar-badge');
    const image = badge?.querySelector('img');

    expect(badge?.classList.contains('is-image')).toBe(true);
    expect(image?.getAttribute('src')).toBe(avatar);
    expect(badge?.textContent).toBe('');
  });
});

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

describe('EmptyNotes', () => {
  it('renders result-first copy and a labelled gesture illustration from labels', () => {
    render(
      <EmptyNotes
        labels={{
          emptyNotesDescription: '在正文里选中文字，即可高亮、写想法或发起讨论。',
          emptyNotesGestureLabel: '在正文里选中文字后，生成一条保存在右侧的划线或想法',
          emptyNotesTitle: '划线、想法就留在这里',
        }}
      />,
    );

    expect(screen.getByText('划线、想法就留在这里')).toBeTruthy();
    expect(screen.getByText('在正文里选中文字，即可高亮、写想法或发起讨论。')).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: '在正文里选中文字后，生成一条保存在右侧的划线或想法',
      }),
    ).toBeTruthy();
  });
});

describe('ReaderSettingsToolbarControls', () => {
  it('uses popover dismissal for toolbar sliders', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsToolbarControls
        labels={{ articleWidth: '文章宽度', fontSize: '字号' }}
        settings={{ backgroundColor: '#fbf6ec', contentWidth: 720, fontSize: 18 }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '字号' }));

    expect(screen.getByRole('slider', { name: '字号' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '减少字号' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '文章宽度' }));

    const widthSlider = screen.getByRole('slider', { name: '文章宽度' });
    expect(screen.queryByRole('slider', { name: '字号' })).toBeNull();
    expect(widthSlider).toBeTruthy();

    widthSlider.focus();
    fireEvent.keyDown(widthSlider, { key: 'Escape' });

    expect(screen.queryByRole('slider', { name: '文章宽度' })).toBeNull();
  });
});

describe('ReaderSurfaceView empty notes', () => {
  function renderSurface(
    showEmptyNotes?: boolean,
    highlights: {
      annotations?: Annotation[];
      boxes?: HighlightBox[];
      newAnnotationIds?: Set<string>;
    } = {},
  ) {
    const annotations = highlights.annotations ?? [];
    return render(
      <ReaderSurfaceView
        activeId={null}
        agentTheaterBoxes={[]}
        agents={[]}
        annotationRailItems={[]}
        annotationRailLayout={{
          articleCenterX: 360,
          leftRailLeft: 0,
          mode: 'right',
          railWidth: 260,
          rightRailLeft: 740,
          viewportHeight: 640,
        }}
        annotations={annotations}
        articleRef={React.createRef<HTMLElement>()}
        boxes={highlights.boxes ?? []}
        canvasRef={React.createRef<HTMLDivElement>()}
        commentsCloseKey={0}
        composer={null}
        exitingAnnotationIds={new Set()}
        expandedPrimaryCommentIds={new Set()}
        extracted={{ title: '文章', content: '<p>正文</p>' }}
        highlightChoice={null}
        messageSendShortcut="mod-enter"
        newAnnotationIds={highlights.newAnnotationIds}
        noteRefForAnnotation={() => vi.fn()}
        notesRef={React.createRef<HTMLElement>()}
        selectionAction={null}
        shortcutModifier="⌘"
        showEmptyNotes={showEmptyNotes}
        surfaceRef={React.createRef<HTMLDivElement>()}
        temporaryBoxes={[]}
        userProfile={userProfile}
        visibleAnnotationIds={new Set(annotations.map((item) => item.id))}
        visibleAnnotations={annotations}
        onAddComment={vi.fn()}
        onCancelComposer={vi.fn()}
        onClearSelection={vi.fn()}
        onCloseHighlightChoice={vi.fn()}
        onCopySelection={vi.fn()}
        onCreateAnnotation={vi.fn()}
        onDeleteAnnotation={vi.fn()}
        onDeleteComment={vi.fn()}
        onFocusAnnotation={vi.fn()}
        onHighlightClick={vi.fn()}
        onMouseUp={vi.fn()}
        onOpenComposer={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
        onScrollToHighlight={vi.fn()}
      />,
    );
  }

  it('keeps the default whole-article empty state for readers without an override', () => {
    renderSurface();

    expect(screen.getByText(defaultReaderUiLabels.emptyNotesTitle)).toBeTruthy();
  });

  it('can suppress the empty state when a paged reader only has no notes on this page', () => {
    renderSurface(false);

    expect(screen.queryByText(defaultReaderUiLabels.emptyNotesTitle)).toBeNull();
  });

  it('marks newly created highlight segments for the grow animation', () => {
    const createdAnnotation = annotation({ id: 'annotation-new' });
    const { container } = renderSurface(false, {
      annotations: [createdAnnotation],
      boxes: [
        {
          id: 'box-1',
          annotationId: createdAnnotation.id,
          color: createdAnnotation.color,
          top: 12,
          left: 24,
          width: 120,
          height: 20,
        },
      ],
      newAnnotationIds: new Set([createdAnnotation.id]),
    });

    const highlight = container.querySelector<HTMLElement>('.reader-highlight');

    expect(highlight?.classList.contains('is-new')).toBe(true);
    expect(highlight?.style.getPropertyValue('--highlight-grow-delay')).toBe('0ms');
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

  it('sanitizes assistant markdown before injecting chat html', () => {
    const { container } = render(
      <ReaderChatPanel
        agents={[agent('agent_2', '周砚')]}
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
                  content:
                    '[safe](https://example.com) [mail](mailto:test@example.com) <script>alert(1)</script> <img src=x onerror=alert(1)>',
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

    const html = container.querySelector('.reader-chat-markdown')?.innerHTML || '';
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('mail');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
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

  it('deletes the annotation only after confirming in the dialog', () => {
    const onDelete = vi.fn();
    const onDeleteComment = vi.fn();

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
    // 点击菜单里的删除入口只打开确认弹窗，不直接删除
    fireEvent.click(screen.getByRole('menuitem', { name: '删除划线' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').textContent).toContain('删除这条划线？');

    // Escape 关闭确认弹窗，不删除
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    // 取消后不删除
    fireEvent.click(screen.getByRole('button', { name: '打开划线操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除划线' }));
    fireEvent.click(screen.getByRole('dialog').querySelector('.reader-confirm-cancel')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    // 重新触发并确认后才删除
    fireEvent.click(screen.getByRole('button', { name: '打开划线操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除划线' }));
    fireEvent.click(screen.getByRole('dialog').querySelector('.reader-confirm-delete')!);

    expect(onDelete).toHaveBeenCalledWith('annotation-1');
    expect(onDeleteComment).not.toHaveBeenCalled();
  });
});

function mockScrollIntoView() {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  const scrollIntoView = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  return {
    scrollIntoView,
    restore: () => {
      if (descriptor) {
        Object.defineProperty(Element.prototype, 'scrollIntoView', descriptor);
        return;
      }
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    },
  };
}

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

  it('marks active toc index 0 as the current location', () => {
    render(
      <ReaderTocPanel
        activeTocIndex={0}
        annotationTotals={{ annotations: 0, distillations: 0 }}
        hasToc
        tocAnnotationStats={new Map()}
        tocItems={[
          { index: 0, text: '开头', depth: 1, start: 0, end: 10 },
          { index: 1, text: '后文', depth: 1, start: 10, end: 20 },
        ]}
        tocOpen
        onScrollToHeading={vi.fn()}
      />,
    );

    const activeButton = screen.getByRole('button', { name: '开头' });
    expect(activeButton.className).toContain('is-active');
    expect(activeButton.getAttribute('aria-current')).toBe('location');
    expect(screen.getByRole('button', { name: '后文' }).hasAttribute('aria-current')).toBe(false);
  });

  it('scrolls the active toc item into view when the panel is open', () => {
    const { scrollIntoView, restore } = mockScrollIntoView();
    try {
      render(
        <ReaderTocPanel
          activeTocIndex={2}
          annotationTotals={{ annotations: 0, distillations: 0 }}
          hasToc
          tocAnnotationStats={new Map()}
          tocItems={[
            { index: 1, text: '前文', depth: 1, start: 0, end: 10 },
            { index: 2, text: '当前', depth: 1, start: 10, end: 20 },
          ]}
          tocOpen
          onScrollToHeading={vi.fn()}
        />,
      );

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      restore();
    }
  });

  it('does not scroll the active toc item while the panel is closed', () => {
    const { scrollIntoView, restore } = mockScrollIntoView();
    try {
      const { rerender } = render(
        <ReaderTocPanel
          activeTocIndex={1}
          annotationTotals={{ annotations: 0, distillations: 0 }}
          hasToc
          tocAnnotationStats={new Map()}
          tocItems={[
            { index: 1, text: '前文', depth: 1, start: 0, end: 10 },
            { index: 2, text: '当前', depth: 1, start: 10, end: 20 },
          ]}
          tocOpen={false}
          onScrollToHeading={vi.fn()}
        />,
      );

      rerender(
        <ReaderTocPanel
          activeTocIndex={2}
          annotationTotals={{ annotations: 0, distillations: 0 }}
          hasToc
          tocAnnotationStats={new Map()}
          tocItems={[
            { index: 1, text: '前文', depth: 1, start: 0, end: 10 },
            { index: 2, text: '当前', depth: 1, start: 10, end: 20 },
          ]}
          tocOpen={false}
          onScrollToHeading={vi.fn()}
        />,
      );

      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      restore();
    }
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

function renderFloatingToolbarWithToc(tocOpen: boolean, hasToc = true) {
  return render(
    <ReaderFloatingToolbar
      annotationNavigation={{ previousId: null, nextId: null, totalCount: 0, currentIndex: 0 }}
      hasToc={hasToc}
      showAnnotationNavigation={false}
      tocOpen={tocOpen}
      onNavigateAnnotation={vi.fn()}
      onToggleToc={vi.fn()}
    />,
  );
}

describe('ReaderFloatingToolbar toc toggle', () => {
  it('reflects the toc open state on the animated toggle icon', () => {
    const { container, rerender } = renderFloatingToolbarWithToc(false);

    const toggle = screen.getByRole('button', { name: '切换目录' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.classList.contains('is-active')).toBe(false);
    expect(container.querySelector('.reader-toc-toggle-icon')?.getAttribute('data-state')).toBe(
      'closed',
    );

    rerender(
      <ReaderFloatingToolbar
        annotationNavigation={{ previousId: null, nextId: null, totalCount: 0, currentIndex: 0 }}
        hasToc
        showAnnotationNavigation={false}
        tocOpen
        onNavigateAnnotation={vi.fn()}
        onToggleToc={vi.fn()}
      />,
    );

    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.classList.contains('is-active')).toBe(true);
    expect(container.querySelector('.reader-toc-toggle-icon')?.getAttribute('data-state')).toBe(
      'open',
    );
  });

  it('keeps the toggle disabled and visually closed without toc items', () => {
    const { container } = renderFloatingToolbarWithToc(true, false);

    const toggle = screen.getByRole('button', { name: '切换目录' });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('.reader-toc-toggle-icon')?.getAttribute('data-state')).toBe(
      'closed',
    );
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

  it('shows copy success before closing the menu', async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onCopySettled = vi.fn();

    render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        onAnnotate={vi.fn()}
        onCopy={onCopy}
        onCopySettled={onCopySettled}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /复制/ }));
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /复制/ }).className).toContain('is-copied');
    expect(screen.queryByText('已复制')).toBeNull();
    expect(screen.getByText('C').className).not.toContain('is-hidden');
    expect(onCopySettled).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(520);
    });

    expect(onCopySettled).toHaveBeenCalledOnce();
  });

  it('shows copy success when copy is requested by shortcut state', async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn().mockResolvedValue(undefined);
    const onCopySettled = vi.fn();
    const { rerender } = render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        copyRequestKey={0}
        onAnnotate={vi.fn()}
        onCopy={onCopy}
        onCopySettled={onCopySettled}
      />,
    );

    await act(async () => {
      rerender(
        <SelectionMenu
          action={{ x: 10, y: 20 }}
          copyRequestKey={1}
          onAnnotate={vi.fn()}
          onCopy={onCopy}
          onCopySettled={onCopySettled}
        />,
      );
      await Promise.resolve();
    });

    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /复制/ }).className).toContain('is-copied');
    expect(screen.queryByText('已复制')).toBeNull();
    expect(screen.getByText('C').className).not.toContain('is-hidden');
    expect(onCopySettled).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(520);
    });

    expect(onCopySettled).toHaveBeenCalledOnce();
  });
});
