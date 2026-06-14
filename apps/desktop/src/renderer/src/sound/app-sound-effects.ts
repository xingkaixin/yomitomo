import type { AppSettings } from '@yomitomo/shared';
import { normalizeSoundEffectsVolume } from '@yomitomo/shared';
import highlightOnPaperSoundUrl1 from '../assets/audio/highlight-on-paper-01.mp3';
import highlightOnPaperSoundUrl2 from '../assets/audio/highlight-on-paper-02.mp3';
import highlightOnPaperSoundUrl3 from '../assets/audio/highlight-on-paper-03.mp3';
import brandPronunciationUrl from '../assets/audio/yomitomo.m4a';
import distillationCommitStampUrl from '../assets/audio/distillation-commit-stamp.mp3';
import importSuccessMultipleSoundUrl from '../assets/audio/import-success-multiple.mp3';
import importSuccessSingleSoundUrl from '../assets/audio/import-success-single.mp3';
import paperBinTossSoundUrl from '../assets/audio/paper-bin-toss.mp3';
import penClickSoundUrl from '../assets/audio/pen-click.mp3';
import pencilWritingLoopSoundUrl from '../assets/audio/pencil-writing-loop.mp3';
import scribbleCircleSoundUrl from '../assets/audio/scribble-circle.m4a';
import soundPreviewUrl from '../assets/audio/sound-preview.mp3';

export type AppSoundEffectId =
  | 'brand.pronunciation'
  | 'discussion.assistant_thought_done'
  | 'discussion.assistant_thought_writing'
  | 'library.import_success_multiple'
  | 'library.import_success_single'
  | 'library.delete_item'
  | 'reader.annotation_created'
  | 'reader.distillation_committed'
  | 'settings.sound_preview'
  | 'theme.paper_switch';

type SoundEffectDefinition = {
  baseVolume: number;
  loop?: boolean;
  replayBehavior?: 'restart' | 'skip_while_playing';
  urls: string[];
};

const soundEffects: Record<AppSoundEffectId, SoundEffectDefinition> = {
  'brand.pronunciation': {
    baseVolume: 1,
    replayBehavior: 'skip_while_playing',
    urls: [brandPronunciationUrl],
  },
  'discussion.assistant_thought_done': {
    baseVolume: 0.55,
    replayBehavior: 'restart',
    urls: [penClickSoundUrl],
  },
  'discussion.assistant_thought_writing': {
    baseVolume: 0.5,
    loop: true,
    replayBehavior: 'skip_while_playing',
    urls: [pencilWritingLoopSoundUrl],
  },
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
  'reader.distillation_committed': {
    baseVolume: 0.8,
    urls: [distillationCommitStampUrl],
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
const playingUrls = new Set<string>();

export function playAppSoundEffect(effectId: AppSoundEffectId, settings: AppSettings) {
  if (settings.soundEffectsEnabled === false) return;
  const definition = soundEffects[effectId];
  const volume = normalizeSoundEffectsVolume(settings.soundEffectsVolume) * definition.baseVolume;
  if (volume <= 0) return;

  const url = chooseSoundUrl(definition.urls);
  const audio = audioByUrl.get(url) || createAudio(url);
  if (definition.replayBehavior === 'skip_while_playing' && playingUrls.has(url)) return;

  audio.volume = volume;
  audio.loop = definition.loop === true;
  audio.currentTime = 0;
  if (definition.replayBehavior === 'skip_while_playing') markAudioPlaying(url, audio);
  try {
    const playResult = audio.play();
    if (playResult instanceof Promise) {
      void playResult.catch(() => {
        playingUrls.delete(url);
      });
    }
  } catch {
    playingUrls.delete(url);
    // Browser autoplay/media support can reject effect playback; the UI action should still succeed.
  }
}

export function stopAppSoundEffect(effectId: AppSoundEffectId) {
  for (const url of soundEffects[effectId].urls) {
    const audio = audioByUrl.get(url);
    if (!audio || audio.paused) continue;
    audio.pause();
    audio.currentTime = 0;
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

function markAudioPlaying(url: string, audio: HTMLAudioElement) {
  playingUrls.add(url);
  const clearPlaying = () => {
    playingUrls.delete(url);
  };
  audio.addEventListener('ended', clearPlaying, { once: true });
  audio.addEventListener('pause', clearPlaying, { once: true });
}
