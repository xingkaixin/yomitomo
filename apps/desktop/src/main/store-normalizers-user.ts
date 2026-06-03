import type { UserProfile } from '@yomitomo/shared';
import * as schema from './db/schema';

export const defaultUser: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: new Date(0).toISOString(),
};

export function normalizeUser(user: Partial<UserProfile> | undefined): UserProfile {
  return {
    ...defaultUser,
    ...user,
    id: user?.id || defaultUser.id,
    annotationColor: user?.annotationColor || defaultUser.annotationColor,
  };
}

export function rowToUser(row: typeof schema.userProfiles.$inferSelect | undefined): UserProfile {
  if (!row) return defaultUser;
  return {
    id: row.id,
    nickname: row.nickname,
    username: row.username,
    avatar: row.avatar,
    annotationColor: row.annotationColor,
    updatedAt: row.updatedAt,
  };
}

export function userToRow(user: UserProfile): typeof schema.userProfiles.$inferInsert {
  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    avatar: user.avatar,
    annotationColor: user.annotationColor,
    updatedAt: user.updatedAt,
  };
}

export function normalizeUsername(value: string, fallback = 'me') {
  return (
    value
      .trim()
      .replace(/^@/, '')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 32) || fallback
  );
}
