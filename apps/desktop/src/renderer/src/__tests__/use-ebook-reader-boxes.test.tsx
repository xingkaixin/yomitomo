// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { useEbookReaderBoxes } from '../use-ebook-reader-boxes';
import type { EbookArticleRecord } from '../app-source-bookcase-shared';
import type { FoliateViewElement } from '../app-ebook-reader-utils';

const now = '2026-05-16T08:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user-1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

type EbookReaderBoxesState = ReturnType<typeof useEbookReaderBoxes>;

let latestBoxesState: EbookReaderBoxesState | null = null;

afterEach(() => {
  latestBoxesState = null;
  cleanup();
  vi.clearAllMocks();
});

function ebookArticle(): EbookArticleRecord {
  return {
    id: 'ebook-1',
    url: 'file://book.epub',
    canonicalUrl: 'file://book.epub',
    sourceType: 'ebook',
    title: '电子书',
    byline: '',
    siteName: '',
    contentHtml: '',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1024,
      },
      chapters: [],
    },
  };
}

const article = ebookArticle();
const annotationAgents: PublicAgent[] = [];
const onFoliatePointerDown = vi.fn();
const onFoliateSelection = vi.fn();
const onFoliateSelectionShortcut = vi.fn();

function requireBoxesState() {
  if (!latestBoxesState) throw new Error('ebook reader boxes not rendered');
  return latestBoxesState;
}

function EbookBoxesProbe() {
  const annotationsRef = React.useRef<Annotation[]>([]);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<FoliateViewElement | null>(null);
  const pageTurnTraceRef = React.useRef(null);
  const pageInfoSectionIndexRef = React.useRef<number | undefined>(undefined);
  const paginationLayoutKeyRef = React.useRef('');
  const readerSettingsRef = React.useRef({ fontSize: 18, contentWidth: 720 });
  const readerStateStatusRef = React.useRef<'loading' | 'ready' | 'error'>('ready');

  latestBoxesState = useEbookReaderBoxes({
    annotationAgents,
    annotationsRef,
    article,
    canvasRef,
    viewRef,
    pageTurnTraceRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatus: 'ready',
    readerStateStatusRef,
    userProfile,
    onFoliatePointerDown,
    onFoliateSelection,
    onFoliateSelectionShortcut,
  });

  return <div data-testid="canvas" ref={canvasRef} />;
}

describe('useEbookReaderBoxes', () => {
  it('hides the highlight layer immediately during page turns', () => {
    render(<EbookBoxesProbe />);

    const canvas = screen.getByTestId('canvas');
    act(() => {
      requireBoxesState().hideEbookBoxLayer();
    });

    expect(canvas.classList.contains('is-ebook-page-turning')).toBe(true);

    act(() => {
      requireBoxesState().resetEbookBoxState();
    });

    expect(canvas.classList.contains('is-ebook-page-turning')).toBe(false);
  });
});
