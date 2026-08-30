import type { AppSettingsPatch, ResolvedAppSettings } from '@yomitomo/shared';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

type SettingsDraftSection = 'external' | SettingsEditorSection;

export type SettingsEditorSection = 'general' | 'routes' | 'shortcuts';

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
  readingMemoryRemoteConsent: 'external',
  developerModeEnabled: 'external',
  logRetentionDays: 'external',
  onboardingCompletedAt: 'external',
  lastSeenVersion: 'external',
} as const satisfies Record<keyof ResolvedAppSettings, SettingsDraftSection>;

export function settingsDraftSectionHasChanges(
  section: SettingsEditorSection,
  draft: ResolvedAppSettings,
  saved: ResolvedAppSettings,
) {
  const normalizedDraft = normalizeAppSettings(draft);
  const normalizedSaved = normalizeAppSettings(saved);

  return (Object.keys(settingsDraftSectionByField) as Array<keyof ResolvedAppSettings>).some(
    (field) =>
      settingsDraftSectionByField[field] === section &&
      JSON.stringify(normalizedDraft[field]) !== JSON.stringify(normalizedSaved[field]),
  );
}

export function settingsDraftSectionPatch(
  section: SettingsEditorSection,
  draft: ResolvedAppSettings,
): AppSettingsPatch {
  const normalizedDraft = normalizeAppSettings(draft);
  const patch: AppSettingsPatch = {};
  for (const field of Object.keys(settingsDraftSectionByField) as Array<
    keyof ResolvedAppSettings
  >) {
    if (settingsDraftSectionByField[field] !== section) continue;
    Object.assign(patch, { [field]: normalizedDraft[field] });
  }
  return patch;
}

export function mergeSavedSettingsDraftSection(
  section: SettingsEditorSection,
  draft: ResolvedAppSettings,
  saved: ResolvedAppSettings,
): ResolvedAppSettings {
  const merged = { ...draft };
  for (const field of Object.keys(settingsDraftSectionByField) as Array<
    keyof ResolvedAppSettings
  >) {
    if (settingsDraftSectionByField[field] !== section) continue;
    Object.assign(merged, { [field]: saved[field] });
  }
  return merged;
}
