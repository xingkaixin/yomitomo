// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type ReaderSearchNavigationOptions,
  useReaderSearchNavigation,
} from './use-reader-search-navigation';

type ReaderSearchNavigation = ReturnType<typeof useReaderSearchNavigation>;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useReaderSearchNavigation', () => {
  it('returns null activeMatch for empty text, empty query, and no matches', async () => {
    vi.useFakeTimers();
    const latest = renderNavigation({ text: '' });

    expect(latest.current?.activeMatch).toBeNull();

    act(() => {
      latest.current?.navigateSearchMatch('next');
      latest.current?.navigateSearchMatch('previous');
    });

    expect(latest.current?.activeMatchIndex).toBe(0);

    act(() => {
      latest.current?.setQuery('missing');
    });
    await settleSearchDebounce();

    expect(latest.current?.matches).toHaveLength(0);
    expect(latest.current?.activeMatch).toBeNull();

    act(() => {
      latest.current?.navigateSearchMatch('next');
      latest.current?.navigateSearchMatch('previous');
    });

    expect(latest.current?.activeMatchIndex).toBe(0);
  });

  it('keeps the active index at 0 for a single match', async () => {
    vi.useFakeTimers();
    const latest = renderNavigation({ text: 'alpha beta' });

    act(() => {
      latest.current?.setQuery('alpha');
    });
    await settleSearchDebounce();

    expect(latest.current?.matches).toHaveLength(1);

    act(() => {
      latest.current?.navigateSearchMatch('next');
      latest.current?.navigateSearchMatch('previous');
    });

    expect(latest.current?.activeMatchIndex).toBe(0);
    expect(latest.current?.activeMatch).toMatchObject({ start: 0, end: 5 });
  });

  it('wraps next and previous navigation across multiple matches', async () => {
    vi.useFakeTimers();
    const latest = renderNavigation({ text: 'alpha alpha alpha' });

    act(() => {
      latest.current?.setQuery('alpha');
    });
    await settleSearchDebounce();

    expect(latest.current?.matches).toHaveLength(3);

    act(() => {
      latest.current?.navigateSearchMatch('previous');
    });
    expect(latest.current?.activeMatchIndex).toBe(2);

    act(() => {
      latest.current?.navigateSearchMatch('next');
    });
    expect(latest.current?.activeMatchIndex).toBe(0);

    act(() => {
      latest.current?.navigateSearchMatch('next');
      latest.current?.navigateSearchMatch('next');
      latest.current?.navigateSearchMatch('next');
    });
    expect(latest.current?.activeMatchIndex).toBe(0);
  });

  it('updates debounced matches on query change and resets the active index', async () => {
    vi.useFakeTimers();
    const latest = renderNavigation({ text: 'alpha alpha beta beta' });

    act(() => {
      latest.current?.setQuery('alpha');
    });
    await settleSearchDebounce();

    expect(latest.current?.matchedQuery).toBe('alpha');
    expect(latest.current?.matches.map(({ start, end }) => [start, end])).toEqual([
      [0, 5],
      [6, 11],
    ]);

    act(() => {
      latest.current?.navigateSearchMatch('next');
    });
    expect(latest.current?.activeMatchIndex).toBe(1);

    act(() => {
      latest.current?.setQuery('beta');
    });

    expect(latest.current?.matchedQuery).toBe('alpha');

    await settleSearchDebounce();

    expect(latest.current?.matchedQuery).toBe('beta');
    expect(latest.current?.matches.map(({ start, end }) => [start, end])).toEqual([
      [12, 16],
      [17, 21],
    ]);
    expect(latest.current?.activeMatchIndex).toBe(0);
  });

  it('closes search without clearing the query and calls onClose', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const latest = renderNavigation({ options: { onClose }, text: 'alpha' });

    act(() => {
      latest.current?.openSearch();
      latest.current?.setQuery('alpha');
    });
    await settleSearchDebounce();

    act(() => {
      latest.current?.closeSearch();
    });

    expect(latest.current?.open).toBe(false);
    expect(latest.current?.query).toBe('alpha');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets search state and calls onClose', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const latest = renderNavigation({ options: { onClose }, text: 'alpha alpha' });

    act(() => {
      latest.current?.openSearch();
      latest.current?.setQuery('alpha');
    });
    await settleSearchDebounce();

    act(() => {
      latest.current?.navigateSearchMatch('next');
    });
    expect(latest.current?.activeMatchIndex).toBe(1);

    act(() => {
      latest.current?.resetSearch();
    });

    expect(latest.current?.open).toBe(false);
    expect(latest.current?.query).toBe('');
    expect(latest.current?.activeMatchIndex).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses externalPreparing only when the query is not blank', () => {
    const latest = renderNavigation({ options: { externalPreparing: true }, text: 'alpha' });

    expect(latest.current?.preparing).toBe(false);

    act(() => {
      latest.current?.setQuery('   ');
    });
    expect(latest.current?.preparing).toBe(false);

    act(() => {
      latest.current?.setQuery('alpha');
    });
    expect(latest.current?.preparing).toBe(true);
  });

  it('returns a reader toolbar search object wired to the hook state', async () => {
    vi.useFakeTimers();
    const latest = renderNavigation({ text: 'alpha alpha' });

    act(() => {
      latest.current?.search.onOpen();
      latest.current?.search.onQueryChange('alpha');
    });
    await settleSearchDebounce();

    expect(latest.current?.search.open).toBe(true);
    expect(latest.current?.search.query).toBe('alpha');
    expect(latest.current?.search.matches).toHaveLength(2);

    act(() => {
      latest.current?.search.onNextMatch();
    });
    expect(latest.current?.search.activeMatchIndex).toBe(1);

    act(() => {
      latest.current?.search.onPreviousMatch();
    });
    expect(latest.current?.search.activeMatchIndex).toBe(0);
  });
});

function renderNavigation({
  options,
  text,
}: {
  options?: ReaderSearchNavigationOptions;
  text: string;
}) {
  const latest: { current?: ReaderSearchNavigation } = {};

  function Harness() {
    latest.current = useReaderSearchNavigation(text, options);
    return null;
  }

  render(<Harness />);
  return latest;
}

async function settleSearchDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(220);
  });
}
