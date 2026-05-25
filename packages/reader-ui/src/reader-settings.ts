import type { ArticleRecord, UserProfile } from '@yomitomo/shared';
import { timestamp } from '@yomitomo/core';
import type { ReaderSettings } from './reader-types';

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
