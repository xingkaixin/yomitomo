// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  AnnotationCard,
  Composer,
  HighlightChoiceMenu,
  ReaderSettingsPanel,
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
  temperature: 0.35,
};

describe('Composer', () => {
  it('provides an accessible name for the annotation textarea', () => {
    render(
      <Composer
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
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
        composer={{ x: 0, y: 0, anchor: annotation.anchor }}
        shortcutModifier="⌘"
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '延伸问题' }));
    fireEvent.change(screen.getByLabelText('批注内容'), { target: { value: '这里需要追问' } });
    fireEvent.click(screen.getByRole('button', { name: '保存批注' }));

    expect(onSave).toHaveBeenCalledWith('这里需要追问', 'question');
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
