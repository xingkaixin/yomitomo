// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { useReaderAnnotationRail } from './use-reader-annotation-rail';
import type { AnnotationRailLayout } from './reader-annotations';

const now = '2026-05-12T08:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  readonly elements = new Set<Element>();

  constructor(
    readonly callback: (
      entries: Array<{ target: Element; contentRect: { height: number } }>,
      observer: MockResizeObserver,
    ) => void,
  ) {
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.elements.add(element);
  }

  unobserve(element: Element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  emit(entries: Array<{ target: Element; height: number }>) {
    this.callback(
      entries.map(({ target, height }) => ({
        target,
        contentRect: { height },
      })),
      this,
    );
  }
}

function annotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    anchor: {
      exact: `quote ${id}`,
      prefix: '',
      suffix: '',
      start: id === 'user-note' ? 0 : 20,
      end: id === 'user-note' ? 8 : 28,
    },
    author: 'user',
    annotationType: 'key_point',
    color: userProfile.annotationColor,
    userId: userProfile.id,
    userUsername: userProfile.username,
    userNickname: userProfile.nickname,
    comments: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function box(annotationId: string, top: number): HighlightBox {
  return {
    id: `${annotationId}-box`,
    annotationId,
    color: '#f4c95d',
    top,
    left: 10,
    width: 80,
    height: 18,
  };
}

function createNoteRefs(): React.MutableRefObject<Map<string, HTMLElement>> {
  return { current: new Map<string, HTMLElement>() };
}

function HookProbe({
  annotations,
  annotationRailLayout,
  articleId = 'article-1',
  boxes = [],
  commentsCloseKey = 0,
  filteredAnnotations = annotations,
  noteRefs,
  onAnnotationLayoutChange,
}: {
  annotations: Annotation[];
  annotationRailLayout?: AnnotationRailLayout;
  articleId?: string;
  boxes?: HighlightBox[];
  commentsCloseKey?: number;
  filteredAnnotations?: Annotation[];
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onAnnotationLayoutChange?: () => void;
}) {
  const rail = useReaderAnnotationRail({
    activeId: null,
    annotationRailLayout,
    annotations,
    articleId,
    boxes,
    commentsCloseKey,
    filteredAnnotations,
    noteRefs,
    onAnnotationLayoutChange,
  });

  return (
    <>
      <output data-testid="visible">
        {rail.visibleAnnotations.map((item) => item.id).join(',')}
      </output>
      <output data-testid="rail">
        {rail.annotationRailItems.map((item) => item.annotation.id).join(',')}
      </output>
      <output data-testid="rail-layout">
        {rail.annotationRailItems
          .map((item) => `${item.annotation.id}:${String(item.style.top)}:${item.stackCount}`)
          .join('|')}
      </output>
      <output data-testid="exiting">{Array.from(rail.exitingAnnotationIds).join(',')}</output>
      <output data-testid="expanded">{Array.from(rail.expandedPrimaryCommentIds).join(',')}</output>
      {rail.annotationRailItems.map((item) => (
        <div
          data-annotation-id={item.annotation.id}
          key={item.annotation.id}
          ref={rail.noteRefForAnnotation(item.annotation.id)}
        />
      ))}
    </>
  );
}

