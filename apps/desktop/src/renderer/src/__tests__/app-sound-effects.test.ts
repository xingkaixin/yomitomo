// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playAppSoundEffect } from '../sound/app-sound-effects';

const play = vi.fn().mockResolvedValue(undefined);
const createdAudio: Array<{ currentTime: number; play: typeof play; src: string; volume: number }> =
  [];

class MockAudio {
  currentTime = 0;
  volume = 1;

  constructor(public src: string) {
    createdAudio.push(this);
  }

  play = play;
}

afterEach(() => {
  play.mockClear();
  createdAudio.length = 0;
});

describe('app sound effects', () => {
  it('skips playback when app sound effects are disabled', () => {
    vi.stubGlobal('Audio', MockAudio);

    playAppSoundEffect('theme.paper_switch', {
      soundEffectsEnabled: false,
      soundEffectsVolume: 1,
    });

    expect(play).not.toHaveBeenCalled();
    expect(createdAudio).toHaveLength(0);
  });

  it('applies global volume as a multiplier over the effect base volume', () => {
    vi.stubGlobal('Audio', MockAudio);

    playAppSoundEffect('theme.paper_switch', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.5,
    });

    expect(createdAudio).toHaveLength(1);
    expect(createdAudio[0].volume).toBe(0.2);
    expect(createdAudio[0].currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays the settings preview at the global volume', () => {
    vi.stubGlobal('Audio', MockAudio);

    playAppSoundEffect('settings.sound_preview', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });

    expect(createdAudio.at(-1)?.volume).toBe(0.35);
    expect(play).toHaveBeenCalledTimes(1);
  });
});
