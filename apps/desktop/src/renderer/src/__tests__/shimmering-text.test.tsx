// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ShimmeringText } from '../components/ui/shimmering-text';

afterEach(cleanup);

describe('ShimmeringText', () => {
  it('renders a CSS-controlled shimmer without per-character spans', () => {
    const { container } = render(<ShimmeringText text="滑动解锁" duration={2.5} />);

    const text = screen.getByText('滑动解锁');

    expect(text.classList.contains('shimmering-text')).toBe(true);
    expect(text.getAttribute('data-text')).toBe('滑动解锁');
    expect(text.getAttribute('data-shimmer')).toBe('running');
    expect(text.getAttribute('style')).toContain('--shimmer-dur: 2.5s');
    expect(container.querySelector('.shimmering-text-char')).toBeNull();
  });

  it('marks the shimmer as paused while dragging', () => {
    render(<ShimmeringText text="滑动解锁" isStopped />);

    expect(screen.getByText('滑动解锁').getAttribute('data-shimmer')).toBe('paused');
  });
});
