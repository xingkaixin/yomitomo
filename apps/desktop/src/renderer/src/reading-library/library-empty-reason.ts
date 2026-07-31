import type { LibraryTypeFilter } from './library-filter-types';

export type LibraryEmptyMessageKey = 'noMatch' | 'wereadSetup';

export type LibraryEmptyReason =
  | { variant: 'first-use' }
  | { variant: 'collection'; libraryHasItems: boolean }
  | { variant: 'message'; messageKey: LibraryEmptyMessageKey };

type LibraryEmptyReasonInput =
  | {
      scope: 'collection';
      filteredCount: number;
      libraryHasItems: boolean;
      searchQuery: string;
    }
  | {
      scope: 'library';
      unfilteredCount: number;
      selectedType: LibraryTypeFilter | null;
      wereadConfigured: boolean;
    };

export function libraryEmptyReason(input: LibraryEmptyReasonInput): LibraryEmptyReason {
  if (input.scope === 'collection') return collectionEmptyReason(input);
  if (input.selectedType === 'weread' && !input.wereadConfigured) {
    return { variant: 'message', messageKey: 'wereadSetup' };
  }
  if (input.unfilteredCount === 0) return { variant: 'first-use' };
  return { variant: 'message', messageKey: 'noMatch' };
}

function collectionEmptyReason(
  input: Extract<LibraryEmptyReasonInput, { scope: 'collection' }>,
): LibraryEmptyReason {
  if (input.filteredCount === 0 && input.searchQuery.trim()) {
    return { variant: 'message', messageKey: 'noMatch' };
  }
  return { variant: 'collection', libraryHasItems: input.libraryHasItems };
}
