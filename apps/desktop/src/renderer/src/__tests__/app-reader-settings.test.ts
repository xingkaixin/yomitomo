// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readDesktopReaderBackgroundsByTone,
  subscribeDesktopReaderSettings,
  writeDesktopReaderSettings,
} from '../app-reader-settings';

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

  it('remembers the last reader paper for each tone', () => {
    writeDesktopReaderSettings({
      fontSize: 20,
      contentWidth: 860,
      backgroundColor: '#eef4e8',
    });
    writeDesktopReaderSettings({
      fontSize: 20,
      contentWidth: 860,
      backgroundColor: '#171a21',
    });

    expect(readDesktopReaderBackgroundsByTone()).toEqual({
      light: '#eef4e8',
      dark: '#171a21',
    });
  });

  it('falls back to tone defaults for invalid reader paper history', () => {
    window.localStorage.setItem(
      'yomitomo.desktop.readerBackgroundsByTone',
      JSON.stringify({ light: '#171a21', dark: '#eef4e8' }),
    );

    expect(readDesktopReaderBackgroundsByTone()).toEqual({
      light: '#fffdf8',
      dark: '#242019',
    });
  });
});
