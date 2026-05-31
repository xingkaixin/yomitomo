// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeDesktopReaderSettings, writeDesktopReaderSettings } from '../app-reader-settings';

afterEach(() => {
  window.localStorage.clear();
});

describe('desktop reader settings', () => {
  it('notifies open readers when paper settings change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDesktopReaderSettings(listener);

    writeDesktopReaderSettings({
      fontSize: 20,
      contentWidth: 860,
      backgroundColor: '#242019',
    });

    expect(listener).toHaveBeenCalledWith({
      fontSize: 20,
      contentWidth: 860,
      backgroundColor: '#242019',
    });

    unsubscribe();
  });
});
