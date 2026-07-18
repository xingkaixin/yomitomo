import type { AppSettings } from '@yomitomo/shared';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

type SettingsDraftSection = 'external' | 'general' | 'routes' | 'shortcuts';

const settingsDraftSectionByField = {
  uiLanguage: 'general',
  themeId: 'external',
  soundEffectsEnabled: 'general',
  soundEffectsVolume: 'general',
  appLockEnabled: 'external',
  appLockLocked: 'external',
  appLockLockOnStartup: 'general',
  appLockShortcut: 'external',
  libraryPageSize: 'external',
  libraryContentSources: 'general',
  defaultProviderId: 'external',
  readingAssistantProviderId: 'routes',
  reviewAssistantProviderId: 'routes',
  bilingualTranslationProviderId: 'routes',
  bilingualTranslationTargetLanguage: 'general',
  bilingualTranslationStyle: 'general',
  bilingualTranslationAiContextAware: 'general',
  assistantExecutionMode: 'routes',
  messageSendShortcut: 'shortcuts',
  selectionActionShortcuts: 'shortcuts',
  saveArticleImages: 'general',
  allowLocalNetworkArticleImport: 'general',
  telemetryEnabled: 'general',
  developerModeEnabled: 'external',
  logRetentionDays: 'external',
  onboardingCompletedAt: 'external',
  lastSeenVersion: 'external',
} as const satisfies Record<keyof AppSettings, SettingsDraftSection>;

export function settingsDraftSectionHasChanges(
  section: Exclude<SettingsDraftSection, 'external'>,
  draft: AppSettings,
  saved: AppSettings,
) {
  const normalizedDraft = normalizeAppSettings(draft);
  const normalizedSaved = normalizeAppSettings(saved);

  return (Object.keys(settingsDraftSectionByField) as Array<keyof AppSettings>).some(
    (field) =>
      settingsDraftSectionByField[field] === section &&
      JSON.stringify(normalizedDraft[field]) !== JSON.stringify(normalizedSaved[field]),
  );
}
