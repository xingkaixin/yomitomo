// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  logReaderSelectionDebug,
  readerSelectionDebugEnabled,
  READER_SELECTION_DEBUG_STORAGE_KEY,
} from '../source/web/web-reader-selection-debug';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('reader selection diagnostics', () => {
  it('does not read diagnostic details without an explicit switch', () => {
    const readDetails = vi.fn(() => ({ selection: 'expensive snapshot' }));
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const recordPerformanceTiming = installDesktopPerformanceRecorder();

    expect(readerSelectionDebugEnabled()).toBe(false);
    logReaderSelectionDebug('selectionchange', readDetails);

    expect(readDetails).not.toHaveBeenCalled();
    expect(consoleDebug).not.toHaveBeenCalled();
    expect(recordPerformanceTiming).not.toHaveBeenCalled();
  });

  it('reads and records details when localStorage enables diagnostics', () => {
    window.localStorage.setItem(READER_SELECTION_DEBUG_STORAGE_KEY, '1');
    const details = { selection: 'snapshot' };
    const readDetails = vi.fn(() => details);
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const recordPerformanceTiming = installDesktopPerformanceRecorder();

    expect(readerSelectionDebugEnabled()).toBe(true);
    logReaderSelectionDebug('selection change', readDetails);

    expect(readDetails).toHaveBeenCalledOnce();
    expect(consoleDebug).toHaveBeenCalledWith('[reader-selection]', 'selection change', details);
    expect(recordPerformanceTiming).toHaveBeenCalledWith({
      event: 'reader_selection.selection_change',
      data: details,
    });
  });
});

function installDesktopPerformanceRecorder() {
  const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: { recordPerformanceTiming },
  });
  return recordPerformanceTiming;
}
