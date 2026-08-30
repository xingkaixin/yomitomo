import { lazy } from 'react';
import { preloadedExport, preloadEntries } from './app-secondary-module-preload';

/**
 * Owns how each surface is code-split and which preloaded export supersedes its lazy
 * fallback, so the root view sees plain components instead of preload entry status.
 */
export const ReadingLibrary = lazy(() =>
  import('../reading-library/app-reading-library').then((module) => ({
    default: module.ReadingLibrary,
  })),
);

export const ReadingMemory = lazy(() =>
  import('../reading-memory/app-reading-memory').then((module) => ({
    default: module.ReadingMemory,
  })),
);

export const OnboardingFlow = lazy(() =>
  import('./app-onboarding').then((module) => ({ default: module.OnboardingFlow })),
);

const LazyReadingStatsPanel = lazy(() =>
  preloadEntries.stats.load().then((module) => ({ default: module.ReadingStatsPanel })),
);
const LazyAgentSettings = lazy(() =>
  preloadEntries.agents.load().then((module) => ({ default: module.AgentSettings })),
);
const LazySettingsSectionShell = lazy(() =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.SettingsSectionShell })),
);
const LazyGeneralSettings = lazy(() =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.GeneralSettings })),
);
const LazyShortcutSettings = lazy(() =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.ShortcutSettings })),
);
const LazyDataSourcesPanel = lazy(() =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.DataSourcesPanel })),
);
const LazyDataManagementSettings = lazy(() =>
  preloadEntries.settingsPanels
    .load()
    .then((module) => ({ default: module.DataManagementSettings })),
);
const LazyAiTraceSettingsPanel = lazy(() =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.AiTraceSettingsPanel })),
);
const LazyProviderSettings = lazy(() =>
  preloadEntries.settingsProvider.load().then((module) => ({ default: module.ProviderSettings })),
);
const LazyAboutSettings = lazy(() =>
  preloadEntries.settingsAbout.load().then((module) => ({ default: module.AboutSettings })),
);
const LazyUserProfileSettingsDialog = lazy(() =>
  preloadEntries.profileDialog
    .load()
    .then((module) => ({ default: module.UserProfileSettingsDialog })),
);

export function activeSurfaceComponents() {
  return {
    AboutSettings: preloadedExport(
      preloadEntries.settingsAbout,
      'AboutSettings',
      LazyAboutSettings,
    ),
    AgentSettings: preloadedExport(preloadEntries.agents, 'AgentSettings', LazyAgentSettings),
    AiTraceSettingsPanel: preloadedExport(
      preloadEntries.settingsPanels,
      'AiTraceSettingsPanel',
      LazyAiTraceSettingsPanel,
    ),
    DataManagementSettings: preloadedExport(
      preloadEntries.settingsPanels,
      'DataManagementSettings',
      LazyDataManagementSettings,
    ),
    DataSourcesPanel: preloadedExport(
      preloadEntries.settingsPanels,
      'DataSourcesPanel',
      LazyDataSourcesPanel,
    ),
    GeneralSettings: preloadedExport(
      preloadEntries.settingsPanels,
      'GeneralSettings',
      LazyGeneralSettings,
    ),
    ProviderSettings: preloadedExport(
      preloadEntries.settingsProvider,
      'ProviderSettings',
      LazyProviderSettings,
    ),
    ReadingStatsPanel: preloadedExport(
      preloadEntries.stats,
      'ReadingStatsPanel',
      LazyReadingStatsPanel,
    ),
    SettingsSectionShell: preloadedExport(
      preloadEntries.settingsPanels,
      'SettingsSectionShell',
      LazySettingsSectionShell,
    ),
    ShortcutSettings: preloadedExport(
      preloadEntries.settingsPanels,
      'ShortcutSettings',
      LazyShortcutSettings,
    ),
    UserProfileSettingsDialog: preloadedExport(
      preloadEntries.profileDialog,
      'UserProfileSettingsDialog',
      LazyUserProfileSettingsDialog,
    ),
  };
}
