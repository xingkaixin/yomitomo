import type { AppSettings, UserProfile } from '@yomitomo/shared';
import {
  normalizeLibraryContentSources,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  normalizeSoundEffectsVolume,
  normalizeUiLanguage,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
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
): Pick<AppSettings, 'saveArticleImages' | 'allowLocalNetworkArticleImport'> {
  const settings = database.select().from(schema.appSettings).limit(1).get();
  return {
    saveArticleImages: Boolean(settings?.saveArticleImages),
    allowLocalNetworkArticleImport: Boolean(settings?.allowLocalNetworkArticleImport),
  };
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
    uiLanguage: normalizeUiLanguage(merged.uiLanguage),
    themeId: merged.themeId || null,
    soundEffectsEnabled: merged.soundEffectsEnabled ?? true,
    soundEffectsVolume: normalizeSoundEffectsVolume(merged.soundEffectsVolume),
    appLockEnabled: Boolean(merged.appLockEnabled),
    appLockLocked: Boolean(merged.appLockEnabled && merged.appLockLocked),
    appLockLockOnStartup: Boolean(merged.appLockEnabled && merged.appLockLockOnStartup),
    appLockShortcut: merged.appLockShortcut || null,
    libraryPageSize: merged.libraryPageSize || null,
    libraryContentSources: normalizeLibraryContentSources(merged.libraryContentSources),
    defaultProviderId: merged.defaultProviderId || null,
    readingAssistantProviderId: merged.readingAssistantProviderId || null,
    reviewAssistantProviderId: merged.reviewAssistantProviderId || null,
    bilingualTranslationProviderId: merged.bilingualTranslationProviderId || null,
    bilingualTranslationTargetLanguage: merged.bilingualTranslationTargetLanguage || null,
    bilingualTranslationStyle: merged.bilingualTranslationStyle || null,
    bilingualTranslationAiContextAware: Boolean(merged.bilingualTranslationAiContextAware),
    assistantExecutionMode: merged.assistantExecutionMode || 'fast_response',
    messageSendShortcut: normalizeMessageSendShortcut(merged.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(merged.selectionActionShortcuts),
    saveArticleImages: Boolean(merged.saveArticleImages),
    allowLocalNetworkArticleImport: Boolean(merged.allowLocalNetworkArticleImport),
    telemetryEnabled: merged.telemetryEnabled ?? true,
    developerModeEnabled: Boolean(merged.developerModeEnabled),
    logRetentionDays: merged.logRetentionDays ?? 90,
    onboardingCompletedAt: merged.onboardingCompletedAt || null,
    lastSeenVersion: merged.lastSeenVersion || null,
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
