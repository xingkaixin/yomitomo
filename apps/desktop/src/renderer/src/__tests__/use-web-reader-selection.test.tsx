// @vitest-environment jsdom

import React, { useCallback, useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, UserProfile } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import type { SelectionAction } from '@yomitomo/reader-ui/reader-app-view';
import { initializeAppI18n } from '../i18n/app-i18n';
import { useWebReaderSelection } from '../source/web/use-web-reader-selection';

const now = '2026-07-18T12:00:00.000Z';
const articleText = 'Hello world';
const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

beforeEach(() => {
  initializeAppI18n('zh-CN');
  document.getSelection()?.removeAllRanges();
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [rect({ left: 20, top: 30, width: 80, height: 18 })],
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => null,
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('useWebReaderSelection', () => {
  it('turns a source drag gesture into one selection action', () => {
    const fixture = selectionFixture();
    const translationStart = vi.fn();
    const translationFinish = vi.fn();
    mockCaretOffsets(fixture.textNode, (clientX) => (clientX < 50 ? 0 : 5));
    const { result } = renderSelectionHook(fixture, {
      translationFinish,
      translationStart,
    });

    act(() => {
      dispatchPointer(fixture.paragraph, 'pointerdown', { clientX: 10, buttons: 1 });
      dispatchPointer(fixture.paragraph, 'pointerup', { clientX: 80 });
      result.current.readerSelection.actions.onMouseUp(
        mouseEvent(fixture.paragraph, { clientX: 80 }),
      );
    });

    expect(result.current.selectionAction?.anchor.exact).toBe('Hello');
    expect(result.current.selectionAction?.adjustable).toBe(true);
    expect(result.current.temporaryBoxes).toHaveLength(1);
    expect(translationStart).toHaveBeenCalledWith('pointerdown');
    expect(translationFinish).toHaveBeenCalledWith('pointerup');
  });

  it('updates an existing source selection through the handle interface', () => {
    const fixture = selectionFixture();
    const initialAction: SelectionAction = {
      x: 20,
      y: 30,
      anchor: {
        start: 0,
        end: 5,
        exact: 'Hello',
        prefix: '',
        suffix: ' world',
      },
      adjustable: true,
    };
    mockCaretOffsets(fixture.textNode, () => 8);
    const { result } = renderSelectionHook(fixture, { initialAction });

    act(() => {
      result.current.readerSelection.actions.onSelectionHandleDragStart({
        clientX: 60,
        clientY: 20,
        handle: 'end',
      });
      result.current.readerSelection.actions.onSelectionHandleDragEnd({
        clientX: 80,
        clientY: 20,
        handle: 'end',
      });
    });

    expect(result.current.selectionAction?.anchor.start).toBe(0);
    expect(result.current.selectionAction?.anchor.end).toBe(8);
    expect(result.current.selectionAction?.anchor.exact).toBe('Hello wo');
    expect(result.current.selectionAction?.draggingHandle).toBeUndefined();
    expect(result.current.temporaryBoxes).toHaveLength(1);
  });

  it('suppresses the mouseup lifecycle after a continuous text click', () => {
    const fixture = selectionFixture();
    const initialAction: SelectionAction = {
      x: 20,
      y: 30,
      anchor: {
        start: 0,
        end: 5,
        exact: 'Hello',
        prefix: '',
        suffix: ' world',
      },
    };
    const { result } = renderSelectionHook(fixture, { initialAction });
    const preventDefault = vi.fn();

    act(() => {
      result.current.readerSelection.actions.onMouseDown(
        mouseEvent(fixture.paragraph, { detail: 2, preventDefault }),
      );
      result.current.readerSelection.actions.onMouseUp(mouseEvent(fixture.paragraph));
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(result.current.selectionAction).toBeNull();
    expect(result.current.temporaryBoxes).toEqual([]);
  });
});

function renderSelectionHook(
  fixture: ReturnType<typeof selectionFixture>,
  {
    initialAction = null,
    translationFinish = vi.fn(),
    translationStart = vi.fn(),
  }: {
    initialAction?: SelectionAction | null;
    translationFinish?: (reason: string) => void;
    translationStart?: (reason: string) => void;
  } = {},
) {
  return renderHook(() => {
    const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(initialAction);
    const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
    const clearSelection = useCallback(() => {
      setSelectionAction(null);
      setTemporaryBoxes([]);
    }, []);
    const openSelectionAction = useCallback((action: SelectionAction, boxes: HighlightBox[]) => {
      setSelectionAction(action);
      setTemporaryBoxes(boxes);
    }, []);
    const readerSelection = useWebReaderSelection({
      article: webArticle(),
      articleRef: fixture.articleRef,
      canvasRef: fixture.canvasRef,
      getArticleText: () => articleText,
      scrollRef: fixture.scrollRef,
      selection: {
        clearSelection,
        composer: null,
        openSelectionAction,
        selectionAction,
        setSelectionAction,
        setTemporaryBoxes,
        temporaryBoxes,
      },
      translation: {
        debugContext: () => ({}),
        selection: {
          finish: translationFinish,
          isDisabled: false,
          showDisabledToast: vi.fn(),
          start: translationStart,
        },
      },
      userProfile,
    });
    return { readerSelection, selectionAction, temporaryBoxes };
  });
}

function selectionFixture() {
  const scroll = document.createElement('div');
  const canvas = document.createElement('div');
  const article = document.createElement('article');
  const paragraph = document.createElement('p');
  const textNode = document.createTextNode(articleText);
  paragraph.append(textNode);
  article.append(paragraph);
  canvas.append(article);
  scroll.append(canvas);
  document.body.append(scroll);
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect({ width: 640, height: 800 }),
  });
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => paragraph,
  });
  return {
    articleRef: { current: article },
    canvasRef: { current: canvas },
    paragraph,
    scrollRef: { current: scroll },
    textNode,
  };
}

function mockCaretOffsets(textNode: Text, offsetForClientX: (clientX: number) => number) {
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: vi.fn((clientX: number) => ({
      offsetNode: textNode,
      offset: offsetForClientX(clientX),
    })),
  });
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointerup',
  values: { buttons?: number; clientX: number },
) {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      button: 0,
      buttons: values.buttons ?? 0,
      clientX: values.clientX,
      clientY: 20,
    }),
  );
}

function mouseEvent(
  target: Element,
  values: {
    clientX?: number;
    detail?: number;
    preventDefault?: () => void;
  } = {},
) {
  return {
    button: 0,
    clientX: values.clientX ?? 0,
    clientY: 20,
    detail: values.detail ?? 1,
    preventDefault: values.preventDefault ?? vi.fn(),
    target,
  } as unknown as React.MouseEvent<HTMLElement>;
}

function webArticle(): ArticleRecord {
  return {
    id: 'article-1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    sourceType: 'web',
    title: 'Selection test',
    byline: '',
    siteName: 'Example',
    contentHtml: `<p>${articleText}</p>`,
    contentHash: 'article-hash',
    annotations: [],
    createdAt: now,
    updatedAt: now,
  };
}

function rect(values: Partial<DOMRect> = {}): DOMRect {
  const left = values.left ?? 0;
  const top = values.top ?? 0;
  const width = values.width ?? 0;
  const height = values.height ?? 0;
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}
