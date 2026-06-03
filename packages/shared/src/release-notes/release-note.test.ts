import { describe, expect, it } from 'vitest';
import { compareVersions, selectHighlights, shouldShowAfterUpdate } from './release-note';
import type { UserFacingReleaseNote } from './release-note-types';

describe('compareVersions', () => {
  it('orders by numeric segments', () => {
    expect(compareVersions('0.6.0', '0.7.0')).toBe(-1);
    expect(compareVersions('0.7.0', '0.6.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('compares segments numerically, not lexically', () => {
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
  });

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
  });

  it('ignores prerelease and build suffixes', () => {
    expect(compareVersions('0.7.0-beta.1', '0.7.0')).toBe(0);
    expect(compareVersions('0.7.0+build5', '0.7.0')).toBe(0);
  });

  it('returns 0 when a version cannot be parsed', () => {
    expect(compareVersions('', '1.0.0')).toBe(0);
    expect(compareVersions('not-a-version', '1.0.0')).toBe(0);
  });
});

describe('shouldShowAfterUpdate', () => {
  it('shows when last seen version is lower than current (upgrade)', () => {
    expect(shouldShowAfterUpdate('0.6.0', '0.7.0')).toBe(true);
  });

  it('does not show on fresh install (no last seen version)', () => {
    expect(shouldShowAfterUpdate(undefined, '0.7.0')).toBe(false);
  });

  it('does not show when restarting the same version', () => {
    expect(shouldShowAfterUpdate('0.7.0', '0.7.0')).toBe(false);
  });

  it('does not show on downgrade', () => {
    expect(shouldShowAfterUpdate('0.8.0', '0.7.0')).toBe(false);
  });
});

describe('selectHighlights', () => {
  const note: UserFacingReleaseNote = {
    version: '0.7.0',
    highlights: [
      { type: 'new', title: 'A' },
      { type: 'changed', title: 'B' },
      { type: 'new', title: 'C' },
      { type: 'deprecated', title: 'D' },
      { type: 'fixed', title: 'E' },
      { type: 'new', title: 'F' },
    ],
  };

  it('drops fixed and caps at four for the before-update scene', () => {
    const result = selectHighlights(note, 'before-update');
    expect(result.map((highlight) => highlight.title)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('keeps the full list for the after-update scene', () => {
    const result = selectHighlights(note, 'after-update');
    expect(result).toHaveLength(6);
  });
});
