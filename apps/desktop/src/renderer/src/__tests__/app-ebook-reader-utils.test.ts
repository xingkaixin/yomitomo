// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { configureFoliateView } from '../app-ebook-reader-utils';

describe('configureFoliateView', () => {
  it('keeps foliate page turns immediate', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setAttribute('animated', '');
    renderer.setStyles = vi.fn();

    configureFoliateView({ renderer } as Parameters<typeof configureFoliateView>[0], {
      fontSize: 18,
      contentWidth: 720,
    });

    expect(renderer.hasAttribute('animated')).toBe(false);
    expect(renderer.getAttribute('flow')).toBe('paginated');
  });
});
