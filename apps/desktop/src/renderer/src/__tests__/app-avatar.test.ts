// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { isImageAvatar, isSvgAvatar } from '../shell/app-avatar';

describe('app avatar', () => {
  it('distinguishes image and SVG avatar values', () => {
    expect(isImageAvatar('/avatar.png')).toBe(true);
    expect(isImageAvatar('file:///Applications/Yomitomo.app/avatar.webp')).toBe(true);
    expect(isImageAvatar('AI')).toBe(false);
    expect(isSvgAvatar('data:image/svg+xml,<svg />')).toBe(true);
    expect(isSvgAvatar('/avatar.png')).toBe(false);
  });
});
