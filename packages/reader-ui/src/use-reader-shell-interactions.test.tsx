// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HighlightChoice, SelectionAction } from './reader-app-view-types';
import { useReaderShellInteractions } from './use-reader-shell-interactions';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const selectionAction: SelectionAction = {
  x: 10,
  y: 20,
  anchor: {
    exact: 'selected',
    prefix: '',
    suffix: '',
    start: 0,
    end: 8,
  },
};

const highlightChoice: HighlightChoice = {
  x: 20,
  y: 30,
  annotationIds: ['annotation-1'],
};

function ShellProbe({
  activeId = null,
  agentAnnotateOpen = false,
  composer = null,
  filteredAnnotationCount = 1,
  settingsOpen = false,
  visibleAnnotationIds = new Set<string>(),
  onCancelComposer = vi.fn(),
  onClearActiveAnnotation = vi.fn(),
  onCloseFloatingPanels = vi.fn(),
  onCloseHighlightChoice = vi.fn(),
  onCopySelection = vi.fn(),
  onOpenComposer = vi.fn(),
  onToggleAgentAnnotate = vi.fn(),
  onToggleSettings = vi.fn(),
}: Partial<Parameters<typeof useReaderShellInteractions>[0]>) {
  const shell = useReaderShellInteractions({
    activeId,
    agentAnnotateOpen,
    composer,
    filteredAnnotationCount,
    highlightChoice,
    selectionAction,
    selectionActionShortcuts: { copy: 'x', annotate: 'b' },
    settingsOpen,
    visibleAnnotationIds,
    onCancelComposer,
    onClearActiveAnnotation,
    onCloseFloatingPanels,
    onCloseHighlightChoice,
    onCopySelection,
    onOpenComposer,
    onToggleAgentAnnotate,
    onToggleSettings,
  });

  return (
    <div onPointerDownCapture={shell.handleReaderPointerDownCapture}>
      <output data-testid="filter-open">{String(shell.annotationFilterOpen)}</output>
      <button type="button" onClick={shell.toggleAnnotationFilter}>
        filter
      </button>
      <div data-testid="outside">outside</div>
    </div>
  );
}

describe('useReaderShellInteractions', () => {
  it('closes the annotation filter with Escape', () => {
    render(<ShellProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'filter' }));
    expect(screen.getByTestId('filter-open').textContent).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('filter-open').textContent).toBe('false');
  });

  it('closes floating state and active annotation on outside pointer down', () => {
    const onClearActiveAnnotation = vi.fn();
    const onCloseFloatingPanels = vi.fn();
    const onCloseHighlightChoice = vi.fn();

    render(
      <ShellProbe
        activeId="annotation-1"
        settingsOpen
        visibleAnnotationIds={new Set(['annotation-1'])}
        onClearActiveAnnotation={onClearActiveAnnotation}
        onCloseFloatingPanels={onCloseFloatingPanels}
        onCloseHighlightChoice={onCloseHighlightChoice}
      />,
    );

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(onCloseFloatingPanels).toHaveBeenCalledTimes(1);
    expect(onCloseHighlightChoice).toHaveBeenCalledTimes(2);
    expect(onClearActiveAnnotation).toHaveBeenCalledTimes(1);
  });

  it('routes selection shortcuts to copy and annotate actions', () => {
    const onCopySelection = vi.fn();
    const onOpenComposer = vi.fn();

    render(<ShellProbe onCopySelection={onCopySelection} onOpenComposer={onOpenComposer} />);

    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'b' });

    expect(onCopySelection).toHaveBeenCalledWith(selectionAction);
    expect(onOpenComposer).toHaveBeenCalledWith(selectionAction);
  });
});
