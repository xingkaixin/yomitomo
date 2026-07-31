import { describe, expect, it } from 'vitest';
import {
  createLibraryQuerySessionState,
  libraryQuerySessionReducer,
  type LibraryQuerySessionEvent,
} from './library-query-session';

describe('libraryQuerySessionReducer', () => {
  it('resets the page and transitions for query, type, and page-size changes', () => {
    const state = sessionState({
      page: 3,
      listTransition: 'forward',
      pageTransition: 'forward',
    });

    const queryChanged = reduce(state, { type: 'query-changed', query: 'reader' });
    const typeToggled = reduce(state, { type: 'type-toggled', value: 'web', availableCount: 4 });
    const typesReset = reduce(
      sessionState({
        selectedTypes: new Set(['web']),
        page: 3,
        listTransition: 'forward',
        pageTransition: 'backward',
      }),
      { type: 'types-reset' },
    );
    const pageSizeChanged = reduce(state, { type: 'page-size-changed', pageSize: 24 });

    expect(queryChanged).toMatchObject({
      searchQuery: 'reader',
      page: 1,
      listTransition: 'none',
      pageTransition: 'none',
    });
    expect(typeToggled).toMatchObject({ page: 1, listTransition: 'none', pageTransition: 'none' });
    expect(typesReset).toMatchObject({ page: 1, listTransition: 'none', pageTransition: 'none' });
    expect(typesReset.selectedTypes).toEqual(new Set());
    expect(pageSizeChanged).toMatchObject({
      page: 1,
      pageSize: 24,
      listTransition: 'none',
      pageTransition: 'none',
    });
  });

  it('collapses a full type selection and prunes invalid types without changing transitions', () => {
    const selected = reduce(sessionState(), {
      type: 'type-toggled',
      value: 'web',
      availableCount: 1,
    });
    const pruned = reduce(
      sessionState({
        selectedTypes: new Set(['web', 'weread']),
        listTransition: 'forward',
        pageTransition: 'backward',
      }),
      { type: 'types-pruned', available: new Set(['web']) },
    );

    expect(selected.selectedTypes).toEqual(new Set());
    expect(pruned).toMatchObject({ listTransition: 'forward', pageTransition: 'backward' });
    expect(pruned.selectedTypes).toEqual(new Set(['web']));
  });

  it('models collection navigation and removal as closed scope transitions', () => {
    const opened = reduce(sessionState({ page: 2 }), {
      type: 'collection-opened',
      collectionId: 'collection_1',
    });
    const closed = reduce(opened, { type: 'collection-closed' });
    const removed = reduce(
      sessionState({
        scope: { kind: 'collection', collectionId: 'collection_1' },
        page: 2,
        listTransition: 'forward',
      }),
      { type: 'collection-removed', existingIds: new Set() },
    );
    const locallyClosedAfterRemoval = reduce(removed, { type: 'collection-closed' });

    expect(opened).toMatchObject({
      scope: { kind: 'collection', collectionId: 'collection_1' },
      page: 1,
      listTransition: 'forward',
    });
    expect(closed).toMatchObject({
      scope: { kind: 'library' },
      page: 1,
      listTransition: 'backward',
    });
    expect(removed).toMatchObject({
      scope: { kind: 'library' },
      page: 1,
      listTransition: 'none',
      pageTransition: 'none',
    });
    expect(locallyClosedAfterRemoval).toMatchObject({
      scope: { kind: 'library' },
      page: 1,
      listTransition: 'backward',
      pageTransition: 'none',
    });
  });

  it('normalizes page values, describes page direction, and clamps to page count', () => {
    const invalid = createLibraryQuerySessionState({
      activeCollectionId: null,
      page: Number.POSITIVE_INFINITY,
      pageSize: 100,
      searchQuery: '',
      selectedTypes: new Set(),
    });
    const forward = reduce(sessionState({ page: 2 }), { type: 'page-changed', page: 4 });
    const backward = reduce(forward, { type: 'page-changed', page: 1 });
    const unchangedPage = reduce(sessionState({ page: 2, pageTransition: 'forward' }), {
      type: 'page-changed',
      page: 2,
    });
    const clamped = reduce(sessionState({ page: 5, pageTransition: 'forward' }), {
      type: 'page-clamped',
      pageCount: 2,
    });

    expect(invalid).toMatchObject({ page: 1, pageSize: 12 });
    expect(forward).toMatchObject({ page: 4, pageTransition: 'forward' });
    expect(backward).toMatchObject({ page: 1, pageTransition: 'backward' });
    expect(unchangedPage).toMatchObject({ page: 2, pageTransition: 'none' });
    expect(clamped).toMatchObject({ page: 2, pageTransition: 'none' });
  });

  it('preserves the state object for semantic no-op events', () => {
    const state = sessionState();
    const closed = sessionState({ listTransition: 'backward' });

    expect(reduce(state, { type: 'query-changed', query: '' })).toBe(state);
    expect(reduce(state, { type: 'types-reset' })).toBe(state);
    expect(reduce(closed, { type: 'collection-closed' })).toBe(closed);
    expect(reduce(state, { type: 'page-changed', page: 1 })).toBe(state);
    expect(reduce(state, { type: 'page-size-changed', pageSize: 12 })).toBe(state);
  });
});

function sessionState(overrides: Partial<ReturnType<typeof createLibraryQuerySessionState>> = {}) {
  return {
    ...createLibraryQuerySessionState({
      activeCollectionId: null,
      pageSize: 12,
      searchQuery: '',
      selectedTypes: new Set(),
    }),
    ...overrides,
  };
}

function reduce(
  state: ReturnType<typeof createLibraryQuerySessionState>,
  event: LibraryQuerySessionEvent,
) {
  return libraryQuerySessionReducer(state, event);
}
