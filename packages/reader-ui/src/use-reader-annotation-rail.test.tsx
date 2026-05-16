// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { useReaderAnnotationRail } from './use-reader-annotation-rail';

const now = '2026-05-12T08:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
  articleId = 'article-1',
  boxes = [],
  commentsCloseKey = 0,
  filteredAnnotations = annotations,
  noteRefs,
  onAnnotationLayoutChange,
}: {
  annotations: Annotation[];
  articleId?: string;
  boxes?: HighlightBox[];
  commentsCloseKey?: number;
  filteredAnnotations?: Annotation[];
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onAnnotationLayoutChange?: () => void;
}) {
  const rail = useReaderAnnotationRail({
    activeId: null,
    agents,
    annotations,
    articleId,
    boxes,
    commentsCloseKey,
    filteredAnnotations,
    noteRefs,
    userProfile,
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
      <output data-testid="exiting">{Array.from(rail.exitingAnnotationIds).join(',')}</output>
      <output data-testid="expanded">{Array.from(rail.expandedPrimaryCommentIds).join(',')}</output>
      <output data-testid="active-count">{rail.filterActiveCount}</output>
      <button
        type="button"
        onClick={() => rail.toggleAnnotationFilterValueForGroup('person', 'agent:agent-a')}
      >
        agent filter
      </button>
      <button
        type="button"
        onClick={() => rail.toggleAnnotationFilterValueForGroup('person', 'user:user-1')}
      >
        user filter
      </button>
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
  it('prunes filters that no longer exist in the source annotations', async () => {
    const userNote = annotation('user-note');
    const agentNote = annotation('agent-note', {
      author: 'ai',
      agentId: 'agent-a',
      agentUsername: 'agent_a',
    });
    const noteRefs = createNoteRefs();

    const { rerender } = render(
      <HookProbe annotations={[userNote, agentNote]} noteRefs={noteRefs} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agent filter' }));

    expect(screen.getByTestId('visible').textContent).toBe('agent-note');
    expect(screen.getByTestId('active-count').textContent).toBe('1');

    rerender(<HookProbe annotations={[userNote]} noteRefs={noteRefs} />);

    await waitFor(() => {
      expect(screen.getByTestId('visible').textContent).toBe('user-note');
      expect(screen.getByTestId('active-count').textContent).toBe('0');
    });
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

    render(
      <HookProbe
        annotations={[userNote, agentNote]}
        boxes={[box('user-note', 20), box('agent-note', 80)]}
        noteRefs={noteRefs}
      />,
    );

    expect(Array.from(noteRefs.current.keys()).toSorted()).toEqual(['agent-note', 'user-note']);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'user filter' }));
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
});
