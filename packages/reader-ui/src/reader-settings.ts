import { defaultUserAnnotationColor } from '@yomitomo/shared';
import type { ReaderSettings } from './reader-types';

export const defaultReaderBackgroundColor = '#fffdf8';
export const readerBodyLineHeight = '1.78';

export type ReaderBackgroundTone = 'light' | 'dark';

// ink and muted colors per paper come from the A2 design system (paper-<id>-ink, -ink-mut).
export const readerBackgroundOptions = [
  {
    label: '纸白',
    tone: 'light',
    value: defaultReaderBackgroundColor,
    ink: '#1f1c18',
    muted: '#6d665c',
  },
  {
    label: '暖米',
    tone: 'light',
    value: '#f7eddc',
    ink: '#1f1c18',
    muted: '#6a5f50',
  },
  {
    label: '淡绿',
    tone: 'light',
    value: '#eef4e8',
    ink: '#1f1c18',
    muted: '#5f665a',
  },
  {
    label: '冷灰',
    tone: 'light',
    value: '#eef1f4',
    ink: '#1f1c18',
    muted: '#5d636b',
  },
  {
    label: '松烟',
    tone: 'dark',
    value: '#242019',
    ink: '#e4ddd2',
    muted: '#a99f90',
  },
  {
    label: '黛蓝',
    tone: 'dark',
    value: '#171a21',
    ink: '#e2e3e6',
    muted: '#9da3ad',
  },
  {
    label: '纯白',
    tone: 'light',
    value: '#ffffff',
    ink: '#1f1c18',
    muted: '#6d665c',
  },
  {
    label: '深蓝',
    tone: 'dark',
    value: '#012032',
    ink: '#dfe7ec',
    muted: '#93a9b6',
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

// Annotation and distillation lines share one palette; their defaults differ so a distilled
// highlight stands apart until the reader picks otherwise.
export const readerLineColorOptions = [
  defaultUserAnnotationColor,
  '#8ab6d6',
  '#6fa48f',
  '#b99ac8',
] as const;

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  contentWidth: 860,
  backgroundColor: defaultReaderBackgroundColor,
  distillationColor: readerLineColorOptions[1],
};

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeReaderBackgroundColor(value: string | undefined): string {
  if (value && readerBackgroundOptions.some((option) => option.value === value)) return value;
  return defaultReaderSettings.backgroundColor;
}

export function normalizeReaderDistillationColor(value: string | undefined): string {
  return (
    readerLineColorOptions.find((option) => option === value) ??
    defaultReaderSettings.distillationColor
  );
}
