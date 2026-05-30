// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import { SelectionMenu } from './reader-selection-menu';
import { Composer } from './reader-composer';
import { ReaderTocPanel } from './reader-toc-panel';
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
});

describe('AnnotationCard', () => {
  it('summarizes thoughts without rendering the inline discussion', () => {
    render(
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
    expect(onOpenDiscussion).toHaveBeenCalledWith('annotation-1');
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
    expect(screen.getByText('林知微、周砚等 3 位助手，处理中')).toBeTruthy();
    expect(screen.queryByText('第一个助手评论')).toBeNull();
    expect(screen.queryByText('一个助手回复')).toBeNull();
  });

  it('invites selected review agents to review all thoughts', async () => {
    const reviewAgent = { ...agent('review_1', '梁证言'), kind: 'review' as const };
    const secondReviewAgent = { ...agent('review_2', '何明衡'), kind: 'review' as const };
    const onRequestReview = vi.fn(async () => undefined);

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
        onRequestReview={onRequestReview}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '邀请审阅' }));
    expect(screen.getByRole('button', { name: '审阅' })).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByRole('button', { name: '选择梁证言' }));
    fireEvent.click(screen.getByRole('button', { name: '选择何明衡' }));
    fireEvent.click(screen.getByRole('button', { name: '审阅' }));

    await waitFor(() => {
      expect(onRequestReview).toHaveBeenCalledWith('annotation-1', [
        reviewAgent,
        secondReviewAgent,
      ]);
    });
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

      fireEvent.click(screen.getByRole('button', { name: '打开批注操作' }));
      fireEvent.pointerDown(screen.getByRole('button', { name: '长按删除批注' }), {
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
  it('summarizes highlights and thoughts with icon stats', () => {
    render(
      <ReaderTocPanel
        annotationTotals={{ annotations: 2, comments: 3 }}
        hasToc
        tocAnnotationStats={new Map()}
        tocItems={[{ index: 1, text: '引文', depth: 2, start: 0, end: 10 }]}
        tocOpen
        onScrollToHeading={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('2 划线，3 想法')).toBeTruthy();
    expect(screen.queryByText(/批注/)).toBeNull();
    expect(screen.queryByText(/评论/)).toBeNull();
  });
});

describe('SelectionMenu', () => {
  it('renders configured action shortcut keys', () => {
    render(
      <SelectionMenu
        action={{ x: 10, y: 20 }}
        shortcuts={{ copy: 'X', annotate: 'B' }}
        onAnnotate={vi.fn()}
        onCopy={vi.fn()}
      />,
    );

    expect(screen.getByText('X')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });
});
