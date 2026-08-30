import type { ResolvedAppSettings } from '@yomitomo/shared';
import {
  normalizeAssistantExecutionMode,
  normalizeLibraryContentSources,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  normalizeSoundEffectsVolume,
  normalizeUiLanguage,
} from '@yomitomo/shared';

type AppSettingsInput = Partial<Record<keyof ResolvedAppSettings, unknown>>;

export function normalizeAppSettings(settings: AppSettingsInput | undefined): ResolvedAppSettings {
  return {
    uiLanguage: normalizeUiLanguage(settings?.uiLanguage),
    themeId: normalizeOptionalString(settings?.themeId),
    soundEffectsEnabled: normalizeBoolean(settings?.soundEffectsEnabled, true),
    soundEffectsVolume: normalizeSoundEffectsVolume(settings?.soundEffectsVolume),
    appLockEnabled: Boolean(settings?.appLockEnabled),
    appLockLocked: Boolean(settings?.appLockEnabled && settings?.appLockLocked),
    appLockLockOnStartup: Boolean(settings?.appLockEnabled && settings?.appLockLockOnStartup),
    appLockShortcut: normalizeAppLockShortcut(settings?.appLockShortcut),
    libraryPageSize: normalizeLibraryPageSize(settings?.libraryPageSize),
    libraryContentSources: normalizeLibraryContentSources(settings?.libraryContentSources),
    defaultProviderId: normalizeOptionalString(settings?.defaultProviderId),
    readingAssistantProviderId: normalizeOptionalString(settings?.readingAssistantProviderId),
    reviewAssistantProviderId: normalizeOptionalString(settings?.reviewAssistantProviderId),
    bilingualTranslationProviderId: normalizeOptionalString(
      settings?.bilingualTranslationProviderId,
    ),
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
    readingMemoryRemoteConsent: settings?.readingMemoryRemoteConsent === true,
    telemetryEnabled: normalizeBoolean(settings?.telemetryEnabled, true),
    developerModeEnabled: Boolean(settings?.developerModeEnabled),
    logRetentionDays: normalizeLogRetentionDays(settings?.logRetentionDays),
    onboardingCompletedAt: normalizeOptionalString(settings?.onboardingCompletedAt),
    lastSeenVersion: normalizeOptionalString(settings?.lastSeenVersion),
  };
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return value === undefined || value === null ? fallback : Boolean(value);
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
  if (text === 'ja' || text.toLowerCase() === 'japanese' || text === '日本語') return 'ja';
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
