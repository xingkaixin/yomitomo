import type { ReaderSettings } from './reader-types';

export const defaultReaderBackgroundColor = '#fffdf8';
export const readerBodyLineHeight = '1.78';

export type ReaderBackgroundTone = 'light' | 'dark';

// ink, muted and highlight alphas per paper come from the A2 design system (paper-<id>-ink, -ink-mut, -hl, -hl-on).
export const readerBackgroundOptions = [
  {
    label: '纸白',
    tone: 'light',
    value: defaultReaderBackgroundColor,
    ink: '#1f1c18',
    muted: '#6d665c',
    highlight: 0.5,
    highlightActive: 0.78,
  },
  {
    label: '暖米',
    tone: 'light',
    value: '#f7eddc',
    ink: '#1f1c18',
    muted: '#6a5f50',
    highlight: 0.55,
    highlightActive: 0.85,
  },
  {
    label: '淡绿',
    tone: 'light',
    value: '#eef4e8',
    ink: '#1f1c18',
    muted: '#5f665a',
    highlight: 0.55,
    highlightActive: 0.85,
  },
  {
    label: '冷灰',
    tone: 'light',
    value: '#eef1f4',
    ink: '#1f1c18',
    muted: '#5d636b',
    highlight: 0.55,
    highlightActive: 0.85,
  },
  {
    label: '松烟',
    tone: 'dark',
    value: '#242019',
    ink: '#e4ddd2',
    muted: '#a99f90',
    highlight: 0.24,
    highlightActive: 0.4,
  },
  {
    label: '黛蓝',
    tone: 'dark',
    value: '#171a21',
    ink: '#e2e3e6',
    muted: '#9da3ad',
    highlight: 0.22,
    highlightActive: 0.38,
  },
  {
    label: '纯白',
    tone: 'light',
    value: '#ffffff',
    ink: '#1f1c18',
    muted: '#6d665c',
    highlight: 0.5,
    highlightActive: 0.78,
  },
  {
    label: '深蓝',
    tone: 'dark',
    value: '#012032',
    ink: '#dfe7ec',
    muted: '#93a9b6',
    highlight: 0.22,
    highlightActive: 0.38,
  },
] as const;

export type ReaderPaper = (typeof readerBackgroundOptions)[number];

export function readerPaper(value: string | undefined): ReaderPaper {
  return (
    readerBackgroundOptions.find((option) => option.value === value) ?? readerBackgroundOptions[0]
  );
}

export function readerPaperCssVariables(value: string | undefined) {
  const paper = readerPaper(value);
  return {
    '--reader-paper-ink': paper.ink,
    '--reader-paper-muted': paper.muted,
    '--reader-paper-hl': String(paper.highlight),
    '--reader-paper-hl-on': String(paper.highlightActive),
  };
}

export function readerBackgroundTone(value: string | undefined): ReaderBackgroundTone {
  return readerPaper(value).tone;
}

export function defaultReaderBackgroundForTone(tone: ReaderBackgroundTone): string {
  return (
    readerBackgroundOptions.find((option) => option.tone === tone)?.value ||
    defaultReaderBackgroundColor
  );
}

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  contentWidth: 860,
  backgroundColor: defaultReaderBackgroundColor,
};

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeReaderBackgroundColor(value: string | undefined): string {
  if (value && readerBackgroundOptions.some((option) => option.value === value)) return value;
  return defaultReaderSettings.backgroundColor;
}
