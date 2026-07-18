import type { AppSettings } from '@yomitomo/shared';
import {
  normalizeAssistantExecutionMode,
  normalizeLibraryContentSources,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  normalizeSoundEffectsVolume,
  normalizeUiLanguage,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import {
  normalizeAppLockShortcut,
  normalizeAppSettings,
  normalizeLibraryPageSize,
  normalizeLogRetentionDays,
  normalizeTranslationStyle,
  normalizeTranslationTargetLanguage,
} from '../../settings/app-settings-normalization';

export function mergeSettingsForUpsert(settings: AppSettings, existing?: AppSettings): AppSettings {
  return {
    uiLanguage: settingsFieldProvided(settings, 'uiLanguage')
      ? normalizeUiLanguage(settings.uiLanguage)
      : normalizeUiLanguage(existing?.uiLanguage),
    themeId: settingsFieldProvided(settings, 'themeId')
      ? settings.themeId || undefined
      : existing?.themeId || undefined,
    soundEffectsEnabled: settingsFieldProvided(settings, 'soundEffectsEnabled')
      ? Boolean(settings.soundEffectsEnabled)
      : (existing?.soundEffectsEnabled ?? true),
    soundEffectsVolume: settingsFieldProvided(settings, 'soundEffectsVolume')
      ? normalizeSoundEffectsVolume(settings.soundEffectsVolume)
      : normalizeSoundEffectsVolume(existing?.soundEffectsVolume),
    appLockEnabled: settingsFieldProvided(settings, 'appLockEnabled')
      ? Boolean(settings.appLockEnabled)
      : Boolean(existing?.appLockEnabled),
    appLockLocked: settingsFieldProvided(settings, 'appLockLocked')
      ? Boolean(settings.appLockLocked)
      : Boolean(existing?.appLockLocked),
    appLockLockOnStartup: settingsFieldProvided(settings, 'appLockLockOnStartup')
      ? Boolean(settings.appLockLockOnStartup)
      : Boolean(existing?.appLockLockOnStartup),
    appLockShortcut: settingsFieldProvided(settings, 'appLockShortcut')
      ? normalizeAppLockShortcut(settings.appLockShortcut)
      : normalizeAppLockShortcut(existing?.appLockShortcut),
    libraryPageSize: settingsFieldProvided(settings, 'libraryPageSize')
      ? normalizeLibraryPageSize(settings.libraryPageSize)
      : normalizeLibraryPageSize(existing?.libraryPageSize),
    libraryContentSources: settingsFieldProvided(settings, 'libraryContentSources')
      ? normalizeLibraryContentSources(settings.libraryContentSources)
      : normalizeLibraryContentSources(existing?.libraryContentSources),
    defaultProviderId: settingsFieldProvided(settings, 'defaultProviderId')
      ? settings.defaultProviderId || undefined
      : existing?.defaultProviderId || undefined,
    readingAssistantProviderId: settingsFieldProvided(settings, 'readingAssistantProviderId')
      ? settings.readingAssistantProviderId || undefined
      : existing?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settingsFieldProvided(settings, 'reviewAssistantProviderId')
      ? settings.reviewAssistantProviderId || undefined
      : existing?.reviewAssistantProviderId || undefined,
    bilingualTranslationProviderId: settingsFieldProvided(
      settings,
      'bilingualTranslationProviderId',
    )
      ? settings.bilingualTranslationProviderId || undefined
      : existing?.bilingualTranslationProviderId || undefined,
    bilingualTranslationTargetLanguage: settingsFieldProvided(
      settings,
      'bilingualTranslationTargetLanguage',
    )
      ? normalizeTranslationTargetLanguage(settings.bilingualTranslationTargetLanguage)
      : normalizeTranslationTargetLanguage(existing?.bilingualTranslationTargetLanguage),
    bilingualTranslationStyle: settingsFieldProvided(settings, 'bilingualTranslationStyle')
      ? normalizeTranslationStyle(settings.bilingualTranslationStyle)
      : normalizeTranslationStyle(existing?.bilingualTranslationStyle),
    bilingualTranslationAiContextAware: settingsFieldProvided(
      settings,
      'bilingualTranslationAiContextAware',
    )
      ? Boolean(settings.bilingualTranslationAiContextAware)
      : Boolean(existing?.bilingualTranslationAiContextAware),
    assistantExecutionMode: settingsFieldProvided(settings, 'assistantExecutionMode')
      ? normalizeAssistantExecutionMode(settings.assistantExecutionMode)
      : normalizeAssistantExecutionMode(existing?.assistantExecutionMode),
    messageSendShortcut: settingsFieldProvided(settings, 'messageSendShortcut')
      ? normalizeMessageSendShortcut(settings.messageSendShortcut)
      : normalizeMessageSendShortcut(existing?.messageSendShortcut),
    selectionActionShortcuts: settingsFieldProvided(settings, 'selectionActionShortcuts')
      ? normalizeSelectionActionShortcuts(settings.selectionActionShortcuts)
      : normalizeSelectionActionShortcuts(existing?.selectionActionShortcuts),
    saveArticleImages: settingsFieldProvided(settings, 'saveArticleImages')
      ? Boolean(settings.saveArticleImages)
      : Boolean(existing?.saveArticleImages),
    allowLocalNetworkArticleImport: settingsFieldProvided(
      settings,
      'allowLocalNetworkArticleImport',
    )
      ? Boolean(settings.allowLocalNetworkArticleImport)
      : Boolean(existing?.allowLocalNetworkArticleImport),
    telemetryEnabled: settingsFieldProvided(settings, 'telemetryEnabled')
      ? Boolean(settings.telemetryEnabled)
      : (existing?.telemetryEnabled ?? true),
    developerModeEnabled: settingsFieldProvided(settings, 'developerModeEnabled')
      ? Boolean(settings.developerModeEnabled)
      : Boolean(existing?.developerModeEnabled),
    logRetentionDays: settingsFieldProvided(settings, 'logRetentionDays')
      ? normalizeLogRetentionDays(settings.logRetentionDays)
      : normalizeLogRetentionDays(existing?.logRetentionDays),
    onboardingCompletedAt: settingsFieldProvided(settings, 'onboardingCompletedAt')
      ? settings.onboardingCompletedAt || undefined
      : existing?.onboardingCompletedAt || undefined,
    lastSeenVersion: settingsFieldProvided(settings, 'lastSeenVersion')
      ? settings.lastSeenVersion || undefined
      : existing?.lastSeenVersion || undefined,
  };
}

function settingsFieldProvided(settings: AppSettings, field: keyof AppSettings) {
  return Object.prototype.hasOwnProperty.call(settings, field);
}

export function rowToSettings(
  row: typeof schema.appSettings.$inferSelect | undefined,
): AppSettings {
  return {
    uiLanguage: normalizeUiLanguage(row?.uiLanguage),
    themeId: row?.themeId || undefined,
    soundEffectsEnabled: normalizeBooleanSetting(row?.soundEffectsEnabled, true),
    soundEffectsVolume: normalizeSoundEffectsVolume(row?.soundEffectsVolume),
    appLockEnabled: Boolean(row?.appLockEnabled),
    appLockLocked: Boolean(row?.appLockEnabled && row?.appLockLocked),
    appLockLockOnStartup: Boolean(row?.appLockEnabled && row?.appLockLockOnStartup),
    appLockShortcut: normalizeAppLockShortcut(row?.appLockShortcut),
    libraryPageSize: normalizeLibraryPageSize(row?.libraryPageSize),
    libraryContentSources: normalizeLibraryContentSources(row?.libraryContentSources),
    defaultProviderId: row?.defaultProviderId || undefined,
    readingAssistantProviderId: row?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: row?.reviewAssistantProviderId || undefined,
    bilingualTranslationProviderId: row?.bilingualTranslationProviderId || undefined,
    bilingualTranslationTargetLanguage: normalizeTranslationTargetLanguage(
      row?.bilingualTranslationTargetLanguage,
    ),
    bilingualTranslationStyle: normalizeTranslationStyle(row?.bilingualTranslationStyle),
    bilingualTranslationAiContextAware: Boolean(row?.bilingualTranslationAiContextAware),
    assistantExecutionMode: normalizeAssistantExecutionMode(row?.assistantExecutionMode),
    messageSendShortcut: normalizeMessageSendShortcut(row?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(row?.selectionActionShortcuts),
    saveArticleImages: Boolean(row?.saveArticleImages),
    allowLocalNetworkArticleImport: Boolean(row?.allowLocalNetworkArticleImport),
    telemetryEnabled: normalizeBooleanSetting(row?.telemetryEnabled, true),
    developerModeEnabled: Boolean(row?.developerModeEnabled),
    logRetentionDays: normalizeLogRetentionDays(row?.logRetentionDays),
    onboardingCompletedAt: row?.onboardingCompletedAt || undefined,
    lastSeenVersion: row?.lastSeenVersion || undefined,
  };
}

export const normalizeSettings = normalizeAppSettings;

function normalizeBooleanSetting(value: unknown, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}
