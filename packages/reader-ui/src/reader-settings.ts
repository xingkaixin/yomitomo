import type { ArticleRecord, UserProfile } from '@yomitomo/shared';
import { timestamp } from '@yomitomo/core';
import type { ReaderSettings } from './reader-types';

export const defaultReaderBackgroundColor = '#fffdf8';

export type ReaderBackgroundTone = 'light' | 'dark';

export const readerBackgroundOptions = [
  { label: '纸白', tone: 'light', value: defaultReaderBackgroundColor },
  { label: '暖米', tone: 'light', value: '#f7eddc' },
  { label: '淡绿', tone: 'light', value: '#eef4e8' },
  { label: '冷灰', tone: 'light', value: '#eef1f4' },
  { label: '松烟', tone: 'dark', value: '#242019' },
  { label: '黛蓝', tone: 'dark', value: '#171a21' },
] as const;

export function readerBackgroundTone(value: string | undefined): ReaderBackgroundTone {
  return readerBackgroundOptions.find((option) => option.value === value)?.tone ?? 'light';
}

export function defaultReaderBackgroundForTone(tone: ReaderBackgroundTone): string {
  return (
    readerBackgroundOptions.find((option) => option.tone === tone)?.value ||
    defaultReaderBackgroundColor
  );
}

export const defaultUserProfile: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: '',
};

export const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  contentWidth: 860,
  backgroundColor: defaultReaderBackgroundColor,
};

export function normalizeUserProfile(user: Partial<UserProfile> | undefined): UserProfile {
  return {
    ...defaultUserProfile,
    ...user,
    id: user?.id || defaultUserProfile.id,
    annotationColor: user?.annotationColor || defaultUserProfile.annotationColor,
  };
}

export function toCachedArticleRecord(record: ArticleRecord): ArticleRecord {
  return {
    ...record,
    contentHtml: undefined,
  };
}

export function isNewerArticleRecord(record: ArticleRecord, current: ArticleRecord | null) {
  return !current || timestamp(record.updatedAt) > timestamp(current.updatedAt);
}

export function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeReaderBackgroundColor(value: string | undefined): string {
  if (value && readerBackgroundOptions.some((option) => option.value === value)) return value;
  return defaultReaderSettings.backgroundColor;
}
