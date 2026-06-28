import { describe, expect, it } from 'vitest';
import {
  enabledLibraryContentSources,
  reorderLibraryContentSource,
  setLibraryContentSourceEnabled,
} from '../reading-library/app-library-content-sources';

describe('library content source preferences', () => {
  it('defaults to the current library source order', () => {
    expect(enabledLibraryContentSources({})).toEqual(['web', 'ebook', 'pdf', 'text', 'weread']);
  });

  it('keeps at least one source enabled', () => {
    const preferences = [
      { id: 'web' as const, enabled: true },
      { id: 'ebook' as const, enabled: false },
      { id: 'pdf' as const, enabled: false },
      { id: 'text' as const, enabled: false },
      { id: 'weread' as const, enabled: false },
    ];

    expect(setLibraryContentSourceEnabled(preferences, 'web', false)).toEqual(preferences);
  });

  it('keeps a re-enabled source in its current position', () => {
    const preferences = [
      { id: 'web' as const, enabled: true },
      { id: 'ebook' as const, enabled: false },
      { id: 'pdf' as const, enabled: true },
      { id: 'text' as const, enabled: false },
      { id: 'weread' as const, enabled: false },
    ];

    expect(setLibraryContentSourceEnabled(preferences, 'ebook', true)).toEqual([
      { id: 'web', enabled: true },
      { id: 'ebook', enabled: true },
      { id: 'pdf', enabled: true },
      { id: 'text', enabled: false },
      { id: 'weread', enabled: false },
    ]);
  });

  it('reorders enabled and disabled sources together', () => {
    expect(
      reorderLibraryContentSource(
        [
          { id: 'web', enabled: true },
          { id: 'ebook', enabled: false },
          { id: 'pdf', enabled: true },
          { id: 'text', enabled: false },
          { id: 'weread', enabled: true },
        ],
        'ebook',
        'weread',
      ),
    ).toEqual([
      { id: 'web', enabled: true },
      { id: 'pdf', enabled: true },
      { id: 'text', enabled: false },
      { id: 'ebook', enabled: false },
      { id: 'weread', enabled: true },
    ]);
  });
});
