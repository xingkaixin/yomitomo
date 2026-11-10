import type { ResolvedAppSettings } from '@yomitomo/shared';
import { normalizeSoundEffectsVolume } from '@yomitomo/shared';

export const ONBOARDING_BAR_SECONDS = 2;
export const ONBOARDING_SHOW_SECONDS = 16;

const beatSeconds = ONBOARDING_BAR_SECONDS / 4;
const restLoopSeconds = 16;
const lookaheadSeconds = 0.25;
const staleSeconds = 0.05;
const baseVolume = 0.9;
const fadeOutSeconds = 1;

type Voice = 'bass' | 'bell' | 'keys' | 'pad' | 'pop' | 'swish';

type ScoreEvent = {
  at: number;
  cutoff: number;
  frequency: number;
  length: number;
  level: number;
  voice: Voice;
};

type ScoreWriter = {
  arp: (bar: number, notes: string[], level: number) => void;
  bass: (bar: number, beat: number, note: string, level: number, length?: number) => void;
  bell: (bar: number, beat: number, note: string, level: number, length?: number) => void;
  keys: (
    bar: number,
    beat: number,
    note: string,
    level: number,
    length?: number,
    cutoff?: number,
  ) => void;
  pad: (bar: number, beat: number, notes: string[], level: number, beats: number) => void;
  pop: (bar: number, beat: number, level: number) => void;
  swish: (bar: number, beat: number, level: number, length: number) => void;
};

export type OnboardingMusic = {
  advance: (position: number) => void;
  setMuted: (muted: boolean) => void;
  stop: () => void;
};

