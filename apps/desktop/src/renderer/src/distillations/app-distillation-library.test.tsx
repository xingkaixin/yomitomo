// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DistillationLibraryListResult } from '../../../ipc-contract';
import { initializeAppI18n } from '../i18n/app-i18n';
import { DistillationLibrary } from './app-distillation-library';

const listDistillationLibrary = vi.fn();

beforeEach(() => {
  initializeAppI18n('zh-CN');
  listDistillationLibrary.mockReset();
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      listDistillationLibrary,
      onAnnotationDistillationCommitted: vi.fn(),
    },
  });
});

afterEach(cleanup);

describe('DistillationLibrary', () => {
  it('shows published thoughts and opens their original annotations', async () => {
    listDistillationLibrary.mockResolvedValue(libraryResult());
    const onOpenOriginal = vi.fn();
    render(<DistillationLibrary onOpenOriginal={onOpenOriginal} />);

    expect(await screen.findByText('Good modules hide complexity.')).toBeTruthy();
    expect(screen.getByText('The Deep Module')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '回到原批注' }));
    expect(onOpenOriginal).toHaveBeenCalledWith('article_1', 'annotation_1');
  });

  it('debounces search and distinguishes no matches from an empty library', async () => {
    listDistillationLibrary.mockResolvedValueOnce(libraryResult()).mockResolvedValueOnce({
      ...libraryResult(),
      items: [],
      query: '边界',
      totalCount: 0,
      unfilteredCount: 1,
    });
    render(<DistillationLibrary onOpenOriginal={vi.fn()} />);
    await screen.findByText('Good modules hide complexity.');

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索沉淀' }), {
      target: { value: '边界' },
    });

    expect(await screen.findByText('没有找到“边界”')).toBeTruthy();
    await waitFor(() =>
      expect(listDistillationLibrary).toHaveBeenLastCalledWith({
        page: 1,
        pageSize: 12,
        query: '边界',
      }),
    );
  });
});

function libraryResult(): DistillationLibraryListResult {
  return {
    items: [
      {
        annotationId: 'annotation_1',
        articleId: 'article_1',
        articleTitle: 'The Deep Module',
        articleByline: 'A. Reader',
        sourceType: 'ebook',
        anchorText: 'A narrow interface hides substantial complexity.',
        content: 'Good modules hide complexity.',
        publishedAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
    ],
    page: 1,
    pageSize: 12,
    query: '',
    totalCount: 1,
    unfilteredCount: 1,
  };
}
