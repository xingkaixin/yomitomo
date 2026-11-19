// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAppI18n } from '../i18n/app-i18n';
import { WeReadReaderCompact, WeReadReaderFull } from './app-weread-reader-pane';

const desktopApi = vi.hoisted(() => ({
  closeReader: vi.fn(async () => undefined),
  setReaderBounds: vi.fn(async () => undefined),
  turnReaderPage: vi.fn(async () => undefined),
}));

vi.mock('./app-desktop-api', () => ({
  getDesktopApi: () => ({
    weRead: desktopApi,
  }),
}));

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

beforeEach(() => {
  initializeAppI18n('zh-CN');
  vi.clearAllMocks();
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 40,
    y: 64,
    left: 40,
    top: 64,
    right: 840,
    bottom: 664,
    width: 800,
    height: 600,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WeRead reader pane modal avoidance', () => {
  it('hides the native view without closing when obscured and restores bounds when cleared', async () => {
    const { rerender } = render(<WeReadReaderFull obscured={false} />);

    await waitFor(() =>
      expect(desktopApi.setReaderBounds).toHaveBeenCalledWith({
        x: 40,
        y: 64,
        width: 800,
        height: 600,
        compact: false,
      }),
    );

    desktopApi.setReaderBounds.mockClear();
    rerender(<WeReadReaderFull obscured />);
    expect(desktopApi.setReaderBounds).toHaveBeenCalledWith(null);
    expect(desktopApi.closeReader).not.toHaveBeenCalled();

    desktopApi.setReaderBounds.mockClear();
    rerender(<WeReadReaderFull obscured={false} />);
    await waitFor(() =>
      expect(desktopApi.setReaderBounds).toHaveBeenCalledWith({
        x: 40,
        y: 64,
        width: 800,
        height: 600,
        compact: false,
      }),
    );
  });

  it('suspends compact page-turn shortcuts while obscured by a modal', async () => {
    const { rerender } = render(
      <WeReadReaderCompact obscured={false} onClose={vi.fn()} onExpand={vi.fn()} />,
    );
    await waitFor(() => expect(desktopApi.setReaderBounds).toHaveBeenCalled());

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(desktopApi.turnReaderPage).toHaveBeenCalledWith('right');

    desktopApi.turnReaderPage.mockClear();
    rerender(<WeReadReaderCompact obscured onClose={vi.fn()} onExpand={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(desktopApi.turnReaderPage).not.toHaveBeenCalled();
  });
});
