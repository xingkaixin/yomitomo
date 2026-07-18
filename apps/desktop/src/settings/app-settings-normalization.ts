import type { AppSettings } from '@yomitomo/shared';
import {
  normalizeAssistantExecutionMode,
  normalizeLibraryContentSources,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  normalizeSoundEffectsVolume,
  normalizeUiLanguage,
} from '@yomitomo/shared';

export function normalizeAppSettings(settings: AppSettings | undefined): AppSettings {
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

export function normalizeLogRetentionDays(value: unknown) {
  return value === 15 || value === 30 || value === 90 ? value : 90;
}

export function normalizeLibraryPageSize(value: unknown) {
  return value === 6 || value === 12 || value === 18 || value === 24 ? value : undefined;
}

export function normalizeAppLockShortcut(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 && text.length <= 80 ? text : undefined;
}

export function normalizeTranslationTargetLanguage(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === 'en' || text.toLowerCase() === 'english') return 'en';
  return 'zh-CN';
}

export function normalizeTranslationStyle(value: unknown) {
  return value === 'blur' ||
    value === 'blockquote' ||
    value === 'weakened' ||
    value === 'border' ||
    value === 'dashedLine'
    ? value
    : 'dashedLine';
}
