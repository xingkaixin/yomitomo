import type { AppSettings } from '@yomitomo/shared';
import { normalizeSoundEffectsVolume } from '@yomitomo/shared';
import importSuccessMultipleSoundUrl from '../assets/audio/import-success-multiple.mp3';
import importSuccessSingleSoundUrl from '../assets/audio/import-success-single.mp3';
import paperBinTossSoundUrl from '../assets/audio/paper-bin-toss.mp3';
import scribbleCircleSoundUrl from '../assets/audio/scribble-circle.m4a';
import soundPreviewUrl from '../assets/audio/sound-preview.mp3';

export type AppSoundEffectId =
  | 'library.import_success_multiple'
  | 'library.import_success_single'
  | 'library.delete_item'
  | 'settings.sound_preview'
  | 'theme.paper_switch';

type SoundEffectDefinition = {
  baseVolume: number;
  url: string;
};

const soundEffects: Record<AppSoundEffectId, SoundEffectDefinition> = {
  'library.import_success_multiple': {
    baseVolume: 0.8,
    url: importSuccessMultipleSoundUrl,
  },
  'library.import_success_single': {
    baseVolume: 0.8,
    url: importSuccessSingleSoundUrl,
  },
  'library.delete_item': {
    baseVolume: 0.8,
    url: paperBinTossSoundUrl,
  },
  'settings.sound_preview': {
    baseVolume: 1,
    url: soundPreviewUrl,
  },
  'theme.paper_switch': {
    baseVolume: 0.4,
    url: scribbleCircleSoundUrl,
  },
};

const audioByEffectId = new Map<AppSoundEffectId, HTMLAudioElement>();

export function playAppSoundEffect(effectId: AppSoundEffectId, settings: AppSettings) {
  if (settings.soundEffectsEnabled === false) return;
  const definition = soundEffects[effectId];
  const volume = normalizeSoundEffectsVolume(settings.soundEffectsVolume) * definition.baseVolume;
  if (volume <= 0) return;

  const audio = audioByEffectId.get(effectId) || createAudio(effectId, definition.url);
  audio.volume = volume;
  audio.currentTime = 0;
  try {
    void audio.play();
  } catch {
    // Browser autoplay/media support can reject effect playback; the UI action should still succeed.
  }
}

function createAudio(effectId: AppSoundEffectId, url: string) {
  const audio = new Audio(url);
  audioByEffectId.set(effectId, audio);
  return audio;
}
