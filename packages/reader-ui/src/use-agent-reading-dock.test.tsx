// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { PublicAgent } from '@yomitomo/shared';
import { useAgentReadingDock } from './use-agent-reading-dock';

const agents: PublicAgent[] = [
  {
    id: 'agent-a',
    kind: 'annotation',
    enabled: true,
    nickname: '甲助手',
    username: 'agent_a',
    avatar: 'A',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    personalityName: '甲',
    temperature: 0.3,
  },
];

type DockState = ReturnType<typeof useAgentReadingDock>;

let latestDock: DockState | null = null;

afterEach(() => {
  latestDock = null;
  cleanup();
});

function requireDock() {
  if (!latestDock) throw new Error('dock not rendered');
  return latestDock;
}

function dockCommands(dock: DockState) {
  return {
    activateAgentDock: dock.activateAgentDock,
    markAgentDockDone: dock.markAgentDockDone,
    completeAgentDock: dock.completeAgentDock,
    clearAgentDock: dock.clearAgentDock,
  };
}

function DockProbe() {
  latestDock = useAgentReadingDock(agents);

  return <output data-testid="dock-count">{latestDock.agentDockItems.length}</output>;
}

describe('useAgentReadingDock', () => {
  it('keeps command callbacks stable across dock state updates', () => {
    render(<DockProbe />);

    const initialCommands = dockCommands(requireDock());

    act(() => {
      requireDock().activateAgentDock(agents[0]);
    });

    expect(screen.getByTestId('dock-count').textContent).toBe('1');
    expect(dockCommands(requireDock())).toEqual(initialCommands);

    act(() => {
      requireDock().clearAgentDock();
    });

    expect(screen.getByTestId('dock-count').textContent).toBe('0');
    expect(dockCommands(requireDock())).toEqual(initialCommands);
  });
});
