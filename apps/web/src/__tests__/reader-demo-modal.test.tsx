// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ReaderDemo from '../components/landing/ReaderDemo';

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  document.documentElement.style.setProperty('--modal-close-dur', '0ms');
});

afterEach(cleanup);

describe('reader demo discussion modal', () => {
  it('opens with focus and restores focus after the closing state', async () => {
    render(<ReaderDemo lang="zh-CN" />);
    const trigger = screen.getAllByRole('button', { name: /进入讨论区/ })[0];

    fireEvent.click(trigger);

    const dialog = await screen.findByRole('dialog');
    const closeButton = screen.getByRole('button', { name: '关闭' });
    await waitFor(() => expect(document.activeElement).toBe(closeButton));
    expect(dialog.closest('.dm-overlay')?.getAttribute('data-state')).toBe('open');

    fireEvent.click(closeButton);

    const overlay = dialog.closest('.dm-overlay');
    expect(overlay?.getAttribute('data-state')).toBe('closing');
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(trigger);
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).toBeNull());
  });
});
