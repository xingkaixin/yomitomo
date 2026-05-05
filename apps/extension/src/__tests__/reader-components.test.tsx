// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  AgentAnnotateMenu,
  AnnotationCard,
  Composer,
  HighlightChoiceMenu,
  QuestionPanel,
  ReaderSettingsPanel,
  SelectionMenu,
} from '../reader-components';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const userProfile: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

const annotation: Annotation = {
  id: 'annotation_1',
  anchor: {
    exact: '重要原文',
    prefix: '',
    suffix: '',
    start: 0,
    end: 4,
  },
  author: 'user',
  annotationType: 'key_point',
  color: '#f4c95d',
  comments: [],
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

const agent: PublicAgent = {
  id: 'agent_1',
  kind: 'annotation',
  nickname: '阅读伙伴',
  username: 'reader',
  avatar: '',
  annotationColor: '#8ab6d6',
  annotationDensity: 'medium',
  personalityName: '追问型导师',
  temperature: 0.35,
};

const readingSections = [{ id: 'toc-0', title: '引言', start: 0, end: 20 }];

function dragActionToCell(actionLabel: string, cellLabel: string) {
  const data: Record<string, string> = {};
  const dataTransfer = {
    effectAllowed: '',
    setData: vi.fn((type: string, value: string) => {
      data[type] = value;
    }),
    getData: vi.fn((type: string) => data[type] || ''),
  };
  fireEvent.dragStart(screen.getByRole('button', { name: actionLabel }), { dataTransfer });
  fireEvent.drop(screen.getByLabelText(cellLabel), { dataTransfer });
}

describe('Composer', () => {
  it('provides an accessible name for the annotation textarea', () => {
    render(
      <Composer
        agents={[]}
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
        desktopConnected
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('批注内容')).toBeTruthy();
  });

  it('submits annotation content with the selected type', () => {
    const onSave = vi.fn();
    render(
      <Composer
        agents={[]}
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
        desktopConnected
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: '延伸问题' }));
    fireEvent.click(screen.getByRole('radio', { name: '挑战' }));
    fireEvent.change(screen.getByLabelText('批注内容'), { target: { value: '这里需要追问' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    expect(onSave).toHaveBeenCalledWith('这里需要追问', 'question', 'challenge');
  });

  it('exposes annotation types as a keyboard selectable radio group', () => {
    render(
      <Composer
        agents={[]}
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
        desktopConnected
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: '批注类型' });
    expect(screen.getByRole('radio', { name: '关键判断' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    fireEvent.keyDown(group, { key: 'ArrowRight' });

    expect(screen.getByRole('radio', { name: '前提漏洞' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('inserts a selected mention into the annotation draft', () => {
    render(
      <Composer
        agents={[agent]}
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
        desktopConnected
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('批注内容'), { target: { value: '请 @rea' } });
    fireEvent.click(screen.getByRole('button', { name: /阅读伙伴/ }));

    expect(screen.getByLabelText('批注内容')).toHaveProperty('value', '请 @reader ');
  });
});

describe('AnnotationCard', () => {
  it('provides an accessible name for the comment textarea', () => {
    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation}
        desktopConnected
        noteRef={vi.fn()}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /0 条评论/ }));

    expect(screen.getByLabelText('评论内容')).toBeTruthy();
  });

  it('inserts a selected mention into the comment draft', () => {
    render(
      <AnnotationCard
        active
        agents={[agent]}
        annotation={annotation}
        desktopConnected
        noteRef={vi.fn()}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={vi.fn()}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /0 条评论/ }));
    fireEvent.change(screen.getByLabelText('评论内容'), { target: { value: '请 @rea' } });
    fireEvent.click(screen.getByRole('button', { name: /阅读伙伴/ }));

    expect(screen.getByLabelText('评论内容')).toHaveProperty('value', '请 @reader ');
  });

  it('commits comment content to the selected annotation', () => {
    const onAddComment = vi.fn();
    render(
      <AnnotationCard
        active
        agents={[]}
        annotation={annotation}
        desktopConnected
        noteRef={vi.fn()}
        shortcutModifier="⌘"
        userProfile={userProfile}
        onAddComment={onAddComment}
        onDelete={vi.fn()}
        onFocus={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /0 条评论/ }));
    fireEvent.change(screen.getByLabelText('评论内容'), { target: { value: '补充评论' } });
    fireEvent.click(screen.getByRole('button', { name: '添加评论' }));

    expect(onAddComment).toHaveBeenCalledWith('annotation_1', '补充评论');
  });
});

describe('HighlightChoiceMenu', () => {
  it('selects the overlapping annotation by author choice', () => {
    const onSelect = vi.fn();
    render(
      <HighlightChoiceMenu
        action={{ x: 0, y: 0 }}
        agents={[agent]}
        annotations={[
          annotation,
          {
            ...annotation,
            id: 'annotation_2',
            author: 'ai',
            agentId: agent.id,
            agentUsername: agent.username,
            agentNickname: agent.nickname,
            agentAvatar: agent.avatar,
            agentAnnotationColor: agent.annotationColor,
          },
        ]}
        userProfile={userProfile}
        onCancel={vi.fn()}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /阅读伙伴/ }));

    expect(onSelect).toHaveBeenCalledWith('annotation_2');
  });
});