const semitones: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteFrequency(note: string) {
  const letter = note[0] || 'A';
  const flat = note[1] === 'b';
  const octave = Number(note.slice(flat ? 2 : 1));
  const midi = 12 * (octave + 1) + (semitones[letter] ?? 9) - (flat ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

function compose(write: (score: ScoreWriter) => void) {
  const events: ScoreEvent[] = [];
  const add = (
    voice: Voice,
    bar: number,
    beat: number,
    note: string,
    level: number,
    length: number,
    cutoff = 0,
  ) => {
    events.push({
      at: (bar - 1) * ONBOARDING_BAR_SECONDS + (beat - 1) * beatSeconds,
      cutoff,
      frequency: note ? noteFrequency(note) : 0,
      length,
      level,
      voice,
    });
  };
  const score: ScoreWriter = {
    arp: (bar, notes, level) => {
      notes.forEach((note, index) => score.keys(bar, 1 + index / 2, note, level, 0.9));
    },
    bass: (bar, beat, note, level, length = 1.7) => add('bass', bar, beat, note, level, length),
    bell: (bar, beat, note, level, length = 1.8) => add('bell', bar, beat, note, level, length),
    keys: (bar, beat, note, level, length = 1, cutoff = 1100) =>
      add('keys', bar, beat, note, level, length, cutoff),
    pad: (bar, beat, notes, level, beats) => {
      for (const note of notes) add('pad', bar, beat, note, level, beats * beatSeconds);
    },
    pop: (bar, beat, level) => add('pop', bar, beat, '', level, 0.2),
    swish: (bar, beat, level, length) => add('swish', bar, beat, '', level, length),
  };
  write(score);
  return events.toSorted((left, right) => left.at - right.at);
}

// One bar per onboarding beat: the bars line up with the cues in app-onboarding-show.ts.
const showScore = compose((score) => {
  // 1 · Fadd9. Three bells, one per line drawn on the book: F A C.
  score.pad(1, 1, ['F3', 'C4', 'G4', 'A4'], 0.9, 4);
  score.bass(1, 1, 'F2', 0.8);
  score.bell(1, 2, 'F5', 0.45);
  score.bell(1, 3, 'A5', 0.5);
  score.bell(1, 4, 'C6', 0.7);
  score.swish(1, 4, 0.7, 0.45);
  // 2 · Fmaj9. The rabbit hops up the same triad.
  score.pad(2, 1, ['F3', 'C4', 'E4', 'G4', 'A4'], 0.9, 4);
  score.bass(2, 1, 'F2', 0.8);
  score.pop(2, 1, 1);
  score.bell(2, 1, 'F5', 0.5);
  score.bell(2, 1.25, 'A5', 0.55);
  score.bell(2, 1.5, 'C6', 0.6);
  score.bell(2, 2, 'F6', 0.75);
  score.bell(2, 3, 'A5', 0.45);
  score.bell(2, 3, 'E6', 0.45);
  score.bell(2, 4.5, 'G5', 0.4, 1);
  // 3 · Dm7. Reading theme.
  score.pad(3, 1, ['D3', 'A3', 'C4', 'F4'], 0.85, 4);
  score.bass(3, 1, 'D2', 0.8);
  score.arp(3, ['D3', 'A3', 'F4', 'A3', 'C4', 'A3', 'F4', 'A3'], 0.34);
  score.bell(3, 1, 'A5', 0.72);
  score.bell(3, 2, 'G5', 0.6);
  score.bell(3, 2.5, 'F5', 0.6);
  score.bell(3, 3, 'D5', 0.66);
  score.bell(3, 4, 'F5', 0.62);
  // 4 · Bbmaj7. A rising run follows the underline.
  score.pad(4, 1, ['Bb3', 'D4', 'F4', 'A4'], 0.85, 4);
  score.bass(4, 1, 'Bb2', 0.8);
  score.arp(4, ['Bb2', 'F3', 'D4', 'F3', 'A3', 'F3', 'D4', 'F3'], 0.34);
  score.swish(4, 1, 0.8, 1.05);
  score.bell(4, 1, 'D5', 0.55);
  score.bell(4, 1.5, 'F5', 0.6);
  score.bell(4, 2, 'A5', 0.66);
  score.bell(4, 2.5, 'Bb5', 0.72);
  score.bell(4, 3, 'C6', 0.82, 2.2);
  // 5 · Gm7. Short detached notes while the thought is written.
  score.pad(5, 1, ['G3', 'Bb3', 'D4', 'F4'], 0.85, 4);
  score.bass(5, 1, 'G2', 0.8);
  score.arp(5, ['G2', 'D3', 'Bb3', 'D3', 'F3', 'D3', 'Bb3', 'D3'], 0.34);
  ['G5', 'Bb5', 'D6', 'Bb5', 'G5', 'Bb5'].forEach((note, index) => {
    score.bell(5, 1 + index / 2, note, 0.62, 0.45);
  });
  score.bell(5, 4, 'A5', 0.7, 1.6);
  // 6 · Cadd9. The assistant answers in a lower, warmer voice.
  score.pad(6, 1, ['E3', 'G3', 'C4', 'D4'], 0.85, 4);
  score.bass(6, 1, 'C3', 0.75);
  score.arp(6, ['C3', 'G3', 'E4', 'G3', 'C3', 'G3', 'E4', 'G3'], 0.26);
  score.pop(6, 1, 0.45);
  score.keys(6, 1, 'G4', 0.8, 1.2, 2400);
  score.keys(6, 1.5, 'C5', 0.8, 1.2, 2400);
  score.keys(6, 2, 'E5', 0.9, 1.5, 2400);
  score.keys(6, 3, 'D5', 0.8, 1.2, 2400);
  score.keys(6, 3.5, 'C5', 0.8, 1.2, 2400);
  score.keys(6, 4, 'D5', 0.9, 1.6, 2400);
  // 7 · Bbadd9 to C. The three bells return, one per import entry, then the leading tone.
  score.pad(7, 1, ['Bb3', 'C4', 'D4', 'F4'], 0.85, 2);
  score.pad(7, 3, ['G3', 'C4', 'E4', 'G4'], 0.85, 2);
  score.bass(7, 1, 'Bb2', 0.8, 0.9);
  score.bass(7, 3, 'C3', 0.8, 0.9);
  score.arp(7, ['Bb2', 'F3', 'D4', 'F3', 'C3', 'G3', 'E4', 'G3'], 0.34);
  score.bell(7, 1, 'F5', 0.62);
  score.bell(7, 2, 'A5', 0.66);
  score.bell(7, 3, 'C6', 0.72);
  score.bell(7, 4, 'E6', 0.76);
  // 8 · Fadd9. Home.
  score.pad(8, 1, ['F3', 'C4', 'G4', 'A4'], 0.9, 5);
  score.bass(8, 1, 'F2', 0.85, 2.6);
  score.pop(8, 1, 0.9);
  score.bell(8, 1, 'F6', 0.86, 2.8);
  score.bell(8, 1.5, 'C6', 0.5, 2.2);
  score.bell(8, 2, 'A5', 0.45, 2.2);
  score.bell(8, 2.5, 'F5', 0.4, 2.2);
  score.keys(8, 1, 'F3', 0.5, 2.4);
  score.keys(8, 1.24, 'C4', 0.5, 2.4);
  score.keys(8, 1.48, 'A4', 0.5, 2.4);
  score.bell(8, 4, 'G6', 0.26, 2);
});

// The same harmony at a third of the density, two bars per chord, for as long as the reader stays.
const restScore = compose((score) => {
  const chords: Array<[pad: string[], bass: string, roll: string[]]> = [
    [['F3', 'C4', 'G4', 'A4'], 'F2', ['F3', 'C4', 'A4']],
    [['D3', 'A3', 'C4', 'F4'], 'D3', ['D3', 'A3', 'F4']],
    [['Bb3', 'D4', 'F4', 'A4'], 'Bb2', ['Bb2', 'F3', 'D4']],
    [['G3', 'C4', 'D4', 'G4'], 'C3', ['C3', 'G3', 'D4']],
  ];
  chords.forEach(([pad, bass, roll], index) => {
    const bar = 1 + index * 2;
    score.pad(bar, 1, pad, 0.55, 8);
    score.bass(bar, 1, bass, 0.45, 3.4);
    roll.forEach((note, step) => score.keys(bar, 1 + step * 0.24, note, 0.24, 2.2));
  });
  const bells: Array<[bar: number, beat: number, note: string]> = [
    [1, 3, 'C6'],
    [2, 2, 'A5'],
    [2, 4, 'G5'],
    [3, 3, 'F5'],
    [4, 1.5, 'A5'],
    [4, 3, 'D6'],
    [5, 3, 'D6'],
    [6, 1, 'C6'],
    [6, 3.5, 'A5'],
    [7, 2, 'G5'],
    [8, 2, 'D6'],
    [8, 3, 'C6'],
  ];
  for (const [bar, beat, note] of bells) score.bell(bar, beat, note, 0.32, 2.4);
});

export function createOnboardingMusic(
  settings: Partial<Pick<ResolvedAppSettings, 'soundEffectsEnabled' | 'soundEffectsVolume'>>,
): OnboardingMusic | null {
  if (settings.soundEffectsEnabled === false) return null;
  const volume = normalizeSoundEffectsVolume(settings.soundEffectsVolume) * baseVolume;
  if (volume <= 0 || typeof AudioContext === 'undefined') return null;

  // Without an audio device the context can fail to open; onboarding must still render.
  try {
    return createPlayer(new AudioContext(), volume);
  } catch {
    return null;
  }
}

function createPlayer(context: AudioContext, volume: number): OnboardingMusic {
  const master = context.createGain();
  master.gain.value = volume;
  const mute = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.25;
  const reverb = context.createConvolver();
  reverb.buffer = createImpulseResponse(context, 2.6);
  const wet = context.createGain();
  wet.gain.value = 0.34;
  master.connect(compressor);
  master.connect(reverb);
  reverb.connect(wet);
  wet.connect(compressor);
  compressor.connect(mute);
  mute.connect(context.destination);
  const noise = createNoise(context);
  void context.resume().catch(() => undefined);

  let showIndex = 0;
  let restIndex = 0;
  let restRound = 0;
  let stopped = false;

  function play(event: ScoreEvent, at: number, position: number) {
    if (at <= position - staleSeconds) return;
    const time = context.currentTime + Math.max(0, at - position);
    playVoice(context, master, noise, event, time);
  }

  return {
    // A jump in position, such as skipping the show, drops the events it passed over.
    advance(position) {
      if (stopped) return;
      const audible = context.state === 'running';
      const horizon = position + lookaheadSeconds;
      for (; showIndex < showScore.length; showIndex += 1) {
        const event = showScore[showIndex];
        if (!event || event.at >= horizon) return;
        if (audible) play(event, event.at, position);
      }
      for (;;) {
        const event = restScore[restIndex];
        if (!event) return;
        const at = ONBOARDING_SHOW_SECONDS + restRound * restLoopSeconds + event.at;
        if (at >= horizon) return;
        if (audible) play(event, at, position);
        restIndex += 1;
        if (restIndex >= restScore.length) {
          restIndex = 0;
          restRound += 1;
        }
      }
    },
    setMuted(muted) {
      mute.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.04);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(master.gain.value, context.currentTime);
      master.gain.linearRampToValueAtTime(0, context.currentTime + fadeOutSeconds);
      window.setTimeout(() => void context.close(), (fadeOutSeconds + 0.2) * 1000);
    },
  };
}

function createImpulseResponse(context: AudioContext, seconds: number) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      const decay = (1 - index / length) ** 3.2;
      // A one-pole lowpass over the noise keeps the tail from sounding like hiss.
      smoothed += 0.3 * ((Math.random() * 2 - 1) * decay - smoothed);
      samples[index] = smoothed;
    }
  }
  return buffer;
}

