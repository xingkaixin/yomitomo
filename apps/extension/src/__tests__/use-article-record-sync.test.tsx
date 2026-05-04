// @vitest-environment jsdom

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { applyAgentCommentDelta } from '../reader-utils';
import { useArticleRecordSync } from '../use-article-record-sync';

const { storageGet, storageSet, storageRemove } = vi.hoisted(() => ({
  storageGet: vi.fn(),
  storageSet: vi.fn(),
  storageRemove: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageGet,
        set: storageSet,
        remove: storageRemove,
      },
    },
  },
}));

beforeEach(() => {
  storageGet.mockResolvedValue({});
  storageSet.mockResolvedValue(undefined);
  storageRemove.mockResolvedValue(undefined);
  vi.clearAllMocks();
});

describe('useArticleRecordSync streaming commits', () => {
  it('applies streamed deltas locally and commits once', async () => {
    const send = vi.fn();
    const bridge = { readyState: WebSocket.OPEN, send, close: vi.fn() };
    const annotationsRef = { current: [annotation()] };
    const articleRecordRef = { current: null as ArticleRecord | null };
    const setAnnotations = vi.fn((next: Annotation[]) => {
      annotationsRef.current = next;
    });

    const { result } = renderHook(() =>
      useArticleRecordSync({
        extracted: {
          id: 'article-1',
          url: 'https://example.com/article',
          canonicalUrl: 'https://example.com/article',
          title: 'Article',
          byline: '',
          excerpt: '',
          content: '<p>Article text</p>',
          contentHash: 'hash-1',
        },
        desktopBridgeRef: { current: bridge },
        desktopAuthenticatedRef: { current: true },
        annotationsRef,
        articleRecordRef,
        recordCreatedAtRef: { current: null },
        setAnnotations,
        setAgents: vi.fn(),
        setReaderSettings: vi.fn(),
        setUserProfile: vi.fn(),
        normalizeUserProfile: (user) => user as never,
        readerLog: vi.fn(),
        errorMessage: (error) => String(error),
      }),
    );

    act(() => {
      for (let index = 0; index < 100; index += 1) {
        const next = applyAgentCommentDelta(
          annotationsRef.current,
          'annotation-1',
          'comment-1',
          'x',
        );
        result.current.applyAnnotations(next!);
      }
    });

    expect(send).toHaveBeenCalledTimes(0);
    expect(annotationsRef.current[0]?.comments[0]?.content).toHaveLength(100);

    act(() => {
      result.current.commitAnnotations();
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: 'article:save',
      payload: {
        id: 'article-1',
        annotations: [{ id: 'annotation-1' }],
      },
    });
    await waitFor(() => expect(storageSet).toHaveBeenCalled());
  });

  it('keeps desktop annotations when the local cache has a newer empty record', async () => {
    const send = vi.fn();
    const bridge = { readyState: WebSocket.OPEN, send, close: vi.fn() };
    const annotationsRef = { current: [] as Annotation[] };
    const articleRecordRef = {
      current: articleRecord([], '2026-05-04T01:00:00.000Z'),
    };
    const setAnnotations = vi.fn((next: Annotation[]) => {
      annotationsRef.current = next;
    });

    const { result } = renderHook(() =>
      useArticleRecordSync({
        extracted: {
          id: 'article-1',
          url: 'https://example.com/article',
          canonicalUrl: 'https://example.com/article',
          title: 'Article',
          byline: '',
          excerpt: '',
          content: '<p>Article text</p>',
          contentHash: 'hash-1',
        },
        desktopBridgeRef: { current: bridge },
        desktopAuthenticatedRef: { current: true },
        annotationsRef,
        articleRecordRef,
        recordCreatedAtRef: { current: articleRecordRef.current.createdAt },
        setAnnotations,
        setAgents: vi.fn(),
        setReaderSettings: vi.fn(),
        setUserProfile: vi.fn(),
        normalizeUserProfile: (user) => user as never,
        readerLog: vi.fn(),
        errorMessage: (error) => String(error),
      }),
    );

    await act(async () => {
      await result.current.applyDesktopArticleRecord(
        articleRecord([annotation()], '2026-05-04T00:00:00.000Z'),
      );
    });

    expect(annotationsRef.current).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(0);
    await waitFor(() => expect(storageSet).toHaveBeenCalled());
  });

  it('backfills local annotations only during explicit desktop sync', async () => {
    const send = vi.fn();
    const bridge = { readyState: WebSocket.OPEN, send, close: vi.fn() };
    const annotationsRef = { current: [annotation()] };
    const articleRecordRef = {
      current: articleRecord([annotation()], '2026-05-04T01:00:00.000Z'),
    };
    const setAnnotations = vi.fn((next: Annotation[]) => {
      annotationsRef.current = next;
    });

    const { result } = renderHook(() =>
      useArticleRecordSync({
        extracted: {
          id: 'article-1',
          url: 'https://example.com/article',
          canonicalUrl: 'https://example.com/article',
          title: 'Article',
          byline: '',
          excerpt: '',
          content: '<p>Article text</p>',
          contentHash: 'hash-1',
        },
        desktopBridgeRef: { current: bridge },
        desktopAuthenticatedRef: { current: true },
        annotationsRef,
        articleRecordRef,
        recordCreatedAtRef: { current: articleRecordRef.current.createdAt },
        setAnnotations,
        setAgents: vi.fn(),
        setReaderSettings: vi.fn(),
        setUserProfile: vi.fn(),
        normalizeUserProfile: (user) => user as never,
        readerLog: vi.fn(),
        errorMessage: (error) => String(error),
      }),
    );

    await act(async () => {
      await result.current.applyDesktopArticleRecord(
        articleRecord([], '2026-05-04T00:00:00.000Z'),
        { backfillLocalChanges: true },
      );
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      type: 'article:save',
      payload: {
        id: 'article-1',
        annotations: [{ id: 'annotation-1' }],
      },
    });
  });
});

function articleRecord(annotations: Annotation[], updatedAt: string): ArticleRecord {
  return {
    id: 'article-1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    title: 'Article',
    byline: '',
    excerpt: '',
    contentHtml: '<p>Article text</p>',
    contentHash: 'hash-1',
    annotations,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt,
  };
}

function annotation(): Annotation {
  return {
    id: 'annotation-1',
    anchor: {
      exact: 'Article',
      prefix: '',
      suffix: '',
      start: 0,
      end: 7,
    },
    author: 'ai',
    color: '#f4c95d',
    comments: [
      {
        id: 'comment-1',
        author: 'ai',
        content: '',
        createdAt: '2026-05-04T00:00:00.000Z',
        pending: true,
      },
    ],
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}
