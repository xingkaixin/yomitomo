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
  composer = null,
  readerChatOpen = false,
  settingsOpen = false,
  selectionAction: currentSelectionAction = selectionAction,
  visibleAnnotationIds = new Set<string>(),
  onCancelComposer = vi.fn(),
  onClearActiveAnnotation = vi.fn(),
  onClearSelection = vi.fn(),
  onCloseFloatingPanels = vi.fn(),
  onCloseHighlightChoice = vi.fn(),
  onCloseReaderChat = vi.fn(),
  onAskSelection = vi.fn(),
  onCopySelection = vi.fn(),
  onOpenReaderChat = vi.fn(),
  onOpenComposer = vi.fn(),
  onToggleSettings = vi.fn(),
  shouldPreserveActiveAnnotationOnPointerDown,
}: Partial<Parameters<typeof useReaderShellInteractions>[0]>) {
  const shell = useReaderShellInteractions({
    activeId,
    composer,
    highlightChoice,
    selectionAction: currentSelectionAction,
    selectionActionShortcuts: { copy: 'x', annotate: 'b' },
    settingsOpen,
    visibleAnnotationIds,
    onCancelComposer,
    onClearActiveAnnotation,
    onClearSelection,
    onCloseFloatingPanels,
    onCloseHighlightChoice,
    onCloseReaderChat,
    onAskSelection,
    onCopySelection,
    onOpenReaderChat,
    onOpenComposer,
    onToggleSettings,
    readerChatOpen,
    shouldPreserveActiveAnnotationOnPointerDown,
  });

  return (
    <div onPointerDownCapture={shell.handleReaderPointerDownCapture}>
      <div data-testid="outside">outside</div>
    </div>
  );
}

describe('useReaderShellInteractions', () => {
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

  it('routes the ask selection shortcut', () => {
    const onAskSelection = vi.fn();
    const onOpenReaderChat = vi.fn();

    render(<ShellProbe onAskSelection={onAskSelection} onOpenReaderChat={onOpenReaderChat} />);

    fireEvent.keyDown(window, { key: 'q' });

    expect(onAskSelection).toHaveBeenCalledWith(selectionAction);
    expect(onOpenReaderChat).not.toHaveBeenCalled();
  });

  it('toggles reader chat with Q when no selection action is active', () => {
    const onOpenReaderChat = vi.fn();
    const onCloseReaderChat = vi.fn();
    const { rerender } = render(
      <ShellProbe
        selectionAction={null}
        onCloseReaderChat={onCloseReaderChat}
        onOpenReaderChat={onOpenReaderChat}
      />,
    );

    fireEvent.keyDown(window, { key: 'q' });

    expect(onOpenReaderChat).toHaveBeenCalledTimes(1);
    expect(onCloseReaderChat).not.toHaveBeenCalled();

    rerender(
      <ShellProbe
        selectionAction={null}
        onCloseReaderChat={onCloseReaderChat}
        onOpenReaderChat={onOpenReaderChat}
        readerChatOpen
      />,
    );

    fireEvent.keyDown(window, { key: 'Q' });

    expect(onCloseReaderChat).toHaveBeenCalledTimes(1);
  });

  it('does not toggle reader chat from editable keyboard targets', () => {
    const onCloseReaderChat = vi.fn();
    const onOpenReaderChat = vi.fn();

    render(
      <>
        <ShellProbe
          selectionAction={null}
          onCloseReaderChat={onCloseReaderChat}
          onOpenReaderChat={onOpenReaderChat}
        />
        <textarea aria-label="draft" />
      </>,
    );

    fireEvent.keyDown(screen.getByLabelText('draft'), { key: 'q' });

    expect(onCloseReaderChat).not.toHaveBeenCalled();
    expect(onOpenReaderChat).not.toHaveBeenCalled();
  });

  it('clears selection action on outside pointer down', () => {
    const onClearSelection = vi.fn();

    render(<ShellProbe onClearSelection={onClearSelection} />);

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('keeps active annotation when pointer down lands on highlight geometry', () => {
    const onClearActiveAnnotation = vi.fn();
    const onCloseHighlightChoice = vi.fn();

    render(
      <ShellProbe
        activeId="annotation-1"
        visibleAnnotationIds={new Set(['annotation-1'])}
        onClearActiveAnnotation={onClearActiveAnnotation}
        onCloseHighlightChoice={onCloseHighlightChoice}
        shouldPreserveActiveAnnotationOnPointerDown={() => true}
      />,
    );

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(onClearActiveAnnotation).not.toHaveBeenCalled();
  });

  it('uses the latest selection action when outside pointer handling changes', () => {
    const onClearSelection = vi.fn();
    const { rerender } = render(
      <ShellProbe selectionAction={null} onClearSelection={onClearSelection} />,
    );

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(onClearSelection).not.toHaveBeenCalled();

    rerender(<ShellProbe selectionAction={selectionAction} onClearSelection={onClearSelection} />);
    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('keeps selection action when pressing the selection menu', () => {
    const onClearSelection = vi.fn();

    function Probe() {
      const shell = useReaderShellInteractions({
        activeId: null,
        composer: null,
        highlightChoice,
        selectionAction,
        selectionActionShortcuts: { copy: 'x', annotate: 'b' },
        settingsOpen: false,
        visibleAnnotationIds: new Set(),
        onCancelComposer: vi.fn(),
        onClearActiveAnnotation: vi.fn(),
        onClearSelection,
        onCloseFloatingPanels: vi.fn(),
        onCloseHighlightChoice: vi.fn(),
        onCopySelection: vi.fn(),
        onOpenComposer: vi.fn(),
        onToggleSettings: vi.fn(),
      });

      return (
        <div onPointerDownCapture={shell.handleReaderPointerDownCapture}>
          <div className="reader-selection-menu">
            <button type="button">复制</button>
          </div>
        </div>
      );
    }

    render(<Probe />);

    fireEvent.pointerDown(screen.getByRole('button', { name: '复制' }));

    expect(onClearSelection).not.toHaveBeenCalled();
  });

  it('keeps selection action when pressing a selection handle', () => {
    const onClearSelection = vi.fn();

    function Probe() {
      const shell = useReaderShellInteractions({
        activeId: null,
        composer: null,
        highlightChoice,
        selectionAction,
        selectionActionShortcuts: { copy: 'x', annotate: 'b' },
        settingsOpen: false,
        visibleAnnotationIds: new Set(),
        onCancelComposer: vi.fn(),
        onClearActiveAnnotation: vi.fn(),
        onClearSelection,
        onCloseFloatingPanels: vi.fn(),
        onCloseHighlightChoice: vi.fn(),
        onCopySelection: vi.fn(),
        onOpenComposer: vi.fn(),
        onToggleSettings: vi.fn(),
      });

      return (
        <div onPointerDownCapture={shell.handleReaderPointerDownCapture}>
          <button className="reader-selection-handle" type="button">
            handle
          </button>
        </div>
      );
    }

    render(<Probe />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'handle' }));

    expect(onClearSelection).not.toHaveBeenCalled();
  });
});
