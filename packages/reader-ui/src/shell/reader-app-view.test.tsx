// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@yomitomo/shared';
import { ReaderAppView, type ReaderSurfaceHandle } from './reader-app-view';

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '2026-07-27T00:00:00.000Z',
};

afterEach(() => cleanup());

describe('ReaderAppView surface handle', () => {
  it('owns its DOM refs and exposes semantic surface operations', async () => {
    const surfaceRef = React.createRef<ReaderSurfaceHandle>();
    const onCopySelection = vi.fn();
    const { unmount } = render(
      <ReaderAppView
        ref={surfaceRef}
        actions={{
          annotation: {
            onClearActiveAnnotation: vi.fn(),
            onCreateAnnotation: vi.fn(),
            onDeleteAnnotation: vi.fn(),
            onFocusAnnotation: vi.fn(),
            onHighlightClick: vi.fn(),
            onScrollToHighlight: vi.fn(),
          },
          selection: {
            onCancelComposer: vi.fn(),
            onClearSelection: vi.fn(),
            onCloseHighlightChoice: vi.fn(),
            onCopySelection,
            onMouseUp: vi.fn(),
            onOpenComposer: vi.fn(),
          },
          shell: {
            onClose: vi.fn(),
            onCloseFloatingPanels: vi.fn(),
            onCloseResponsivePanels: vi.fn(),
            onToggleSettings: vi.fn(),
            onUpdateReaderSettings: vi.fn(),
          },
          toc: {
            onScrollToHeading: vi.fn(),
            onToggleToc: vi.fn(),
          },
        }}
        agents={{
          agents: [],
          dockCompleting: false,
          dockItems: [],
          theaterBoxes: [],
          virtualCursors: [],
        }}
        annotations={{
          activeConnection: null,
          activeId: null,
          annotationTotals: { annotations: 0, distillations: 0 },
          annotations: [],
          boxes: [],
          filteredAnnotations: [],
          temporaryBoxes: [],
        }}
        article={{
          extracted: { title: 'Article', content: '<p>Text</p>' },
          id: 'article-1',
        }}
        selection={{
          composer: null,
          highlightChoice: null,
          selectionAction: {
            x: 10,
            y: 20,
            anchor: { exact: 'Text', prefix: '', suffix: '', start: 0, end: 4 },
          },
        }}
        settings={{
          messageSendShortcut: 'mod-enter',
          readerSettings: {
            backgroundColor: '#ffffff',
            contentWidth: 680,
            fontSize: 18,
          },
          settingsOpen: false,
          shortcutModifier: '⌘',
          showSettings: false,
        }}
        toc={{
          annotationStats: new Map(),
          items: [],
          open: false,
        }}
        userProfile={userProfile}
      />,
    );

    expect(surfaceRef.current?.getRootElement()?.classList.contains('reader-app')).toBe(true);
    expect(surfaceRef.current?.getViewportElement()?.classList.contains('reader-surface')).toBe(
      true,
    );
    expect(surfaceRef.current?.getCanvasElement()?.classList.contains('reader-canvas')).toBe(true);
    expect(surfaceRef.current?.getArticleElement()?.classList.contains('reader-article')).toBe(
      true,
    );
    expect(surfaceRef.current?.getRailElement()?.classList.contains('reader-annotation-rail')).toBe(
      true,
    );
    expect(surfaceRef.current?.getNoteElement('missing')).toBeNull();
    expect(surfaceRef.current?.getNoteElements()).toEqual([]);
    await act(async () => surfaceRef.current?.requestSelectionCopy());
    expect(onCopySelection).toHaveBeenCalledOnce();

    unmount();

    expect(surfaceRef.current).toBeNull();
  });
});
