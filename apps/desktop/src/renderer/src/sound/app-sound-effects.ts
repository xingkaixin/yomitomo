import type { AppSettings } from '@yomitomo/shared';
import { normalizeSoundEffectsVolume } from '@yomitomo/shared';
import highlightOnPaperSoundUrl1 from '../assets/audio/highlight-on-paper-01.mp3';
import highlightOnPaperSoundUrl2 from '../assets/audio/highlight-on-paper-02.mp3';
import highlightOnPaperSoundUrl3 from '../assets/audio/highlight-on-paper-03.mp3';
import importSuccessMultipleSoundUrl from '../assets/audio/import-success-multiple.mp3';
import importSuccessSingleSoundUrl from '../assets/audio/import-success-single.mp3';
import paperBinTossSoundUrl from '../assets/audio/paper-bin-toss.mp3';
import scribbleCircleSoundUrl from '../assets/audio/scribble-circle.m4a';
import soundPreviewUrl from '../assets/audio/sound-preview.mp3';

export type AppSoundEffectId =
  | 'library.import_success_multiple'
  | 'library.import_success_single'
  | 'library.delete_item'
  | 'reader.annotation_created'
  | 'settings.sound_preview'
  | 'theme.paper_switch';

type SoundEffectDefinition = {
  baseVolume: number;
  urls: string[];
};

const soundEffects: Record<AppSoundEffectId, SoundEffectDefinition> = {
  'library.import_success_multiple': {
    baseVolume: 0.8,
    urls: [importSuccessMultipleSoundUrl],
  },
  'library.import_success_single': {
    baseVolume: 0.8,
    urls: [importSuccessSingleSoundUrl],
  },
  'library.delete_item': {
    baseVolume: 0.8,
    urls: [paperBinTossSoundUrl],
  },
  'reader.annotation_created': {
    baseVolume: 0.75,
    urls: [highlightOnPaperSoundUrl1, highlightOnPaperSoundUrl2, highlightOnPaperSoundUrl3],
  },
  'settings.sound_preview': {
    baseVolume: 1,
    urls: [soundPreviewUrl],
  },
  'theme.paper_switch': {
    baseVolume: 0.4,
    urls: [scribbleCircleSoundUrl],
  },
};

const audioByUrl = new Map<string, HTMLAudioElement>();

export function playAppSoundEffect(effectId: AppSoundEffectId, settings: AppSettings) {
  if (settings.soundEffectsEnabled === false) return;
  const definition = soundEffects[effectId];
  const volume = normalizeSoundEffectsVolume(settings.soundEffectsVolume) * definition.baseVolume;
  if (volume <= 0) return;

  const url = chooseSoundUrl(definition.urls);
  const audio = audioByUrl.get(url) || createAudio(url);
  audio.volume = volume;
  audio.currentTime = 0;
  try {
    void audio.play();
  } catch {
    // Browser autoplay/media support can reject effect playback; the UI action should still succeed.
  }
}

function chooseSoundUrl(urls: string[]) {
  if (urls.length <= 1) return urls[0] || '';
  return urls[Math.floor(Math.random() * urls.length)] || urls[0];
}

function createAudio(url: string) {
  const audio = new Audio(url);
  audioByUrl.set(url, audio);
  return audio;
}