function createNoise(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  return buffer;
}

function playVoice(
  context: AudioContext,
  output: AudioNode,
  noise: AudioBuffer,
  event: ScoreEvent,
  time: number,
) {
  const { cutoff, frequency, length, level } = event;

  function oscillator(
    type: OscillatorType,
    pitch: number,
    stop: number,
    destination: AudioNode,
    detune = 0,
  ) {
    const node = context.createOscillator();
    node.type = type;
    node.frequency.value = pitch;
    node.detune.value = detune;
    node.connect(destination);
    node.start(time);
    node.stop(stop);
    return node;
  }

  function plucked(attack: number, peak: number, decay: number) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    gain.connect(output);
    return gain;
  }

  switch (event.voice) {
    case 'bell': {
      oscillator('sine', frequency, time + length + 0.1, plucked(0.004, 0.2 * level, length));
      // Two short inharmonic partials give the tine of a music box.
      oscillator('sine', frequency * 3.01, time + 0.4, plucked(0.002, 0.05 * level, 0.25));
      oscillator('sine', frequency * 5.4, time + 0.15, plucked(0.001, 0.03 * level, 0.07));
      return;
    }
    case 'keys': {
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(cutoff, time);
      lowpass.frequency.exponentialRampToValueAtTime(cutoff * 0.4, time + length);
      lowpass.connect(plucked(0.008, 0.17 * level, length));
      oscillator('triangle', frequency, time + length + 0.1, lowpass);
      oscillator('sine', frequency, time + length + 0.1, lowpass, 7);
      return;
    }
    case 'pad': {
      const peak = 0.045 * level;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 900;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(peak, time + Math.min(0.7, length * 0.4));
      gain.gain.setValueAtTime(peak, time + length);
      gain.gain.linearRampToValueAtTime(0, time + length + 1.2);
      lowpass.connect(gain);
      gain.connect(output);
      oscillator('triangle', frequency, time + length + 1.3, lowpass, -6);
      oscillator('triangle', frequency, time + length + 1.3, lowpass, 6);
      return;
    }
    case 'bass': {
      oscillator('sine', frequency, time + length + 0.1, plucked(0.02, 0.24 * level, length));
      oscillator(
        'triangle',
        frequency,
        time + length + 0.1,
        plucked(0.02, 0.05 * level, length * 0.6),
      );
      return;
    }
    case 'pop': {
      const node = oscillator('sine', 380, time + length, plucked(0.005, 0.16 * level, 0.14));
      node.frequency.setValueAtTime(380, time);
      node.frequency.exponentialRampToValueAtTime(920, time + 0.09);
      return;
    }
    case 'swish': {
      const source = context.createBufferSource();
      source.buffer = noise;
      const bandpass = context.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.Q.value = 0.8;
      bandpass.frequency.setValueAtTime(1400, time);
      bandpass.frequency.exponentialRampToValueAtTime(3200, time + length);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.05 * level, time + length * 0.2);
      gain.gain.linearRampToValueAtTime(0, time + length);
      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(output);
      source.start(time);
      source.stop(time + length + 0.05);
      return;
    }
  }
}
