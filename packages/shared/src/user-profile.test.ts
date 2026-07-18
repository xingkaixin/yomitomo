import { describe, expect, it } from 'vitest';
import { defaultUserProfile, normalizeUserProfile } from './user-profile';

describe('normalizeUserProfile', () => {
  it('returns the stable local user defaults when input is absent', () => {
    expect(normalizeUserProfile(undefined)).toEqual(defaultUserProfile);
    expect(defaultUserProfile.updatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('preserves supplied fields while restoring required identity defaults', () => {
    expect(
      normalizeUserProfile({
        id: '',
        nickname: '读者',
        annotationColor: '',
      }),
    ).toEqual({
      ...defaultUserProfile,
      nickname: '读者',
    });
  });
});
