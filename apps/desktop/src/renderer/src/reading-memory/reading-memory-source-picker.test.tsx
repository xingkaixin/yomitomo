// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTICLE_SOURCE_TYPES } from '@yomitomo/shared';
import {
  readingLibrarySourceLimit,
  type LibraryCatalogEntity,
  type LibraryCatalogListInput,
  type LibraryCatalogListResult,
} from '../../../ipc-contract';
import {
  ReadingMemorySourcePicker,
  type ReadingMemorySourceSelection,
} from './reading-memory-source-picker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const keys = 'readingMemory.library.sourcePicker';

function source(id: string, title = id): ReadingMemorySourceSelection {
  return { ref: { kind: 'article', id }, title };
}

function catalogItem(id: string): LibraryCatalogEntity {
  return {
    kind: 'item',
    source: 'article',
    pinned: false,
    sortTime: '2026-08-30T00:00:00Z',
    article: {
      id,
      title: id,
      sourceType: 'web',
      byline: 'Author',
      url: `https://example.com/${id}`,
      canonicalUrl: `https://example.com/${id}`,
      contentHash: id,
      createdAt: '2026-08-30T00:00:00Z',
      updatedAt: '2026-08-30T00:00:00Z',
      counts: {
        annotationCount: 1,
        thoughtCount: 1,
        discussionCommentCount: 1,
        aiCommentCount: 0,
        distillationCount: 0,
      },
    },
  };
}

function catalog(
  input: LibraryCatalogListInput,
  entities: LibraryCatalogEntity[],
  totalCount = entities.length,
): LibraryCatalogListResult {
  return {
    entities,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 30,
    query: input.query ?? '',
    totalCount,
    unfilteredCount: totalCount,
    itemCounts: { web: totalCount, ebook: 0, pdf: 0, text: 0, weread: 0 },
  };
}

function installApi(
  list = vi.fn(async (input: LibraryCatalogListInput) =>
    catalog(input, [catalogItem('first')], 31),
  ),
) {
  const addMembers = vi.fn();
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list }, collections: { addMembers } } });
  return { list, addMembers };
}

function renderPicker(selectedSources: ReadingMemorySourceSelection[] = []) {
  const props = { catalogRevision: 0, selectedSources, onConfirm: vi.fn(), onClose: vi.fn() };
  return { props, ...render(<ReadingMemorySourcePicker {...props} />) };
}

