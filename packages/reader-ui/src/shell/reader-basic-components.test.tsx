// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer, measureComposerPosition } from './reader-composer';
import { EmptyNotes } from './reader-empty-notes';
import { ReaderSettingsToolbarControls } from './reader-toolbar-controls';
import { ReaderSurfaceView } from './reader-surface-view';
import { defaultReaderUiLabels, type SelectionAdjustmentPointer } from './reader-app-view-types';
import { AvatarBadge } from '../shared/reader-component-primitives';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';

const now = '2026-05-12T08:00:00.000Z';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    author: {
      kind: 'user',
      userId: userProfile.id,
      username: userProfile.username,
      nickname: userProfile.nickname,
    },
    annotationType: 'key_point',
    color: userProfile.annotationColor,
    comments: [
      {
        id: 'comment-1',
        author: {
          kind: 'user',
          userId: userProfile.id,
          username: userProfile.username,
          nickname: userProfile.nickname,
        },
        content: '这是一段足够长的批注正文。'.repeat(12),
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AvatarBadge', () => {
  it('renders packaged file URLs as images', () => {
    const avatar = 'file:///Applications/Yomitomo.app/Contents/Resources/app/assets/agent.webp';
    const { container } = render(<AvatarBadge avatar={avatar} fallback="AI" />);

    const badge = container.querySelector('.reader-avatar-badge');
    const image = badge?.querySelector('img');

    expect(badge?.classList.contains('is-image')).toBe(true);
    expect(image?.getAttribute('src')).toBe(avatar);
    expect(badge?.textContent).toBe('');
  });
});

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

  it('places the composer above the selection when bottom space is insufficient', () => {
    const canvas = document.createElement('div');
    const surface = document.createElement('div');
    const composerElement = document.createElement('div');

    surface.className = 'reader-surface';
    Object.defineProperty(surface, 'scrollTop', { configurable: true, value: 0 });
    Object.defineProperty(surface, 'clientHeight', { configurable: true, value: 360 });
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 720 });
    Object.defineProperty(canvas, 'offsetTop', { configurable: true, value: 0 });
    Object.defineProperty(composerElement, 'offsetWidth', { configurable: true, value: 520 });
    Object.defineProperty(composerElement, 'offsetHeight', { configurable: true, value: 220 });

    surface.append(canvas);
    canvas.append(composerElement);

    expect(measureComposerPosition({ x: 180, y: 330 }, composerElement)).toMatchObject({
      left: 180,
      placement: 'above',
      top: 100,
    });
  });

  it('keeps the composer inside the visible reader viewport', () => {
    const canvas = document.createElement('div');
    const surface = document.createElement('div');
    const composerElement = document.createElement('div');

    surface.className = 'reader-surface';
    Object.defineProperty(surface, 'scrollTop', { configurable: true, value: 140 });
    Object.defineProperty(surface, 'clientHeight', { configurable: true, value: 300 });
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 460 });
    Object.defineProperty(canvas, 'offsetTop', { configurable: true, value: 40 });
    Object.defineProperty(composerElement, 'offsetWidth', { configurable: true, value: 420 });
    Object.defineProperty(composerElement, 'offsetHeight', { configurable: true, value: 220 });

    surface.append(canvas);
    canvas.append(composerElement);

    expect(measureComposerPosition({ x: 440, y: 430 }, composerElement)).toMatchObject({
      left: 28,
      placement: 'above',
      top: 168,
    });
  });
});

describe('EmptyNotes', () => {
  it('renders result-first copy and a labelled gesture illustration from labels', () => {
    render(
      <EmptyNotes
        labels={{
          emptyNotesDescription: '在正文里选中文字，即可高亮、写想法或发起讨论。',
          emptyNotesGestureLabel: '在正文里选中文字后，生成一条保存在右侧的划线或想法',
          emptyNotesTitle: '划线、想法就留在这里',
        }}
      />,
    );

    expect(screen.getByText('划线、想法就留在这里')).toBeTruthy();
    expect(screen.getByText('在正文里选中文字，即可高亮、写想法或发起讨论。')).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: '在正文里选中文字后，生成一条保存在右侧的划线或想法',
      }),
    ).toBeTruthy();
  });
});

describe('ReaderSettingsToolbarControls', () => {
  it('uses popover dismissal for toolbar sliders', () => {
    const onChange = vi.fn();
    render(
      <ReaderSettingsToolbarControls
        labels={{ articleWidth: '文章宽度', fontSize: '字号' }}
        settings={{ backgroundColor: '#fbf6ec', contentWidth: 720, fontSize: 18 }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '字号' }));

    expect(screen.getByRole('slider', { name: '字号' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '减少字号' })).toBeTruthy();
    expect(
      document.querySelector('.reader-toolbar-popover')?.classList.contains('t-dropdown'),
    ).toBe(true);
    expect(
      document.querySelector('.reader-toolbar-popover')?.classList.contains('reader-popup-content'),
    ).toBe(true);
    expect(
      document
        .querySelector('.reader-toolbar-popover')
        ?.classList.contains('reader-popover-content'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '文章宽度' }));

    const widthSlider = screen.getByRole('slider', { name: '文章宽度' });
    expect(screen.queryByRole('slider', { name: '字号' })).toBeNull();
    expect(widthSlider).toBeTruthy();

    widthSlider.focus();
    fireEvent.keyDown(widthSlider, { key: 'Escape' });

    expect(screen.queryByRole('slider', { name: '文章宽度' })).toBeNull();
  });
});

