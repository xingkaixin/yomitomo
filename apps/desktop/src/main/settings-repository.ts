import type { AppSettings, UserProfile } from '@yomitomo/shared';
import {
  normalizeLibraryContentSources,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
} from '@yomitomo/shared';
import * as schema from './db/schema';
import { type StoreExecutor } from './store-db';
import {
  defaultUser,
  mergeSettingsForUpsert,
  normalizeUser,
  normalizeUsername,
  rowToSettings,
  rowToUser,
  userToRow,
} from './store-normalizers';

export function readImportSettings(
  database: StoreExecutor,
): Pick<AppSettings, 'saveArticleImages'> {
  const settings = database.select().from(schema.appSettings).limit(1).get();
  return { saveArticleImages: Boolean(settings?.saveArticleImages) };
}

export function saveUserProfile(database: StoreExecutor, input: Partial<UserProfile>) {
  const existing = normalizeUser(
    rowToUser(database.select().from(schema.userProfiles).limit(1).get()),
  );
  const user: UserProfile = {
    id: existing.id || defaultUser.id,
    nickname: input.nickname?.trim() || existing.nickname,
    username: normalizeUsername(input.username || input.nickname || existing.username || 'me'),
    avatar: input.avatar || existing.avatar,
    annotationColor: input.annotationColor?.trim() || existing.annotationColor,
    updatedAt: new Date().toISOString(),
  };

  upsertUser(database, user);
}

export function upsertUser(database: StoreExecutor, user: UserProfile) {
  database
    .insert(schema.userProfiles)
    .values(userToRow(normalizeUser(user)))
    .onConflictDoUpdate({
      target: schema.userProfiles.id,
      set: userToRow(normalizeUser(user)),
    })
    .run();
}

export function upsertSettings(database: StoreExecutor, settings: AppSettings) {
  const existing = database.select().from(schema.appSettings).limit(1).get();
  const merged = mergeSettingsForUpsert(settings, existing ? rowToSettings(existing) : undefined);
  const row = {
    id: 'default',
    themeId: merged.themeId || null,
    libraryPageSize: merged.libraryPageSize || null,
    libraryContentSources: normalizeLibraryContentSources(merged.libraryContentSources),
    defaultProviderId: merged.defaultProviderId || null,
    readingAssistantProviderId: merged.readingAssistantProviderId || null,
    reviewAssistantProviderId: merged.reviewAssistantProviderId || null,
    assistantExecutionMode: merged.assistantExecutionMode || 'fast_response',
    messageSendShortcut: normalizeMessageSendShortcut(merged.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(merged.selectionActionShortcuts),
    saveArticleImages: Boolean(merged.saveArticleImages),
    developerModeEnabled: Boolean(merged.developerModeEnabled),
    logRetentionDays: merged.logRetentionDays || null,
    onboardingCompletedAt: merged.onboardingCompletedAt || null,
    updatedAt: new Date().toISOString(),
  };
  database
    .insert(schema.appSettings)
    .values(row)
    .onConflictDoUpdate({
      target: schema.appSettings.id,
      set: row,
    })
    .run();
}