describe('ReadingMemorySourcePicker', () => {
  it('retains named selections across pages and searches and can remove an off-page source', async () => {
    const api = installApi(
      vi.fn(async (input: LibraryCatalogListInput) =>
        catalog(
          input,
          [catalogItem(input.query ? 'search-result' : input.page === 2 ? 'second' : 'first')],
          input.query ? 1 : 31,
        ),
      ),
    );
    const { props } = renderPicker([source('previous', 'Previously selected source')]);

    expect(screen.getByText('Previously selected source')).toBeTruthy();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'first' }));
    fireEvent.click(screen.getByRole('button', { name: 'library.pagination.next' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'second' }));
    fireEvent.change(screen.getByRole('searchbox', { name: `${keys}.searchLabel` }), {
      target: { value: 'query' },
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'search-result' }));
    expect(screen.getByRole('button', { name: `${keys}.remove second` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${keys}.remove first` }));
    fireEvent.click(screen.getByRole('button', { name: `${keys}.confirm` }));

    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith([
      source('previous', 'Previously selected source'),
      source('second'),
      source('search-result'),
    ]);
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(api.list).toHaveBeenLastCalledWith({
      scope: { kind: 'library' },
      types: [...ARTICLE_SOURCE_TYPES],
      query: 'query',
      page: 1,
      pageSize: 30,
    });
    expect(api.addMembers).not.toHaveBeenCalled();
  });

  it('lists only article sources and excludes collections and WeRead', async () => {
    const entities: LibraryCatalogEntity[] = [
      catalogItem('first'),
      {
        kind: 'col',
        collection: { id: 'collection', name: 'Hidden collection', createdAt: '', updatedAt: '' },
        coverMembers: [],
        memberCount: 0,
        pinned: false,
        sortTime: '',
      },
      {
        kind: 'item',
        source: 'weread',
        weread: {
          bookId: 'book',
          title: 'Hidden WeRead book',
          author: '',
          reviewCount: 0,
          noteCount: 0,
          bookmarkCount: 0,
          readingProgress: 0,
          updatedAt: '',
        },
        pinned: false,
        sortTime: '',
      },
    ];
    const { list } = installApi(
      vi.fn(async (input: LibraryCatalogListInput) => catalog(input, entities)),
    );
    renderPicker();

    expect(await screen.findByRole('checkbox', { name: 'first' })).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByText('Hidden collection')).toBeNull();
    expect(screen.queryByText('Hidden WeRead book')).toBeNull();
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: 'library' }, types: [...ARTICLE_SOURCE_TYPES] }),
    );
  });

  it('discards edits on cancel and allows explicitly confirming an empty selection', async () => {
    const api = installApi();
    const selectedSources = [source('previous')];
    const view = renderPicker(selectedSources);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'first' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(view.props.onConfirm).not.toHaveBeenCalled();
    expect(view.props.onClose).toHaveBeenCalledOnce();
    expect(selectedSources).toEqual([source('previous')]);
    view.unmount();
    const next = renderPicker(selectedSources);
    fireEvent.click(screen.getByRole('button', { name: `${keys}.remove previous` }));
    fireEvent.click(screen.getByRole('button', { name: `${keys}.confirm` }));
    expect(next.props.onConfirm).toHaveBeenCalledExactlyOnceWith([]);
    expect(api.addMembers).not.toHaveBeenCalled();
  });

  it('disables stale search rows without preventing removal of selected sources', async () => {
    let finish!: (result: LibraryCatalogListResult) => void;
    const pending = new Promise<LibraryCatalogListResult>((resolve) => {
      finish = resolve;
    });
    installApi(
      vi.fn((input: LibraryCatalogListInput) =>
        input.query ? pending : Promise.resolve(catalog(input, [catalogItem('first')])),
      ),
    );
    const view = renderPicker([source('previous')]);
    await screen.findByRole('checkbox', { name: 'first' });
    fireEvent.change(screen.getByRole('searchbox', { name: `${keys}.searchLabel` }), {
      target: { value: 'pending' },
    });

    expect(screen.getByRole('checkbox', { name: 'first' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: `${keys}.remove previous` }));
    expect(screen.queryByRole('button', { name: `${keys}.remove previous` })).toBeNull();
    view.unmount();
    await act(async () => {
      finish(catalog({ scope: { kind: 'library' } }, [catalogItem('late')]));
    });
    expect(view.props.onConfirm).not.toHaveBeenCalled();
  });

  it('uses the shared source limit and keeps removal available at the limit', async () => {
    installApi();
    const selected = Array.from({ length: readingLibrarySourceLimit }, (_, index) =>
      source(`selected-${index}`),
    );
    const { props } = await act(async () => renderPicker(selected));
    const checkbox = screen.getByRole('checkbox', { name: 'first' });
    expect(checkbox.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(`${keys}.limitReached ${readingLibrarySourceLimit}`)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: `${keys}.remove selected-0` }));
    expect(checkbox.hasAttribute('disabled')).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: `${keys}.confirm` }));
    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith([
      ...selected.slice(1),
      source('first'),
    ]);
  });

  it('retries failed catalog reads without clearing selected sources', async () => {
    const list = vi
      .fn(async (input: LibraryCatalogListInput) => catalog(input, [catalogItem('first')]))
      .mockRejectedValueOnce(new Error('database unavailable'));
    installApi(list);
    renderPicker([source('previous')]);
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'library.catalog.loadFailed',
    );
    fireEvent.click(screen.getByRole('button', { name: `${keys}.retry` }));

    expect(await screen.findByRole('checkbox', { name: 'first' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `${keys}.remove previous` })).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });
});
