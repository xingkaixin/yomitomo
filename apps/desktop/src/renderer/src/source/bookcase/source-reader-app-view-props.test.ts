import { describe, expect, it, vi } from 'vitest';
import { buildSourceReaderAppViewProps } from './source-reader-app-view-props';

describe('buildSourceReaderAppViewProps', () => {
  it('builds common ReaderAppView models from source session and workspace', () => {
    const input = baseInput();
    const props = buildSourceReaderAppViewProps(input);

    expect(props.agents.agents).toBe(input.session.annotationAgents);
    expect(props.agents.pendingAnnotationAgents).toBe(input.session.pendingAnnotationAgents);
    expect(props.agents.reviewAgents).toBe(input.session.reviewAgents);
    expect(props.annotations.annotationTotals).toBe(input.workspace.annotationTotals);
    expect(props.annotations.commentsCloseKey).toBe(input.workspace.commentsCloseKey);
    expect(props.chat).toBe(input.workspace.readerChat.model);
    expect(props.labels).toBe(input.workspace.labels);
    expect(props.selection).toEqual({
      composer: input.workspace.selection.composer,
      copyRequestKey: input.workspace.selection.copyRequestKey,
      highlightChoice: input.workspace.selection.highlightChoice,
      selectionAction: input.workspace.selection.selectionAction,
    });
    expect(props.settings).toEqual({
      messageSendShortcut: input.workspace.sendShortcut,
      readerSettings: input.workspace.readerSettings,
      selectionActionShortcuts: input.workspace.actionShortcuts,
      settingsOpen: false,
      shortcutModifier: input.workspace.shortcutModifier,
      showSettings: false,
    });
    expect(props.options).toEqual({ embedded: true });
  });

  it('keeps source-specific reader article, annotations, toolbar and refs', () => {
    const input = baseInput();
    const props = buildSourceReaderAppViewProps(input);

    expect(props.article).toBe(input.article);
    expect(props.annotations.showEmptyNotes).toBe(true);
    expect(props.refs).toBe(input.refs);
    expect(props.toc).toBe(input.toc);
    expect(props.toolbar).toBe(input.toolbar);
    expect(props.userProfile).toBe(input.userProfile);
  });
});

function baseInput(): Parameters<typeof buildSourceReaderAppViewProps>[0] {
  return {
    actions: {
      annotation: {
        onAddComment: vi.fn(),
        onClearActiveAnnotation: vi.fn(),
        onCreateAnnotation: vi.fn(),
        onDeleteAnnotation: vi.fn(),
        onDeleteComment: vi.fn(),
        onFocusAnnotation: vi.fn(),
        onHighlightClick: vi.fn(),
        onScrollToHighlight: vi.fn(),
      },
      selection: {
        onCancelComposer: vi.fn(),
        onClearSelection: vi.fn(),
        onCloseHighlightChoice: vi.fn(),
        onCopySelection: vi.fn(),
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
    },
    agentPlayback: {
      completionBurstKey: 1,
      dockCompleting: false,
      dockItems: [],
      theaterBoxes: [],
      virtualCursors: [],
    },
    annotations: {
      activeConnection: null,
      activeId: null,
      annotations: [],
      boxes: [],
      distillationAnimation: null,
      filteredAnnotations: [],
      newAnnotationIds: new Set(['annotation_1']),
      searchBoxes: [],
      showEmptyNotes: true,
      temporaryBoxes: [],
    },
    article: {
      extracted: {
        title: 'Title',
        byline: 'Author',
        content: 'Content',
      },
      id: 'article_1',
    },
    refs: {
      articleRef: { current: null },
      canvasRef: { current: null },
      noteRefs: { current: new Map() },
      notesRef: { current: null },
      surfaceRef: { current: null },
    },
    session: {
      annotationAgents: [],
      pendingAnnotationAgents: { annotation_1: [] },
      reviewAgents: [],
    },
    toc: {
      activeIndex: 0,
      annotationStats: [],
      items: [],
      open: true,
    },
    toolbar: {
      controls: 'controls',
    },
    userProfile: {
      id: 'user_1',
      name: 'User',
      avatar: '',
      annotationColor: '#f59e0b',
    },
    workspace: {
      actionShortcuts: {},
      annotationTotals: { annotations: 1, distillations: 0 },
      commentsCloseKey: 2,
      labels: {},
      readerChat: {
        actions: {
          onClose: vi.fn(),
          onOpen: vi.fn(),
          onSubmit: vi.fn(),
        },
        model: {
          open: false,
        },
      },
      readerSettings: {},
      selection: {
        composer: null,
        copyRequestKey: 3,
        highlightChoice: null,
        selectionAction: null,
      },
      sendShortcut: 'mod-enter',
      shortcutModifier: 'mod',
    },
  } as never;
}
