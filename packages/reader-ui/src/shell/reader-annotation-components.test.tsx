// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import { ReaderTocPanel } from './reader-toc-panel';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    author: {
      kind: 'user',
      userId: userProfile.id,
      username: userProfile.username,
      nickname: userProfile.nickname,
    },
    annotationType: 'key_point',
    color: userProfile.annotationColor,
    comments: [
      {
        id: 'comment-1',
        author: {
          kind: 'user',
          userId: userProfile.id,
          username: userProfile.username,
          nickname: userProfile.nickname,
        },
        content: '这是一段足够长的批注正文。'.repeat(12),
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AnnotationCard', () => {
  it('summarizes thoughts without rendering the inline discussion', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation()}
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('1 条想法')).toBeTruthy();
    expect(container.querySelector('.reader-note.has-discussion')).toBeTruthy();
    expect(container.querySelector('.reader-note-tab')?.textContent).toBe('批注');
    expect(container.querySelector('.reader-note-me-badge')).toBeNull();
    expect(container.querySelector('.reader-note-body > .reader-note-action-menu')).toBeTruthy();
    expect(container.querySelector('.reader-note-quote-badge')).toBeNull();
    expect(container.querySelector('.reader-note-left-line')).toBeNull();
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
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={onFocus}
        onOpenDiscussion={onOpenDiscussion}
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
              author: {
                kind: 'agent',
                agentId: 'agent-1',
                username: 'agent-1',
                nickname: '林知微',
              },
              content: '第一个助手评论',
            },
            {
              ...baseComment,
              id: 'reply-agent-2',
              author: {
                kind: 'agent',
                agentId: 'agent-2',
                username: 'agent-2',
                nickname: '周砚',
              },
              content: '一个助手回复',
              replyTo: 'comment-1',
            },
          ],
        })}
        noteRef={vi.fn()}
        pendingAgents={[agent('agent-3', '沈白')]}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
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
        noteRef={vi.fn()}
        reviewAgents={[reviewAgent, secondReviewAgent]}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
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
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(screen.getByText('可迁移的沉淀判断')).toBeTruthy();
    expect(container.querySelector('.reader-note.has-distillation')).toBeTruthy();
    expect(container.querySelector('.reader-note-tab')?.textContent).toBe('沉淀');
    expect(container.querySelector('.reader-note-distillation-ticket')).toBeNull();
    expect(container.querySelector('.reader-note-quote-badge')).toBeNull();
    expect(screen.queryByText('需要批注的原文')).toBeNull();
  });

  it('reveals the annotation card under the dual distillation face', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation({
          distillation: {
            status: 'unpublished',
            content: '正在退散的沉淀内容',
            publishedAt: now,
            updatedAt: now,
          },
        })}
        distillationAnimation={{
          annotationId: 'annotation-1',
          transition: 'unpublish',
          phase: 'morph-out',
          overlayDistillation: {
            content: '正在退散的沉淀内容',
            publishedAt: now,
            updatedAt: now,
          },
          token: 1,
        }}
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(container.querySelector('.reader-note.is-distillation-dual-morph')).toBeTruthy();
    expect(container.querySelector('.reader-note.is-dual-show-anno')).toBeTruthy();
    expect(container.querySelector('.reader-note.is-dual-stamp-in')).toBeNull();
    expect(container.querySelector('.reader-note-dual-face-annotation')?.textContent).toContain(
      '需要批注的原文',
    );
    expect(container.querySelector('.reader-note-dual-face-distillation')?.textContent).toContain(
      '正在退散的沉淀内容',
    );
    expect(container.querySelector('.reader-note-unpublish-overlay')).toBeNull();
  });

  it('keeps the annotation and target distillation faces mounted during publish morph', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation({
          distillation: {
            status: 'unpublished',
            content: '准备进入的沉淀内容',
            publishedAt: now,
            updatedAt: now,
          },
        })}
        distillationAnimation={{
          annotationId: 'annotation-1',
          transition: 'publish',
          phase: 'morph-out',
          overlayDistillation: {
            content: '准备进入的沉淀内容',
            publishedAt: now,
            updatedAt: now,
          },
          token: 1,
        }}
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(container.querySelector('.reader-note.is-distillation-dual-morph')).toBeTruthy();
    expect(container.querySelector('.reader-note.is-dual-show-anno')).toBeTruthy();
    expect(container.querySelector('.reader-note-dual-face-annotation')?.textContent).toContain(
      '需要批注的原文',
    );
    expect(container.querySelector('.reader-note-dual-face-distillation')?.textContent).toContain(
      '准备进入的沉淀内容',
    );
  });

  it('only stamps the distillation face when publish morph enters the distillation state', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation({
          distillation: {
            status: 'published',
            content: '刚进入的沉淀内容',
            publishedAt: now,
            updatedAt: now,
          },
        })}
        distillationAnimation={{
          annotationId: 'annotation-1',
          transition: 'publish',
          phase: 'morph-in',
          overlayDistillation: {
            content: '刚进入的沉淀内容',
            publishedAt: now,
            updatedAt: now,
          },
          token: 1,
        }}
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    expect(container.querySelector('.reader-note.is-dual-show-dist')).toBeTruthy();
    expect(container.querySelector('.reader-note.is-dual-stamp-in')).toBeTruthy();
  });

  it('deletes the annotation only after confirming in the dialog', () => {
    const onDelete = vi.fn();

    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation()}
        noteRef={vi.fn()}
        userProfile={userProfile}
        onDelete={onDelete}
        onFocus={vi.fn()}
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

  it('renders toc annotation totals as one colored count badge', () => {
    const { container } = render(
      <ReaderTocPanel
        annotationTotals={{ annotations: 3, distillations: 1 }}
        hasToc
        tocAnnotationStats={new Map([[1, { count: 3, colors: ['#e2b84c'], distillationCount: 1 }]])}
        tocItems={[{ index: 1, text: '引文', depth: 2, start: 0, end: 10 }]}
        tocOpen
        onScrollToHeading={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '引文，3 划线' })).toBeTruthy();
    expect(container.querySelector('.reader-toc-count')?.textContent).toBe('3');
    expect(
      (container.querySelector('.reader-toc-count') as HTMLElement).style.getPropertyValue(
        '--reader-toc-count-color',
      ),
    ).toBe('#e2b84c');
    expect(container.querySelector('.reader-toc-markers')).toBeNull();
    expect(container.querySelector('.reader-toc-meta')).toBeNull();
  });

  it('applies distance-falloff proximity variables to focused toc items', () => {
    render(
      <ReaderTocPanel
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

    const [previousButton, focusedButton] = screen.getAllByRole('button');
    fireEvent.focus(focusedButton);

    expect(focusedButton.style.getPropertyValue('--reader-toc-shift')).toBe('3.000px');
    expect(focusedButton.style.getPropertyValue('--reader-toc-line-current-width')).toBe(
      '24.000px',
    );
    expect(focusedButton.style.getPropertyValue('--reader-toc-title-shift')).toBe('14.000px');
    expect(previousButton.style.getPropertyValue('--reader-toc-shift')).toBe('1.440px');
    expect(previousButton.style.getPropertyValue('--reader-toc-line-current-width')).toBe(
      '16.720px',
    );
    expect(previousButton.style.getPropertyValue('--reader-toc-title-shift')).toBe('6.720px');

    fireEvent.blur(focusedButton);

    expect(focusedButton.style.getPropertyValue('--reader-toc-shift')).toBe('');
    expect(focusedButton.style.getPropertyValue('--reader-toc-line-current-width')).toBe('');
    expect(focusedButton.style.getPropertyValue('--reader-toc-title-shift')).toBe('');
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
