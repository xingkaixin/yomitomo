// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebReadingProgressFrame } from '../source/web/web-reading-progress-frame';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createWebReadingProgressFrame', () => {
  it('commits only the latest progress scheduled in a frame', () => {
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const commitProgress = vi.fn();
    const progressFrame = createWebReadingProgressFrame(commitProgress);

    progressFrame.schedule(0.2);
    progressFrame.schedule(0.6);

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(commitProgress).not.toHaveBeenCalled();

    frames[0]?.(16);

    expect(commitProgress).toHaveBeenCalledOnce();
    expect(commitProgress).toHaveBeenLastCalledWith(0.6);

    progressFrame.schedule(0.8);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending progress update', () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7),
    );
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const progressFrame = createWebReadingProgressFrame(vi.fn());

    progressFrame.schedule(0.4);
    progressFrame.cancel();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
});