describe('QuestionPanel', () => {
  it('opens questions and parks comment questions', () => {
    const onFocus = vi.fn();
    const onSetAnnotationQuestionStatus = vi.fn();
    const onSetCommentQuestionStatus = vi.fn();
    render(
      <QuestionPanel
        agents={[agent]}
        annotations={[
          {
            ...annotation,
            annotationType: 'question',
            questionStatus: 'open',
            comments: [
              {
                id: 'comment_question',
                author: 'user',
                content: '如何验证？',
                createdAt: '2026-05-04T00:01:00.000Z',
              },
            ],
          },
        ]}
        userProfile={userProfile}
        onFocus={onFocus}
        onSetAnnotationQuestionStatus={onSetAnnotationQuestionStatus}
        onSetCommentQuestionStatus={onSetCommentQuestionStatus}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: '回答' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '搁置' })[1]);

    expect(onFocus).toHaveBeenCalledWith('annotation_1');
    expect(onSetCommentQuestionStatus).toHaveBeenCalledWith(
      'annotation_1',
      'comment_question',
      'parked',
    );
  });
});

describe('AgentAnnotateMenu', () => {
  it('requires a planned section action before starting careful reading', () => {
    const onStartAgentPlan = vi.fn();
    render(
      <AgentAnnotateMenu
        agents={[agent]}
        annotatingAgents={[]}
        readingSections={readingSections}
        onCancel={vi.fn()}
        onStartAgentPlan={onStartAgentPlan}
      />,
    );

    expect(screen.getByRole('button', { name: '开始精读' })).toHaveProperty('disabled', true);
    expect(screen.getByText('阅读伙伴')).toBeTruthy();

    dragActionToCell('解释', '阅读伙伴 引言 动作槽');
    fireEvent.click(screen.getByRole('button', { name: '开始精读' }));

    expect(onStartAgentPlan).toHaveBeenCalledWith(agent, [
      {
        sectionId: 'toc-0',
        sectionTitle: '引言',
        sectionStart: 0,
        sectionEnd: 20,
        readingIntent: 'explain',
      },
    ]);
  });

  it('passes the dropped reading intent into careful reading', () => {
    const onStartAgentPlan = vi.fn();
    render(
      <AgentAnnotateMenu
        agents={[agent]}
        annotatingAgents={[]}
        readingSections={readingSections}
        onCancel={vi.fn()}
        onStartAgentPlan={onStartAgentPlan}
      />,
    );

    dragActionToCell('挑战', '阅读伙伴 引言 动作槽');
    fireEvent.click(screen.getByRole('button', { name: '开始精读' }));

    expect(onStartAgentPlan).toHaveBeenCalledWith(agent, [
      expect.objectContaining({ readingIntent: 'challenge' }),
    ]);
  });

  it('keeps a separate reading plan for each agent', () => {
    const secondAgent: PublicAgent = {
      ...agent,
      id: 'agent_2',
      nickname: '拆解助手',
      username: 'decomposer',
    };
    const onStartAgentPlan = vi.fn();
    render(
      <AgentAnnotateMenu
        agents={[agent, secondAgent]}
        annotatingAgents={[]}
        readingSections={readingSections}
        onCancel={vi.fn()}
        onStartAgentPlan={onStartAgentPlan}
      />,
    );

    dragActionToCell('挑战', '阅读伙伴 引言 动作槽');
    dragActionToCell('拆解', '拆解助手 引言 动作槽');
    fireEvent.click(screen.getByRole('button', { name: '开始精读' }));

    expect(onStartAgentPlan).toHaveBeenNthCalledWith(1, agent, [
      expect.objectContaining({ readingIntent: 'challenge' }),
    ]);
    expect(onStartAgentPlan).toHaveBeenNthCalledWith(2, secondAgent, [
      expect.objectContaining({ readingIntent: 'decompose' }),
    ]);
  });
});

describe('SelectionMenu', () => {
  it('opens the composer for the selected text', () => {
    const onAnnotate = vi.fn();
    render(<SelectionMenu action={{ x: 0, y: 0 }} onAnnotate={onAnnotate} />);

    fireEvent.click(screen.getByRole('button', { name: '添加批注' }));

    expect(onAnnotate).toHaveBeenCalledTimes(1);
  });
});

describe('ReaderSettingsPanel', () => {
  it('shows saved pairing identity while the desktop is unreachable', () => {
    render(
      <ReaderSettingsPanel
        desktopConnected={false}
        hasSavedPairing
        pairingId="YMT-123456"
        pairingStatus="桌面端未连通"
        pairingTokenDraft="token"
        settings={{ fontSize: 20, contentWidth: 860 }}
        onChange={vi.fn()}
        onDisconnectDesktop={vi.fn()}
        onSavePairingToken={vi.fn()}
        onSetPairingTokenDraft={vi.fn()}
      />,
    );

    expect(screen.getByText('已保存配对')).toBeTruthy();
    expect(screen.getByText('YMT-123456')).toBeTruthy();
    expect(screen.queryByLabelText('桌面端配对码')).toBeNull();
  });
});
