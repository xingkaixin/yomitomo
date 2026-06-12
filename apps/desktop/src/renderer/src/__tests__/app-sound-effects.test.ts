// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { playAppSoundEffect } from '../sound/app-sound-effects';

const play = vi.fn().mockResolvedValue(undefined);
const createdAudio: MockAudio[] = [];

class MockAudio {
  currentTime = 0;
  ended = false;
  paused = true;
  volume = 1;
  private listeners = new Map<string, Set<() => void>>();

  constructor(public src: string) {
    createdAudio.push(this);
  }

  play = vi.fn(() => {
    this.ended = false;
    this.paused = false;
    return play();
  });

  addEventListener(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) || new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  finishPlayback() {
    this.ended = true;
    this.paused = true;
    for (const listener of this.listeners.get('ended') || []) listener();
  }
}

afterEach(() => {
  play.mockClear();
  createdAudio.length = 0;
  vi.restoreAllMocks();
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

  it('skips repeated brand pronunciation while the current playback is active', () => {
    vi.stubGlobal('Audio', MockAudio);

    playAppSoundEffect('brand.pronunciation', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 1,
    });
    playAppSoundEffect('brand.pronunciation', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 1,
    });

    expect(createdAudio).toHaveLength(1);
    expect(play).toHaveBeenCalledTimes(1);

    createdAudio[0].finishPlayback();
    playAppSoundEffect('brand.pronunciation', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 1,
    });

    expect(createdAudio).toHaveLength(1);
    expect(play).toHaveBeenCalledTimes(2);
    createdAudio[0].finishPlayback();
  });

  it('plays the library delete effect with its base volume', () => {
    vi.stubGlobal('Audio', MockAudio);

    playAppSoundEffect('library.delete_item', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.5,
    });

    expect(createdAudio.at(-1)?.volume).toBe(0.4);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('plays import success effects with the shared base volume', () => {
    vi.stubGlobal('Audio', MockAudio);

    playAppSoundEffect('library.import_success_single', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.5,
    });
    playAppSoundEffect('library.import_success_multiple', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.25,
    });

    expect(createdAudio[0].volume).toBe(0.4);
    expect(createdAudio[1].volume).toBe(0.2);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('randomly chooses a highlight creation variant at the shared volume', () => {
    vi.stubGlobal('Audio', MockAudio);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);

    playAppSoundEffect('reader.annotation_created', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.5,
    });
    playAppSoundEffect('reader.annotation_created', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.5,
    });

    expect(createdAudio).toHaveLength(2);
    expect(new Set(createdAudio.map((audio) => audio.src)).size).toBe(2);
    expect(createdAudio[0].volume).toBe(0.375);
    expect(createdAudio[1].volume).toBe(0.375);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
