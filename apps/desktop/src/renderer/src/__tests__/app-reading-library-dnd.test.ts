// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { dispatchLibraryDrop } from '../reading-library/app-reading-library-dnd';

describe('library drag and drop', () => {
  it('dispatches a content reference to a valid target', () => {
    const onDrop = vi.fn();
    const ref = { kind: 'article' as const, id: 'article_1' };

    expect(
      dispatchLibraryDrop(
        { kind: 'library-content', ref, title: 'Article' },
        { kind: 'library-drop-target', label: 'Collection', onDrop },
      ),
    ).toBe(true);
    expect(onDrop).toHaveBeenCalledOnce();
    expect(onDrop).toHaveBeenCalledWith(ref);
  });

  it('ignores canceled or malformed drop data', () => {
    const onDrop = vi.fn();

    expect(dispatchLibraryDrop(null, null)).toBe(false);
    expect(
      dispatchLibraryDrop(
        { kind: 'unknown' },
        { kind: 'library-drop-target', label: 'Collection', onDrop },
      ),
    ).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
