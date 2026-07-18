import type { UserProfile } from '@yomitomo/shared';
import { defaultUserProfile, normalizeUserProfile } from '@yomitomo/shared';
import * as schema from '../db/schema';

export { defaultUserProfile as defaultUser, normalizeUserProfile as normalizeUser };

export function rowToUser(row: typeof schema.userProfiles.$inferSelect | undefined): UserProfile {
  if (!row) return defaultUserProfile;
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
