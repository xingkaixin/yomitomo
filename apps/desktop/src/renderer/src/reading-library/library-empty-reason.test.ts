import { describe, expect, it } from 'vitest';
import { libraryEmptyReason } from './library-empty-reason';

describe('libraryEmptyReason', () => {
  it('returns first use when the library has no unfiltered items', () => {
    expect(
      libraryEmptyReason({
        scope: 'library',
        unfilteredCount: 0,
        selectedType: null,
        wereadConfigured: false,
      }),
    ).toEqual({ variant: 'first-use' });
  });

  it('returns collection state when an empty collection has no search query', () => {
    expect(
      libraryEmptyReason({
        scope: 'collection',
        filteredCount: 0,
        libraryHasItems: true,
        searchQuery: '',
      }),
    ).toEqual({ variant: 'collection', libraryHasItems: true });
    expect(
      libraryEmptyReason({
        scope: 'collection',
        filteredCount: 0,
        libraryHasItems: false,
        searchQuery: '',
      }),
    ).toEqual({ variant: 'collection', libraryHasItems: false });
    expect(
      libraryEmptyReason({
        scope: 'collection',
        filteredCount: 0,
        libraryHasItems: true,
        searchQuery: '   ',
      }),
    ).toEqual({ variant: 'collection', libraryHasItems: true });
  });

  it('returns noMatch for library and collection searches with no results', () => {
    expect(
      libraryEmptyReason({
        scope: 'library',
        unfilteredCount: 3,
        selectedType: 'web',
        wereadConfigured: true,
      }),
    ).toEqual({ variant: 'message', messageKey: 'noMatch' });
    expect(
      libraryEmptyReason({
        scope: 'collection',
        filteredCount: 0,
        libraryHasItems: false,
        searchQuery: 'missing',
      }),
    ).toEqual({ variant: 'message', messageKey: 'noMatch' });
  });

  it('returns wereadSetup for an unavailable WeRead selection', () => {
    expect(
      libraryEmptyReason({
        scope: 'library',
        unfilteredCount: 0,
        selectedType: 'weread',
        wereadConfigured: false,
      }),
    ).toEqual({ variant: 'message', messageKey: 'wereadSetup' });
  });
});
