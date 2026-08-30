// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18next from 'i18next';
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
      annotations: {
        onDistillationCommitted: vi.fn(),
      },
      library: {
        distillations: {
          list: listDistillationLibrary,
        },
      },
    },
  });
});

afterEach(cleanup);

describe('DistillationLibrary', () => {
  it('shows published thoughts and opens their original annotations', async () => {
    listDistillationLibrary.mockResolvedValue(libraryResult());
    const onOpenEvidenceSource = vi.fn();
    render(<DistillationLibrary onOpenEvidenceSource={onOpenEvidenceSource} />);

    expect(await screen.findByText('Good modules hide complexity.')).toBeTruthy();
    expect(screen.getByText('The Deep Module')).toBeTruthy();
    expect(screen.getByText('A narrow interface hides substantial complexity.')).toBeTruthy();
    expect(screen.getByText(i18next.t('readingEvidence.authors.aiAssisted'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: i18next.t('readingEvidence.openSource') }));
    expect(onOpenEvidenceSource).toHaveBeenLastCalledWith({
      articleId: 'article_1',
      annotationId: 'annotation_1',
    });
    fireEvent.click(
      screen.getByRole('button', { name: i18next.t('readingEvidence.openDiscussion') }),
    );
    expect(onOpenEvidenceSource).toHaveBeenLastCalledWith({
      articleId: 'article_1',
      annotationId: 'annotation_1',
      view: 'discussion',
    });
  });

  it('debounces search and distinguishes no matches from an empty library', async () => {
    listDistillationLibrary.mockResolvedValueOnce(libraryResult()).mockResolvedValueOnce({
      ...libraryResult(),
      items: [],
      query: '边界',
      totalCount: 0,
      unfilteredCount: 1,
    });
    render(<DistillationLibrary onOpenEvidenceSource={vi.fn()} />);
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
