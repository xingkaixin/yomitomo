// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLibraryCatalog } from './use-library-catalog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('invalidates the current catalog page when an article patch changes the shell revision', async () => {
  const listLibraryCatalog = vi.fn(async () => ({
    entities: [],
    itemCounts: { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 },
    page: 1,
    pageSize: 12,
    query: '',
    totalCount: 0,
    unfilteredCount: 0,
  }));
  vi.stubGlobal('yomitomoDesktop', { listLibraryCatalog });
  const view = render(<Harness articles={[]} />);
  await waitFor(() => expect(listLibraryCatalog).toHaveBeenCalledOnce());

  view.rerender(<Harness articles={[{ id: 'article_1', updatedAt: '2026-07-15' }]} />);

  await waitFor(() => expect(listLibraryCatalog).toHaveBeenCalledTimes(2));
});

function Harness({ articles }: { articles: unknown }) {
  useLibraryCatalog(
    { scope: { kind: 'library' }, page: 1, pageSize: 12 },
    {
      articles,
      collectionMembers: null,
      collections: null,
      pins: null,
      wereadBooks: null,
    },
  );
  return null;
}
