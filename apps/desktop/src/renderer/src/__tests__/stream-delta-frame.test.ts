// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStreamDeltaFrame } from '../lib/stream-delta-frame';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createStreamDeltaFrame', () => {
  it('commits accumulated deltas once per animation frame', () => {
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const commitDelta = vi.fn();
    const stream = createStreamDeltaFrame(commitDelta);

    stream.append('第一段');
    stream.append('第二段');

    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(commitDelta).not.toHaveBeenCalled();

    frames[0]?.(16);

    expect(commitDelta).toHaveBeenCalledWith('第一段第二段', '第一段第二段');
    expect(stream.streamedContent).toBe('第一段第二段');

    stream.append('第三段');
    frames[1]?.(32);

    expect(commitDelta).toHaveBeenLastCalledWith('第三段', '第一段第二段第三段');
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it('flushes pending content synchronously and cancels its frame', () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 7),
    );
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const commitDelta = vi.fn();
    const stream = createStreamDeltaFrame(commitDelta);

    stream.append('待提交');
    stream.flush();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(commitDelta).toHaveBeenCalledWith('待提交', '待提交');
    expect(stream.streamedContent).toBe('待提交');
  });

  it('discards pending content when canceled', () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 9),
    );
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const commitDelta = vi.fn();
    const stream = createStreamDeltaFrame(commitDelta);

    stream.append('不应提交');
    stream.cancel();
    stream.flush();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(9);
    expect(commitDelta).not.toHaveBeenCalled();
    expect(stream.streamedContent).toBe('');
  });
});
