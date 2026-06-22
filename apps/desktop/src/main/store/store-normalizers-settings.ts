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

export function normalizeSettings(settings: AppSettings | undefined): AppSettings {
  return {
    uiLanguage: normalizeUiLanguage(settings?.uiLanguage),
    themeId: settings?.themeId || undefined,
    soundEffectsEnabled: settings?.soundEffectsEnabled ?? true,
    soundEffectsVolume: normalizeSoundEffectsVolume(settings?.soundEffectsVolume),
    appLockEnabled: Boolean(settings?.appLockEnabled),
    appLockLocked: Boolean(settings?.appLockEnabled && settings?.appLockLocked),
    appLockLockOnStartup: Boolean(settings?.appLockEnabled && settings?.appLockLockOnStartup),
    appLockShortcut: normalizeAppLockShortcut(settings?.appLockShortcut),
    libraryPageSize: normalizeLibraryPageSize(settings?.libraryPageSize),
    libraryContentSources: normalizeLibraryContentSources(settings?.libraryContentSources),
    defaultProviderId: settings?.defaultProviderId || undefined,
    readingAssistantProviderId: settings?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settings?.reviewAssistantProviderId || undefined,
    bilingualTranslationProviderId: settings?.bilingualTranslationProviderId || undefined,
    bilingualTranslationTargetLanguage: normalizeTranslationTargetLanguage(
      settings?.bilingualTranslationTargetLanguage,
    ),
    bilingualTranslationStyle: normalizeTranslationStyle(settings?.bilingualTranslationStyle),
    bilingualTranslationAiContextAware: Boolean(settings?.bilingualTranslationAiContextAware),
    assistantExecutionMode: normalizeAssistantExecutionMode(settings?.assistantExecutionMode),
    messageSendShortcut: normalizeMessageSendShortcut(settings?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(settings?.selectionActionShortcuts),
    saveArticleImages: Boolean(settings?.saveArticleImages),
    allowLocalNetworkArticleImport: Boolean(settings?.allowLocalNetworkArticleImport),
    telemetryEnabled: settings?.telemetryEnabled ?? true,
    developerModeEnabled: Boolean(settings?.developerModeEnabled),
    logRetentionDays: normalizeLogRetentionDays(settings?.logRetentionDays),
    onboardingCompletedAt: settings?.onboardingCompletedAt || undefined,
    lastSeenVersion: settings?.lastSeenVersion || undefined,
  };
}

function normalizeBooleanSetting(value: unknown, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function normalizeLogRetentionDays(value: unknown) {
  return value === 15 || value === 30 || value === 90 ? value : undefined;
}

function normalizeLibraryPageSize(value: unknown) {
  return value === 6 || value === 12 || value === 18 || value === 24 ? value : undefined;
}

function normalizeAppLockShortcut(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 && text.length <= 80 ? text : undefined;
}

function normalizeTranslationTargetLanguage(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === 'en' || text.toLowerCase() === 'english') return 'en';
  return 'zh-CN';
}

function normalizeTranslationStyle(value: unknown) {
  return value === 'blur' ||
    value === 'blockquote' ||
    value === 'weakened' ||
    value === 'border' ||
    value === 'dashedLine'
    ? value
    : 'dashedLine';
}
