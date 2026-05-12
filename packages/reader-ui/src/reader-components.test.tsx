// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentAnnotateMenu, SelectionMenu, type ReaderReadingSection } from './reader-components';
import type { FocusCoReadingPlan, PublicAgent } from '@yomitomo/shared';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

function renderAgentAnnotateMenu() {
  const articleId = 'article_1';
  return render(
    <AgentAnnotateMenu
      articleId={articleId}
      agents={[agent('agent_1', '林知微'), agent('agent_2', '周砚')]}
      annotatingAgents={[]}
      messageSendShortcut="enter"
      readingSections={[section()]}
      shortcutModifier="⌘"
      onCancel={vi.fn()}
      onPlanFocusCoReading={vi.fn(async () => plan(articleId))}
      onSaveFocusCoReadingPlan={vi.fn()}
      onStartAgentPlan={vi.fn()}
    />,
  );
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
