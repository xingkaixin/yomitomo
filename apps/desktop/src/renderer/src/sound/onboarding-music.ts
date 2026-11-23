import type { ResolvedAppSettings } from '@yomitomo/shared';
import { normalizeSoundEffectsVolume } from '@yomitomo/shared';
import highlightOnPaperSoundUrl from '../assets/audio/highlight-on-paper-01.mp3';
import onboardingBgmUrl from '../assets/audio/onboarding-bgm.m4a';

export const ONBOARDING_BAR_SECONDS = 2;
export const ONBOARDING_SHOW_SECONDS = 16;

const bgmBaseVolume = 0.72;
const cueBaseVolume = 0.8;
const lookaheadSeconds = 0.15;
const staleSeconds = 0.05;
const muteRampMs = 120;
const fadeOutMs = 1000;

type CueEvent =
  | { at: number; kind: 'highlight'; level: number }
  | { at: number; kind: 'pop'; level: number }
  | { at: number; kind: 'swish'; length: number; level: number };

export type OnboardingMusic = {
  advance: (position: number) => void;
  setMuted: (muted: boolean) => void;
  stop: () => void;
};

// Unpitched tactile cues aligned with the visual beats in app-onboarding-show.ts so they sit
// naturally on top of the acoustic BGM without clashing with its harmony.
const showCues: CueEvent[] = [
  { at: 2, kind: 'pop', level: 0.75 },
  { at: 3.7, kind: 'swish', length: 0.45, level: 0.65 },
  { at: 6, kind: 'highlight', level: 0.45 },
  { at: 10, kind: 'pop', level: 0.4 },
  { at: 14, kind: 'pop', level: 0.7 },
];

export function createOnboardingMusic(
  settings: Partial<Pick<ResolvedAppSettings, 'soundEffectsEnabled' | 'soundEffectsVolume'>>,
): OnboardingMusic | null {
  if (settings.soundEffectsEnabled === false) return null;
  const volume = normalizeSoundEffectsVolume(settings.soundEffectsVolume);
  if (volume <= 0) return null;

  const bgm = createBgmAudio(volume * bgmBaseVolume);
  const cueSynth = createCueSynth(volume * cueBaseVolume);
  if (!bgm && !cueSynth) return null;

  let cueIndex = 0;
  let muted = false;
  let stopped = false;
  let rampFrame = 0;
  let highlightAudio: HTMLAudioElement | null = null;

  function cancelRamp() {
    if (rampFrame) {
      cancelAnimationFrame(rampFrame);
      rampFrame = 0;
    }
  }

  function rampBgmVolume(target: number, durationMs: number, onComplete?: () => void) {
    if (!bgm) {
      onComplete?.();
      return;
    }
    cancelRamp();
    const startVolume = bgm.volume;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
      bgm.volume = Math.max(0, Math.min(1, startVolume + (target - startVolume) * progress));
      if (progress < 1) {
        rampFrame = requestAnimationFrame(step);
        return;
      }
      rampFrame = 0;
      onComplete?.();
    };
    rampFrame = requestAnimationFrame(step);
  }

  function playHighlightCue(level: number) {
    if (muted || typeof Audio === 'undefined') return;
    try {
      const audio = new Audio(highlightOnPaperSoundUrl);
      audio.volume = Math.min(1, volume * level);
      highlightAudio = audio;
      const playResult = audio.play();
      if (playResult instanceof Promise) void playResult.catch(() => undefined);
    } catch {
      // Media playback can be blocked in headless or restricted environments.
    }
  }

  return {
    // A jump in position, such as skipping the show, drops the cues it passed over while keeping
    // the BGM flowing smoothly.
    advance(position) {
      if (stopped) return;
      for (; cueIndex < showCues.length; cueIndex += 1) {
        const cue = showCues[cueIndex];
        if (!cue) return;
        const triggerHorizon = cue.kind === 'highlight' ? position : position + lookaheadSeconds;
        if (cue.at > triggerHorizon) return;
        if (cue.at <= position - staleSeconds) continue;
        if (cue.kind === 'highlight') {
          playHighlightCue(cue.level);
        } else {
          cueSynth?.play(cue, Math.max(0, cue.at - position));
        }
      }
    },
    setMuted(nextMuted) {
      if (stopped || muted === nextMuted) return;
      muted = nextMuted;
      rampBgmVolume(muted ? 0 : volume * bgmBaseVolume, muteRampMs);
      cueSynth?.setMuted(muted);
      if (muted && highlightAudio && !highlightAudio.paused) highlightAudio.pause();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (highlightAudio && !highlightAudio.paused) {
        highlightAudio.pause();
        highlightAudio.currentTime = 0;
      }
      rampBgmVolume(0, fadeOutMs, () => {
        if (!bgm) return;
        bgm.pause();
        bgm.currentTime = 0;
      });
      cueSynth?.stop(fadeOutMs / 1000);
    },
  };
}

function createBgmAudio(targetVolume: number): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  try {
    const audio = new Audio(onboardingBgmUrl);
    audio.loop = true;
    audio.volume = Math.min(1, targetVolume);
    const playResult = audio.play();
    if (playResult instanceof Promise) void playResult.catch(() => undefined);
    return audio;
  } catch {
    return null;
  }
}

type CueSynth = {
  play: (cue: Extract<CueEvent, { kind: 'pop' | 'swish' }>, delaySeconds: number) => void;
  setMuted: (muted: boolean) => void;
  stop: (fadeOutSeconds: number) => void;
};

function createCueSynth(volume: number): CueSynth | null {
  if (typeof AudioContext === 'undefined') return null;

  // Without an audio device the context can fail to open; onboarding must still render.
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }

  const master = context.createGain();
  master.gain.value = volume;
  const mute = context.createGain();
  master.connect(mute);
  mute.connect(context.destination);
  const noise = createNoise(context);
  void context.resume().catch(() => undefined);

  return {
    play(cue, delaySeconds) {
      if (context.state !== 'running') return;
      const time = context.currentTime + delaySeconds;
      if (cue.kind === 'pop') {
        playPop(context, master, cue.level, time);
      } else {
        playSwish(context, master, noise, cue.level, cue.length, time);
      }
    },
    setMuted(muted) {
      mute.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.04);
    },
    stop(fadeOutSeconds) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(master.gain.value, context.currentTime);
      master.gain.linearRampToValueAtTime(0, context.currentTime + fadeOutSeconds);
      window.setTimeout(() => void context.close(), (fadeOutSeconds + 0.2) * 1000);
    },
  };
}

function createNoise(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  return buffer;
}

function playPop(context: AudioContext, output: AudioNode, level: number, time: number) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.14 * level, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.145);
  gain.connect(output);

  const node = context.createOscillator();
  node.type = 'sine';
  node.frequency.setValueAtTime(380, time);
  node.frequency.exponentialRampToValueAtTime(920, time + 0.09);
  node.connect(gain);
  node.start(time);
  node.stop(time + 0.2);
}

function playSwish(
  context: AudioContext,
  output: AudioNode,
  noise: AudioBuffer,
  level: number,
  length: number,
  time: number,
) {
  const source = context.createBufferSource();
  source.buffer = noise;
  const bandpass = context.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.value = 0.8;
  bandpass.frequency.setValueAtTime(1400, time);
  bandpass.frequency.exponentialRampToValueAtTime(3200, time + length);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.045 * level, time + length * 0.2);
  gain.gain.linearRampToValueAtTime(0, time + length);
  source.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(output);
  source.start(time);
  source.stop(time + length + 0.05);
}
