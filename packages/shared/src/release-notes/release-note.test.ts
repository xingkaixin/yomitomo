import { describe, expect, it } from 'vitest';
import { compareVersions, shouldShowAfterUpdate } from './release-note';

describe('compareVersions', () => {
  it('compares segments numerically, not lexically', () => {
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
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
});