describe('useReaderAnnotationRail', () => {
  it('uses filtered annotations as the visible annotations', () => {
    const userNote = annotation('user-note');
    const agentNote = annotation('agent-note', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
    });
    const noteRefs = createNoteRefs();

    const { rerender } = render(
      <HookProbe
        annotations={[userNote, agentNote]}
        filteredAnnotations={[agentNote]}
        noteRefs={noteRefs}
      />,
    );

    expect(screen.getByTestId('visible').textContent).toBe('agent-note');

    rerender(
      <HookProbe
        annotations={[userNote, agentNote]}
        filteredAnnotations={[userNote]}
        noteRefs={noteRefs}
      />,
    );

    expect(screen.getByTestId('visible').textContent).toBe('user-note');
  });

  it('keeps filtered rail notes exiting before removing them', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 44,
      height: 44,
      left: 0,
      right: 80,
      top: 0,
      width: 80,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const userNote = annotation('user-note');
    const agentNote = annotation('agent-note', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
    });
    const noteRefs = createNoteRefs();

    const { rerender } = render(
      <HookProbe
        annotations={[userNote, agentNote]}
        boxes={[box('user-note', 20), box('agent-note', 80)]}
        noteRefs={noteRefs}
      />,
    );

    expect(Array.from(noteRefs.current.keys()).toSorted()).toEqual(['agent-note', 'user-note']);

    await act(async () => {
      rerender(
        <HookProbe
          annotations={[userNote, agentNote]}
          boxes={[box('user-note', 20), box('agent-note', 80)]}
          filteredAnnotations={[userNote]}
          noteRefs={noteRefs}
        />,
      );
    });

    expect(screen.getByTestId('rail').textContent).toBe('user-note,agent-note');
    expect(screen.getByTestId('exiting').textContent).toBe('agent-note');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('rail').textContent).toBe('user-note');
    expect(screen.getByTestId('exiting').textContent).toBe('');
    expect(Array.from(noteRefs.current.keys())).toEqual(['user-note']);
  });

  it('does not notify layout again when rail animation state is unchanged', () => {
    vi.useFakeTimers();
    const userNote = annotation('user-note');
    const noteRefs = createNoteRefs();
    const onAnnotationLayoutChange = vi.fn();

    render(
      <HookProbe
        annotations={[userNote]}
        noteRefs={noteRefs}
        onAnnotationLayoutChange={onAnnotationLayoutChange}
      />,
    );

    expect(onAnnotationLayoutChange).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onAnnotationLayoutChange).toHaveBeenCalledTimes(1);
  });

  it('uses ResizeObserver instead of synchronous mount measurement when available', () => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const getBoundingClientRect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    const userNote = annotation('user-note');
    const noteRefs = createNoteRefs();

    render(<HookProbe annotations={[userNote]} noteRefs={noteRefs} />);

    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0]?.elements.size).toBe(1);
    expect(getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('batches ResizeObserver note height updates into one layout notification', () => {
    vi.useFakeTimers();
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const userNote = annotation('user-note');
    const agentNote = annotation('agent-note', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
    });
    const noteRefs = createNoteRefs();
    const onAnnotationLayoutChange = vi.fn();

    render(
      <HookProbe
        annotations={[userNote, agentNote]}
        noteRefs={noteRefs}
        onAnnotationLayoutChange={onAnnotationLayoutChange}
      />,
    );

    expect(onAnnotationLayoutChange).toHaveBeenCalledTimes(1);
    const observer = MockResizeObserver.instances[0];
    const entries = Array.from(observer.elements).map((target, index) => ({
      target,
      height: index === 0 ? 44 : 72,
    }));

    act(() => {
      observer.emit(entries);
      vi.advanceTimersByTime(16);
    });

    expect(onAnnotationLayoutChange).toHaveBeenCalledTimes(2);

    act(() => {
      observer.emit(entries);
      vi.advanceTimersByTime(16);
    });

    expect(onAnnotationLayoutChange).toHaveBeenCalledTimes(2);
  });

  it('keeps rail layout stable when only the scroll viewport top changes', () => {
    vi.useFakeTimers();
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    const annotations = [
      annotation('old-active', { anchor: anchor('old active', 0, 10) }),
      annotation('old-second', { anchor: anchor('old second', 20, 30) }),
      annotation('old-third', { anchor: anchor('old third', 40, 50) }),
      annotation('old-fourth', { anchor: anchor('old fourth', 60, 70) }),
      annotation('old-fifth', { anchor: anchor('old fifth', 80, 90) }),
      annotation('near-first', { anchor: anchor('near first', 100, 110) }),
      annotation('visible-first', { anchor: anchor('visible first', 120, 130) }),
    ];
    const boxes = [
      { ...box('old-active', 307), height: 23 },
      { ...box('old-second', 307), height: 23 },
      { ...box('old-third', 307), height: 23 },
      { ...box('old-fourth', 353), height: 67 },
      { ...box('old-fifth', 443), height: 51 },
      { ...box('near-first', 574), height: 125 },
      { ...box('visible-first', 750), height: 22 },
    ];
    const annotationRailLayout: AnnotationRailLayout = {
      articleCenterX: 500,
      leftRailLeft: 24,
      mode: 'right',
      railWidth: 320,
      rightRailLeft: 980,
      viewportHeight: 754,
      viewportTop: 0,
    };
    const noteRefs = createNoteRefs();
    const { rerender } = render(
      <HookProbe
        annotations={annotations}
        annotationRailLayout={annotationRailLayout}
        boxes={boxes}
        noteRefs={noteRefs}
      />,
    );
    const observer = MockResizeObserver.instances[0];

    act(() => {
      observer.emit(Array.from(observer.elements).map((target) => ({ target, height: 160 })));
      vi.advanceTimersByTime(16);
    });

    const initialLayout = screen.getByTestId('rail-layout').textContent;

    rerender(
      <HookProbe
        annotations={annotations}
        annotationRailLayout={{ ...annotationRailLayout, viewportTop: 220 }}
        boxes={boxes}
        noteRefs={noteRefs}
      />,
    );

    expect(screen.getByTestId('rail-layout').textContent).toBe(initialLayout);
  });

  it('expands new annotations and clears expansion on article switch', async () => {
    const firstNote = annotation('user-note');
    const addedNote = annotation('agent-note', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
    });
    const nextArticleNote = annotation('next-note');
    const noteRefs = createNoteRefs();

    const { rerender } = render(<HookProbe annotations={[firstNote]} noteRefs={noteRefs} />);

    rerender(<HookProbe annotations={[firstNote, addedNote]} noteRefs={noteRefs} />);

    await waitFor(() => {
      expect(screen.getByTestId('expanded').textContent).toBe('agent-note');
    });

    rerender(
      <HookProbe articleId="article-2" annotations={[nextArticleNote]} noteRefs={noteRefs} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('expanded').textContent).toBe('');
    });
  });

  it('does not expand annotations that only enter the current rail subset', async () => {
    const firstNote = annotation('user-note');
    const pageNote = annotation('page-note');
    const noteRefs = createNoteRefs();

    const { rerender } = render(
      <HookProbe
        annotations={[firstNote]}
        filteredAnnotations={[firstNote, pageNote]}
        noteRefs={noteRefs}
      />,
    );

    rerender(
      <HookProbe
        annotations={[pageNote]}
        filteredAnnotations={[firstNote, pageNote]}
        noteRefs={noteRefs}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('expanded').textContent).toBe('');
    });
  });

  it('expands a new annotation when it enters the current rail subset later', async () => {
    const firstNote = annotation('user-note');
    const addedNote = annotation('agent-note', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
    });
    const noteRefs = createNoteRefs();

    const { rerender } = render(
      <HookProbe annotations={[firstNote]} filteredAnnotations={[firstNote]} noteRefs={noteRefs} />,
    );

    rerender(
      <HookProbe
        annotations={[firstNote]}
        filteredAnnotations={[firstNote, addedNote]}
        noteRefs={noteRefs}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('expanded').textContent).toBe('');
    });

    rerender(
      <HookProbe
        annotations={[firstNote, addedNote]}
        filteredAnnotations={[firstNote, addedNote]}
        noteRefs={noteRefs}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('expanded').textContent).toBe('agent-note');
    });
  });
});

function anchor(exact: string, start: number, end: number) {
  return {
    exact,
    prefix: '',
    suffix: '',
    start,
    end,
  };
}
