// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, UserProfile } from '@yomitomo/shared';
import {
  annotationRailLayoutForWidth,
  measureAnnotationRailLayout,
  stackedAnnotationRailLayout,
  useReaderShellState,
} from './use-reader-shell-state';

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
});

function annotation(id: string): Annotation {
  return {
    id,
    anchor: {
      exact: `quote ${id}`,
      prefix: '',
      suffix: '',
      start: 0,
      end: 8,
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
  };
}

function elementWithRect(element: HTMLElement, rect: Partial<DOMRect>) {
  element.getBoundingClientRect = vi.fn(
    () =>
      ({
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect,
  );
  return element;
}

function ShellStateProbe({
  annotations,
  onNavigateAnnotation,
}: {
  annotations: Annotation[];
  onNavigateAnnotation: (annotationId: string) => void;
}) {
  const articleRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const noteRefs = React.useRef(new Map<string, HTMLElement>());
  const shell = useReaderShellState({
    activeId: annotations[0]?.id ?? null,
    annotations,
    articleId: 'article-1',
    articleRef,
    boxes: [],
    canvasRef,
    commentsCloseKey: 0,
    composer: null,
    filteredAnnotations: annotations,
    highlightChoice: null,
    noteRefs,
    selectionAction: null,
    settingsOpen: false,
    surfaceRef,
    onCancelComposer: vi.fn(),
    onClearActiveAnnotation: vi.fn(),
    onClearSelection: vi.fn(),
    onCloseFloatingPanels: vi.fn(),
    onCloseHighlightChoice: vi.fn(),
    onCopySelection: vi.fn(),
    onNavigateAnnotation,
    onOpenComposer: vi.fn(),
    onResolveAnnotationNavigation: ({ annotations: visibleAnnotations }) => ({
      currentIndex: visibleAnnotations.length > 0 ? 1 : 0,
      previousId: null,
      nextId: visibleAnnotations[1]?.id ?? null,
      totalCount: visibleAnnotations.length,
    }),
    onToggleSettings: vi.fn(),
  });

  return (
    <div>
      <div ref={surfaceRef}>
        <div ref={canvasRef}>
          <article ref={articleRef} />
        </div>
      </div>
      <output data-testid="next">{shell.annotationNavigation.nextId ?? ''}</output>
      <button type="button" onClick={() => shell.navigateAnnotation('next')}>
        next
      </button>
    </div>
  );
}

describe('measureAnnotationRailLayout', () => {
  it('falls back to stacked layout when the shell has no measurable width', () => {
    const canvas = elementWithRect(document.createElement('div'), { width: 0 }) as HTMLDivElement;
    const article = elementWithRect(document.createElement('article'), { width: 640 });

    expect(measureAnnotationRailLayout(canvas, article)).toEqual(stackedAnnotationRailLayout);
  });

  it('uses both rails when both sides have enough room', () => {
    const canvas = elementWithRect(document.createElement('div'), {
      left: 0,
      right: 1400,
      width: 1400,
    }) as HTMLDivElement;
    const article = elementWithRect(document.createElement('article'), {
      left: 300,
      right: 940,
      width: 640,
    });

    expect(measureAnnotationRailLayout(canvas, article)).toMatchObject({
      articleCenterX: 700,
      articleWidth: 640,
      leftRailLeft: 0,
      mode: 'both',
      railWidth: 360,
      rightRailLeft: 1040,
    });
  });

  it('keeps the article left and places annotations on the right when only one rail fits', () => {
    expect(annotationRailLayoutForWidth({ canvasWidth: 1000, targetArticleWidth: 720 })).toEqual({
      articleCenterX: 360,
      articleWidth: 720,
      leftRailLeft: 0,
      mode: 'right',
      railWidth: 260,
      rightRailLeft: 740,
    });
  });

  it('keeps right-side article width responsive to the target width', () => {
    const wide = annotationRailLayoutForWidth({ canvasWidth: 1100, targetArticleWidth: 820 });
    const narrow = annotationRailLayoutForWidth({ canvasWidth: 1100, targetArticleWidth: 760 });

    expect(wide).toMatchObject({
      articleWidth: 820,
      mode: 'right',
      railWidth: 260,
      rightRailLeft: 840,
    });
    expect(narrow).toMatchObject({
      articleWidth: 760,
      mode: 'right',
      railWidth: 320,
      rightRailLeft: 780,
    });
  });

  it('stacks annotations when the article and one rail cannot both fit', () => {
    expect(annotationRailLayoutForWidth({ canvasWidth: 780, targetArticleWidth: 720 })).toEqual({
      articleCenterX: 360,
      articleWidth: 720,
      leftRailLeft: 0,
      mode: 'stacked',
      railWidth: 0,
      rightRailLeft: 0,
    });
  });
});

describe('useReaderShellState', () => {
  it('resolves annotation navigation from visible annotations', async () => {
    const onNavigateAnnotation = vi.fn();

    render(
      <ShellStateProbe
        annotations={[annotation('first'), annotation('second')]}
        onNavigateAnnotation={onNavigateAnnotation}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('next').textContent).toBe('second');
    });

    fireEvent.click(screen.getByRole('button', { name: 'next' }));

    expect(onNavigateAnnotation).toHaveBeenCalledWith('second', 'next');
  });
});
