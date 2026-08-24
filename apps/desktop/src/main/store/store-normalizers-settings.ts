import type { AppSettingsPatch, ResolvedAppSettings } from '@yomitomo/shared';
import * as schema from '../db/schema';
import { normalizeAppSettings } from '../../settings/app-settings-normalization';

export function mergeSettingsForUpsert(
  settings: AppSettingsPatch,
  existing?: AppSettingsPatch,
): ResolvedAppSettings {
  const selectionActionShortcuts = settings.selectionActionShortcuts
    ? { ...existing?.selectionActionShortcuts, ...settings.selectionActionShortcuts }
    : settings.selectionActionShortcuts;
  return normalizeAppSettings({
    ...existing,
    ...settings,
    ...(Object.hasOwn(settings, 'selectionActionShortcuts') ? { selectionActionShortcuts } : {}),
  });
}

export function rowToSettings(
  row: typeof schema.appSettings.$inferSelect | undefined,
): ResolvedAppSettings {
  if (!row) return normalizeAppSettings(undefined);
  const { annotationMemoryBackfillVersion, id, updatedAt, ...settings } = row;
  void annotationMemoryBackfillVersion;
  void id;
  void updatedAt;
  return normalizeAppSettings(settings);
}

export const normalizeSettings = normalizeAppSettings;

export function settingsToRow(settings: ResolvedAppSettings, updatedAt = new Date().toISOString()) {
  const normalized = normalizeAppSettings(settings);
  return {
    ...normalized,
    id: 'default',
    themeId: normalized.themeId ?? null,
    appLockShortcut: normalized.appLockShortcut ?? null,
    libraryPageSize: normalized.libraryPageSize ?? null,
    defaultProviderId: normalized.defaultProviderId ?? null,
    readingAssistantProviderId: normalized.readingAssistantProviderId ?? null,
    reviewAssistantProviderId: normalized.reviewAssistantProviderId ?? null,
    bilingualTranslationProviderId: normalized.bilingualTranslationProviderId ?? null,
    onboardingCompletedAt: normalized.onboardingCompletedAt ?? null,
    lastSeenVersion: normalized.lastSeenVersion ?? null,
    updatedAt,
  } satisfies Omit<typeof schema.appSettings.$inferInsert, 'annotationMemoryBackfillVersion'>;
}
