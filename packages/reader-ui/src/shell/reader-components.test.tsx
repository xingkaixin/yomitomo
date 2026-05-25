// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentAnnotateMenu } from '../agent/reader-agent-annotate-menu';
import { AnnotationCard } from '../annotations/reader-annotation-card';
import { SelectionMenu } from './reader-selection-menu';
import { ReaderTocPanel } from './reader-toc-panel';
import type { Annotation, FocusCoReadingPlan, PublicAgent, UserProfile } from '@yomitomo/shared';
import type { ReaderReadingSection } from '../reader-types';

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

function section(overrides: Partial<ReaderReadingSection> = {}): ReaderReadingSection {
  return {
    id: 'section_1',
    title: '引文',
    start: 0,
    end: 20,
    ...overrides,
  };
}

function plan(articleId: string): FocusCoReadingPlan {
  return {
    id: 'focus_1',
    articleId,
    selectedAgentIds: [],
    sections: [],
    createdAt: now,
    updatedAt: now,
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

function renderAgentAnnotateMenu({
  focusCoReadingPlan,
  onSaveFocusCoReadingPlan = vi.fn((_: FocusCoReadingPlan) => undefined),
  readingSections = [section()],
}: {
  focusCoReadingPlan?: FocusCoReadingPlan;
  onSaveFocusCoReadingPlan?: (plan: FocusCoReadingPlan) => void | Promise<void>;
  readingSections?: ReaderReadingSection[];
} = {}) {
  const articleId = 'article_1';
  return render(
    <AgentAnnotateMenu
      articleId={articleId}
      agents={[agent('agent_1', '林知微'), agent('agent_2', '周砚')]}
      annotatingAgents={[]}
      focusCoReadingPlan={focusCoReadingPlan}
      messageSendShortcut="enter"
      readingSections={readingSections}
      shortcutModifier="⌘"
      onCancel={vi.fn()}
      onPlanFocusCoReading={vi.fn(async () => plan(articleId))}
      onSaveFocusCoReadingPlan={onSaveFocusCoReadingPlan}
      onStartAgentPlan={vi.fn()}
    />,
  );
}

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

describe('AgentAnnotateMenu add agent menus', () => {
  it('closes the plan add menu on outside pointer down', () => {
    renderAgentAnnotateMenu();

    fireEvent.click(screen.getAllByRole('button', { name: '添加助手' })[0]!);
    expect(screen.getByRole('button', { name: /林知微/ })).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('button', { name: /林知微/ })).toBeNull();
  });

  it('closes the section add menu on outside pointer down', () => {
    renderAgentAnnotateMenu();

    fireEvent.click(screen.getByRole('button', { name: /引文/ }));
    fireEvent.click(screen.getAllByRole('button', { name: '添加助手' })[1]!);
    expect(screen.getByRole('button', { name: /林知微/ })).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('button', { name: /林知微/ })).toBeNull();
  });

  it('keeps the plan add control before selected agents', () => {
    const { container } = renderAgentAnnotateMenu();

    fireEvent.click(screen.getAllByRole('button', { name: '添加助手' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: /林知微/ }));

    const addControl = container.querySelector(
      '.reader-focus-agent-picker > .reader-focus-add-wrap',
    );
    const selectedAgent = container.querySelector(
      '.reader-focus-agent-picker > .reader-focus-agent-chip',
    );

    expect(
      Boolean(
        addControl!.compareDocumentPosition(selectedAgent!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it('keeps the section add control before assigned agents', () => {
    const { container } = renderAgentAnnotateMenu();

    fireEvent.click(screen.getByRole('button', { name: /引文/ }));
    fireEvent.click(screen.getAllByRole('button', { name: '添加助手' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: /林知微/ }));

    const addControl = container.querySelector(
      '.reader-focus-assigned-list > .reader-focus-add-wrap',
    );
    const assignedAgent = container.querySelector(
      '.reader-focus-assigned-list > .reader-focus-assigned-chip',
    );

    expect(
      Boolean(
        addControl!.compareDocumentPosition(assignedAgent!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it('clears only section agent assignments', () => {
    const onSaveFocusCoReadingPlan = vi.fn();
    renderAgentAnnotateMenu({
      focusCoReadingPlan: {
        id: 'focus_1',
        articleId: 'article_1',
        selectedAgentIds: ['agent_1'],
        sections: [
          {
            sectionId: 'section_1',
            sectionTitle: '引文',
            sectionStart: 0,
            sectionEnd: 20,
            agentIds: ['agent_1'],
            messages: [
              {
                id: 'message_1',
                content: '@林知微 重点看这里',
                agentIds: ['agent_1'],
                createdAt: now,
              },
            ],
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
      onSaveFocusCoReadingPlan,
    });

    const clearButton = screen.getByRole('button', { name: '清空编排' }) as HTMLButtonElement;
    expect(clearButton.disabled).toBe(false);

    fireEvent.click(clearButton);

    const savedPlan = onSaveFocusCoReadingPlan.mock.calls[0]?.[0] as FocusCoReadingPlan;
    expect(savedPlan.selectedAgentIds).toEqual(['agent_1']);
    expect(savedPlan.sections).toEqual([]);
    expect((screen.getByRole('button', { name: '清空编排' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('disables clearing when no sections have assigned agents', () => {
    renderAgentAnnotateMenu();

    expect((screen.getByRole('button', { name: '清空编排' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('AnnotationCard', () => {
  it('keeps the thought list and composer collapsed by default', () => {
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
    expect(screen.getByRole('button', { name: '展开想法列表' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '添加想法' })).toBeNull();
    expect(screen.queryByText('@kevin')).toBeNull();
    expect(screen.queryByLabelText('留言内容')).toBeNull();
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

  it('excludes review agents from reply mention suggestions', () => {
    const annotationAgent = agent('lin', '林知微');
    const reviewAgent = { ...agent('review_1', '梁证言'), kind: 'review' as const };

    render(
      <AnnotationCard
        active
        agents={[annotationAgent]}
        annotation={annotation()}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        reviewAgents={[reviewAgent]}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
        onRequestReview={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回复' }));
    fireEvent.change(screen.getByLabelText('留言内容'), { target: { value: '@' } });

    expect(screen.getByText('林知微')).toBeTruthy();
    expect(screen.queryByText('梁证言')).toBeNull();
  });

  it('uses a single add thought trigger when expanded without thoughts', () => {
    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={{ ...annotation(), comments: [] }}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '添加想法' })).toBeTruthy();
    expect(screen.queryByText('还没有想法')).toBeNull();
  });

  it('shows pending assistant work inside an empty expanded annotation', () => {
    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={{ ...annotation(), comments: [] }}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        pendingAgents={[agent('agent_1', '林知微')]}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('1 条想法，助手处理中')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('林知微 正在整理想法');
    expect(screen.getByRole('button', { name: '添加想法' })).toBeTruthy();
  });

  it('shows expanded top-level thought content only once', () => {
    const target = annotation({
      comments: [
        {
          ...annotation().comments[0]!,
          content: '一个猜测',
        },
      ],
    });
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={target}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(container.textContent?.match(/一个猜测/g)).toHaveLength(1);
  });

  it('does not render a reply expander when a thought has no replies', () => {
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation({
          comments: [
            {
              ...annotation().comments[0]!,
              content: '第一行想法\n第二行想法',
            },
          ],
        })}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '展开回复列表' })).toBeNull();
    expect(container.querySelector('.reader-replies-label')?.getAttribute('aria-label')).toBe(
      '0 条回复',
    );
    expect(container.querySelector('.reader-thought-footer')).toBeTruthy();
  });

  it('orders top-level thoughts oldest first', () => {
    const baseComment = annotation().comments[0]!;
    const target = annotation({
      comments: [
        {
          ...baseComment,
          id: 'comment-old',
          content: '旧想法',
          createdAt: '2026-05-17T10:00:00.000Z',
        },
        {
          ...baseComment,
          id: 'comment-new',
          content: '新想法',
          createdAt: '2026-05-17T12:00:00.000Z',
        },
        {
          ...baseComment,
          id: 'comment-middle',
          content: '中间想法',
          createdAt: '2026-05-17T11:00:00.000Z',
        },
      ],
    });
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={target}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    const thoughts = Array.from(container.querySelectorAll('.reader-thought-summary')).map(
      (thought) => thought.textContent || '',
    );

    expect(thoughts[0]).toContain('旧想法');
    expect(thoughts[1]).toContain('中间想法');
    expect(thoughts[2]).toContain('新想法');
  });

  it('treats assistant comments without reply targets as top-level thoughts', () => {
    const baseComment = annotation().comments[0]!;
    render(
      <AnnotationCard
        active
        agents={[agent('agent-1', '林知微'), agent('agent-2', '周砚')]}
        annotation={{
          ...annotation(),
          comments: [
            {
              ...baseComment,
              id: 'comment-agent-1',
              author: 'ai',
              content: '第一个助手想法',
              agentId: 'agent-1',
            },
            {
              ...baseComment,
              id: 'comment-agent-2',
              author: 'ai',
              content: '第二个助手想法',
              agentId: 'agent-2',
            },
          ],
        }}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('2 条想法')).toBeTruthy();
    expect(screen.getByText('第一个助手想法')).toBeTruthy();
    expect(screen.getByText('第二个助手想法')).toBeTruthy();
  });

  it('opens the thought list and new top-level thought after it is added', async () => {
    const target = annotation();
    const addedComment = {
      ...target.comments[0]!,
      id: 'comment-2',
      content: '新的想法',
    };
    const onPrimaryCommentExpandedChange = vi.fn();
    const { rerender } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={target}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded={false}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={onPrimaryCommentExpandedChange}
      />,
    );

    rerender(
      <AnnotationCard
        active
        agents={[]}
        annotation={{ ...target, comments: [...target.comments, addedComment] }}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded={false}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={onPrimaryCommentExpandedChange}
      />,
    );

    await waitFor(() => {
      expect(onPrimaryCommentExpandedChange).toHaveBeenCalledWith('annotation-1', true);
    });

    rerender(
      <AnnotationCard
        active
        agents={[]}
        annotation={{ ...target, comments: [...target.comments, addedComment] }}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={onPrimaryCommentExpandedChange}
      />,
    );

    expect(document.querySelectorAll('.reader-discussion-thread.is-open')).toHaveLength(1);
  });

  it('allows multiple reply lists to stay expanded', () => {
    const baseComment = annotation().comments[0]!;
    const target = annotation({
      comments: [
        {
          ...baseComment,
          id: 'comment-1',
          content: '第一个想法',
        },
        {
          ...baseComment,
          id: 'comment-2',
          content: '第二个想法',
        },
        {
          ...baseComment,
          id: 'reply-1',
          content: '第一个回复',
          replyTo: 'comment-1',
        },
        {
          ...baseComment,
          id: 'reply-2',
          content: '第二个回复',
          replyTo: 'comment-2',
        },
      ],
    });
    const { container } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={target}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    const replyToggles = screen.getAllByRole('button', { name: '展开回复列表' });
    fireEvent.click(replyToggles[0]!);
    expect(container.querySelectorAll('.reader-replies-toggle[aria-expanded="true"]')).toHaveLength(
      1,
    );

    fireEvent.click(replyToggles[1]!);
    expect(container.querySelectorAll('.reader-replies-toggle[aria-expanded="true"]')).toHaveLength(
      2,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '收起回复列表' })[0]!);
    expect(container.querySelectorAll('.reader-replies-toggle[aria-expanded="true"]')).toHaveLength(
      1,
    );
  });

  it('collapses expanded reply lists when the note loses focus', () => {
    const baseComment = annotation().comments[0]!;
    const target = annotation({
      comments: [
        baseComment,
        {
          ...baseComment,
          id: 'reply-1',
          content: '一个回复',
          replyTo: baseComment.id,
        },
      ],
    });
    const { container, rerender } = render(
      <AnnotationCard
        active
        agents={[]}
        annotation={target}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '展开回复列表' }));
    expect(container.querySelectorAll('.reader-replies-toggle[aria-expanded="true"]')).toHaveLength(
      1,
    );

    rerender(
      <AnnotationCard
        active={false}
        agents={[]}
        annotation={target}
        commentsCloseKey={0}
        messageSendShortcut="enter"
        noteRef={vi.fn()}
        primaryCommentExpanded
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.reader-replies-toggle[aria-expanded="true"]')).toHaveLength(
      0,
    );
  });

  it('adds replies under the selected top-level thought', () => {
    const onAddComment = vi.fn();

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
        onAddComment={onAddComment}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回复' }));
    fireEvent.change(screen.getAllByLabelText('留言内容')[0]!, {
      target: { value: '继续聊' },
    });
    fireEvent.click(screen.getByRole('button', { name: '回复' }));

    expect(onAddComment).toHaveBeenCalledWith('annotation-1', '继续聊', 'comment-1');
  });

  it('keeps the new thought composer open when its panel whitespace is clicked', () => {
    const { container } = render(
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
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '添加想法' }));
    const textarea = screen.getByLabelText('留言内容');
    const panel = container.querySelector(
      '.reader-new-thought-composer .reader-inline-composer-panel',
    );
    expect(panel).toBeTruthy();

    fireEvent.mouseDown(panel!);
    fireEvent.blur(textarea, { relatedTarget: null });

    expect(screen.getByLabelText('留言内容')).toBeTruthy();
  });

  it('keeps the reply composer open when its panel whitespace is clicked', () => {
    const { container } = render(
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
        onDelete={vi.fn()}
        onFocus={vi.fn()}
        onPrimaryCommentExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '回复' }));
    const textarea = screen.getByLabelText('留言内容');
    const panel = container.querySelector(
      '.reader-thread-reply-composer .reader-inline-composer-panel',
    );
    expect(panel).toBeTruthy();

    fireEvent.mouseDown(panel!);
    fireEvent.blur(textarea, { relatedTarget: null });

    expect(screen.getByLabelText('留言内容')).toBeTruthy();
  });

  it('long-press deletes a top-level thought', () => {
    vi.useFakeTimers();
    const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
    HTMLElement.prototype.setPointerCapture = vi.fn();
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
          onDelete={vi.fn()}
          onDeleteComment={onDeleteComment}
          onFocus={vi.fn()}
          onPrimaryCommentExpandedChange={vi.fn()}
        />,
      );

      fireEvent.pointerDown(screen.getByRole('button', { name: '长按删除想法' }), {
        pointerId: 1,
      });
      vi.advanceTimersByTime(1600);

      expect(onDeleteComment).toHaveBeenCalledWith('annotation-1', 'comment-1');
    } finally {
      HTMLElement.prototype.setPointerCapture = originalSetPointerCapture;
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