describe('ReaderSurfaceView empty notes', () => {
  function surfaceView({
    composer = null,
    highlights = {},
    selectionAction = null,
    selectionHandlers,
    showEmptyNotes,
  }: {
    composer?: { x: number; y: number; anchor: Annotation['anchor'] } | null;
    highlights?: {
      annotations?: Annotation[];
      boxes?: HighlightBox[];
      newAnnotationIds?: Set<string>;
      temporaryBoxes?: HighlightBox[];
    };
    selectionAction?: {
      x: number;
      y: number;
      anchor: Annotation['anchor'];
      adjustable?: boolean;
    } | null;
    selectionHandlers?: {
      onDrag: (point: SelectionAdjustmentPointer) => void;
      onDragEnd: (point: SelectionAdjustmentPointer) => void;
      onDragStart: (point: SelectionAdjustmentPointer) => void;
    };
    showEmptyNotes?: boolean;
  }) {
    const annotations = highlights.annotations ?? [];
    return (
      <ReaderSurfaceView
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
            onCopySelection: vi.fn(),
            onMouseUp: vi.fn(),
            onOpenComposer: vi.fn(),
            onSelectionHandleDrag: selectionHandlers?.onDrag,
            onSelectionHandleDragEnd: selectionHandlers?.onDragEnd,
            onSelectionHandleDragStart: selectionHandlers?.onDragStart,
          },
        }}
        agents={{
          agents: [],
          dockCompleting: false,
          dockItems: [],
          theaterBoxes: [],
          virtualCursors: [],
        }}
        annotationRail={{
          annotationRailItems: [],
          exitingAnnotationIds: new Set(),
          noteRefForAnnotation: () => vi.fn(),
          visibleAnnotationIds: new Set(annotations.map((item) => item.id)),
          visibleAnnotations: annotations,
          visibleRailAnnotations: annotations,
        }}
        annotationRailLayout={{
          articleCenterX: 360,
          leftRailLeft: 0,
          mode: 'right',
          railWidth: 260,
          rightRailLeft: 740,
          viewportHeight: 640,
        }}
        annotations={{
          activeId: null,
          annotationTotals: { annotations: annotations.length, distillations: 0 },
          annotations,
          boxes: highlights.boxes ?? [],
          filteredAnnotations: annotations,
          newAnnotationIds: highlights.newAnnotationIds,
          showEmptyNotes,
          temporaryBoxes: highlights.temporaryBoxes ?? [],
        }}
        article={{
          id: 'article-1',
          extracted: { title: '文章', content: '<p>正文</p>' },
        }}
        chatAvailable={false}
        refs={{
          articleRef: React.createRef<HTMLElement>(),
          canvasRef: React.createRef<HTMLDivElement>(),
          notesRef: React.createRef<HTMLElement>(),
          surfaceRef: React.createRef<HTMLDivElement>(),
        }}
        selection={{
          composer,
          copyRequestKey: 0,
          highlightChoice: null,
          selectionAction,
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
        }}
        userProfile={userProfile}
      />
    );
  }

  function renderSurface(
    showEmptyNotes?: boolean,
    highlights: {
      annotations?: Annotation[];
      boxes?: HighlightBox[];
      newAnnotationIds?: Set<string>;
    } = {},
  ) {
    return render(surfaceView({ highlights, showEmptyNotes }));
  }

  it('keeps the default whole-article empty state for readers without an override', () => {
    renderSurface();

    expect(screen.getByText(defaultReaderUiLabels.emptyNotesTitle)).toBeTruthy();
  });

  it('can suppress the empty state when a paged reader only has no notes on this page', () => {
    renderSurface(false);

    expect(screen.queryByText(defaultReaderUiLabels.emptyNotesTitle)).toBeNull();
  });

  it('marks newly created highlight segments for the grow animation', () => {
    const createdAnnotation = annotation({ id: 'annotation-new' });
    const { container } = renderSurface(false, {
      annotations: [createdAnnotation],
      boxes: [
        {
          id: 'box-1',
          annotationId: createdAnnotation.id,
          color: createdAnnotation.color,
          top: 12,
          left: 24,
          width: 120,
          height: 20,
        },
      ],
      newAnnotationIds: new Set([createdAnnotation.id]),
    });

    const highlight = container.querySelector<HTMLElement>('.reader-highlight');

    expect(highlight?.classList.contains('is-new')).toBe(true);
    expect(highlight?.style.getPropertyValue('--highlight-grow-delay')).toBe('0ms');
  });

  it('renders selection adjustment handles from temporary highlight boxes', () => {
    const onDrag = vi.fn();
    const onDragEnd = vi.fn();
    const onDragStart = vi.fn();
    const { container } = render(
      surfaceView({
        selectionAction: {
          x: 10,
          y: 20,
          anchor: {
            exact: '选区',
            prefix: '',
            suffix: '',
            start: 0,
            end: 2,
          },
        },
        selectionHandlers: { onDrag, onDragEnd, onDragStart },
        highlights: {
          temporaryBoxes: [
            {
              id: 'selection-1',
              annotationId: '__selection__',
              color: userProfile.annotationColor,
              left: 24,
              top: 16,
              width: 80,
              height: 20,
            },
            {
              id: 'selection-2',
              annotationId: '__selection__',
              color: userProfile.annotationColor,
              left: 18,
              top: 48,
              width: 60,
              height: 20,
            },
          ],
        },
        showEmptyNotes: false,
      }),
    );

    const startHandle = screen.getByRole('button', {
      name: defaultReaderUiLabels.adjustSelectionStart,
    });
    const endHandle = screen.getByRole('button', {
      name: defaultReaderUiLabels.adjustSelectionEnd,
    });

    expect(startHandle.style.left).toBe('24px');
    expect(startHandle.style.top).toBe('16px');
    expect(startHandle.style.getPropertyValue('--reader-selection-handle-height')).toBe('20px');
    expect(endHandle.style.left).toBe('78px');
    expect(endHandle.style.top).toBe('48px');
    expect(container.querySelectorAll('.reader-selection-handle')).toHaveLength(2);

    fireEvent.pointerDown(startHandle, { button: 0, clientX: 24, clientY: 16, pointerId: 1 });
    fireEvent.pointerMove(startHandle, { clientX: 30, clientY: 18, pointerId: 1 });
    fireEvent.pointerUp(startHandle, { clientX: 32, clientY: 18, pointerId: 1 });

    expect(onDragStart).toHaveBeenCalledWith({ handle: 'start', clientX: 24, clientY: 16 });
    expect(onDrag).toHaveBeenLastCalledWith({ handle: 'start', clientX: 32, clientY: 18 });
    expect(onDragEnd).toHaveBeenCalledWith({ handle: 'start', clientX: 32, clientY: 18 });
  });

  it('does not render selection handles for non-adjustable actions', () => {
    const { container } = render(
      surfaceView({
        selectionAction: {
          x: 10,
          y: 20,
          adjustable: false,
          anchor: {
            exact: '译文',
            prefix: '',
            suffix: '',
            start: 0,
            end: 2,
          },
        },
        selectionHandlers: {
          onDrag: vi.fn(),
          onDragEnd: vi.fn(),
          onDragStart: vi.fn(),
        },
        highlights: {
          temporaryBoxes: [
            {
              id: 'selection-1',
              annotationId: '__selection__',
              color: userProfile.annotationColor,
              left: 24,
              top: 16,
              width: 80,
              height: 20,
            },
          ],
        },
        showEmptyNotes: false,
      }),
    );

    expect(container.querySelector('.reader-selection-handle')).toBeNull();
  });

  it('keeps the composer mounted through the close transition', () => {
    vi.useFakeTimers();
    const pendingComposer = { x: 40, y: 60, anchor: annotation().anchor };
    const { container, rerender } = render(surfaceView({ composer: pendingComposer }));

    act(() => {
      vi.advanceTimersByTime(20);
    });

    const opened = container.querySelector<HTMLElement>('.reader-composer');
    expect(opened?.classList.contains('t-dropdown')).toBe(true);
    expect(opened?.classList.contains('is-open')).toBe(true);
    expect(opened?.getAttribute('data-state')).toBe('open');

    act(() => {
      rerender(surfaceView({ composer: null }));
    });

    const closing = container.querySelector<HTMLElement>('.reader-composer');
    expect(closing?.classList.contains('is-closing')).toBe(true);
    expect(closing?.getAttribute('aria-hidden')).toBe('true');
    expect(closing?.hasAttribute('inert')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(container.querySelector('.reader-composer')).toBeNull();
  });

  it('lets a new composer interrupt the previous close transition', () => {
    vi.useFakeTimers();
    const firstComposer = { x: 40, y: 60, anchor: annotation().anchor };
    const nextComposer = { x: 84, y: 96, anchor: annotation({ id: 'annotation-2' }).anchor };
    const { container, rerender } = render(surfaceView({ composer: firstComposer }));

    act(() => {
      vi.advanceTimersByTime(20);
    });
    act(() => {
      rerender(surfaceView({ composer: null }));
    });
    expect(container.querySelector('.reader-composer')?.classList.contains('is-closing')).toBe(
      true,
    );

    act(() => {
      rerender(surfaceView({ composer: nextComposer }));
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });

    const reopened = container.querySelector<HTMLElement>('.reader-composer');
    expect(reopened?.classList.contains('is-open')).toBe(true);
    expect(reopened?.getAttribute('data-state')).toBe('open');

    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(container.querySelector('.reader-composer')).toBeTruthy();
  });
});
