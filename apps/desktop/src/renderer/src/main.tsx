import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, ArticleSummaryRecord } from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { readerBackgroundTone } from '@yomitomo/reader-ui/reader-settings';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useTranslation } from 'react-i18next';
import { LockKeyhole, Volume2 } from 'lucide-react';

import type { SettingsSectionKey } from './settings/app-settings-panels';
import { AvatarImage } from './shell/app-ui';
import { useAppAgentActions } from './shell/app-agent-actions';
import { useAppArticleStoreActions } from './shell/app-article-store-actions';
import { useDesktopStoreState } from './shell/app-desktop-store-state';
import { useSettingsDrafts } from './settings/app-settings-drafts';
import { SettingsNavButton } from './settings/app-settings-nav-button';
import { StoreLoadErrorScreen } from './shell/app-store-load-error';
import {
  normalizeDesktopReaderSettings,
  readDesktopReaderBackgroundsByTone,
  readDesktopReaderSettings,
  writeDesktopReaderSettings,
} from './settings/app-reader-settings';
import {
  applyAppTheme,
  readCachedThemeIdsByTone,
  readCachedThemeId,
  resolveAppThemeId,
  themeRegistry,
  writeCachedThemeId,
  type AppThemeId,
} from './theme/app-theme';
import { AnnotationDiscussionWindowApp } from './annotation-discussion/app-annotation-discussion-window';
import { AnnotationSedimentationWindowApp } from './annotation-discussion/app-annotation-sedimentation-window';
import { ThemeSelector } from './theme/app-theme-selector';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './components/ui/input-otp';
import { ShimmeringText } from './components/ui/shimmering-text';
import {
  SlideToUnlock,
  SlideToUnlockHandle,
  SlideToUnlockText,
  SlideToUnlockTrack,
} from './components/ui/slide-to-unlock';
import { elementDialogSourceRect, type DialogSourceRect } from './shell/app-dialog-transition';
import { UpdateReleaseDialog } from './shell/app-update-dialog';
import { changeAppI18nLanguage, initializeAppI18n } from './i18n/app-i18n';
import { readCachedUiLanguage, writeCachedUiLanguage } from './i18n/app-language-cache';
import { playAppSoundEffect } from './sound/app-sound-effects';
import { AppToaster, useHeaderToastOffset } from './shell/app-toast';
import './styles.css';
import 'goey-toast/styles.css';

const startupUiLanguage = readCachedUiLanguage();
initializeAppI18n(startupUiLanguage);
const startupThemeId = readCachedThemeId();
const startupThemeIdsByTone = readCachedThemeIdsByTone();
const startupReaderSettings = readDesktopReaderSettings();
const startupReaderBackgroundsByTone = readDesktopReaderBackgroundsByTone();
applyAppTheme(themeRegistry[startupThemeId]);
const appLockShortcutKeys = [getShortcutModifier(), 'L'];

function compatibleReaderBackgroundForTheme(
  themeId: AppThemeId,
  backgroundColor: string,
  previousThemeId?: AppThemeId,
) {
  const tone = themeRegistry[themeId].meta.tone;
  if (readerBackgroundTone(backgroundColor) !== tone) return themeRegistry[themeId].reader.paper;
  if (
    previousThemeId &&
    previousThemeId !== themeId &&
    backgroundColor === themeRegistry[previousThemeId].reader.paper
  ) {
    return themeRegistry[themeId].reader.paper;
  }
  return backgroundColor;
}

const rendererModuleLoadedAt = performance.now();
const loadReadingLibrary = () =>
  import('./reading-library/app-reading-library').then((module) => ({
    default: module.ReadingLibrary,
  }));
const loadReadingStatsModule = () => preloadEntries.stats.load();
const loadReadingStatsPanel = () =>
  loadReadingStatsModule().then((module) => ({ default: module.ReadingStatsPanel }));
const loadOnboardingFlow = () =>
  import('./shell/app-onboarding').then((module) => ({ default: module.OnboardingFlow }));
const loadAgentSettings = () =>
  preloadEntries.agents.load().then((module) => ({ default: module.AgentSettings }));
const loadDataManagementSettings = () =>
  preloadEntries.settingsPanels
    .load()
    .then((module) => ({ default: module.DataManagementSettings }));
const loadAiTraceSettingsPanel = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.AiTraceSettingsPanel }));
const loadGeneralSettings = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.GeneralSettings }));
const loadProviderSettings = () =>
  preloadEntries.settingsProvider.load().then((module) => ({ default: module.ProviderSettings }));
const loadShortcutSettings = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.ShortcutSettings }));
const loadDataSourcesPanel = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.DataSourcesPanel }));
const loadSettingsSectionShell = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.SettingsSectionShell }));
const loadUserProfileSettingsDialog = () =>
  preloadEntries.profileDialog
    .load()
    .then((module) => ({ default: module.UserProfileSettingsDialog }));
const loadAboutSettings = () =>
  preloadEntries.settingsAbout.load().then((module) => ({ default: module.AboutSettings }));

const ReadingLibrary = lazy(loadReadingLibrary);
const ReadingStatsPanel = lazy(loadReadingStatsPanel);
const OnboardingFlow = lazy(loadOnboardingFlow);
const AgentSettings = lazy(loadAgentSettings);
const DataManagementSettings = lazy(loadDataManagementSettings);
const AiTraceSettingsPanel = lazy(loadAiTraceSettingsPanel);
const GeneralSettings = lazy(loadGeneralSettings);
const ProviderSettings = lazy(loadProviderSettings);
const ShortcutSettings = lazy(loadShortcutSettings);
const DataSourcesPanel = lazy(loadDataSourcesPanel);
const SettingsSectionShell = lazy(loadSettingsSectionShell);
const UserProfileSettingsDialog = lazy(loadUserProfileSettingsDialog);
const AboutSettings = lazy(loadAboutSettings);

type ReadingStatsModule = typeof import('./reading-stats/app-reading-stats');
type AgentSettingsModule = typeof import('./settings/app-settings-agent-panel');
type SettingsPanelsModule = typeof import('./settings/app-settings-panels');
type SettingsProviderModule = typeof import('./settings/app-settings-provider-panel');
type SettingsAboutModule = typeof import('./shell/app-log-viewer');
type ProfileDialogModule = typeof import('./settings/app-settings-profile-dialog');

type PreloadStatus = 'not-started' | 'scheduled' | 'loading' | 'ready' | 'failed';
type PreloadKey =
  | 'agents'
  | 'stats'
  | 'settings-panels'
  | 'settings-provider'
  | 'settings-about'
  | 'profile-dialog';

type PreloadEntry<TModule> = {
  key: PreloadKey;
  status: PreloadStatus;
  module?: TModule;
  promise?: Promise<TModule>;
  markScheduled: () => void;
  load: () => Promise<TModule>;
};

const preloadListeners = new Set<() => void>();

function subscribePreloadModules(listener: () => void) {
  preloadListeners.add(listener);
  return () => {
    preloadListeners.delete(listener);
  };
}

function notifyPreloadModules() {
  for (const listener of preloadListeners) listener();
}

function createPreloadEntry<TModule>(
  key: PreloadKey,
  importModule: () => Promise<TModule>,
): PreloadEntry<TModule> {
  const entry: PreloadEntry<TModule> = {
    key,
    status: 'not-started',
    markScheduled: () => {
      if (entry.status !== 'not-started') return;
      entry.status = 'scheduled';
      recordStartupTiming('secondary_modules.preload_module_scheduled', { key });
      notifyPreloadModules();
    },
    load: () => {
      if (entry.module) return Promise.resolve(entry.module);
      if (entry.promise) return entry.promise;

      const startedAt = performance.now();
      entry.status = 'loading';
      recordStartupTiming('secondary_modules.preload_module_start', { key });
      notifyPreloadModules();
      entry.promise = importModule()
        .then((module) => {
          entry.module = module;
          entry.status = 'ready';
          recordStartupTiming('secondary_modules.preload_module_success', {
            key,
            durationMs: elapsedMs(startedAt),
          });
          notifyPreloadModules();
          return module;
        })
        .catch((error: unknown) => {
          entry.status = 'failed';
          entry.promise = undefined;
          recordStartupTiming('secondary_modules.preload_module_failed', {
            key,
            durationMs: elapsedMs(startedAt),
            message: error instanceof Error ? error.message : String(error),
          });
          notifyPreloadModules();
          throw error;
        });
      return entry.promise;
    },
  };
  return entry;
}

const preloadEntries = {
  agents: createPreloadEntry<AgentSettingsModule>(
    'agents',
    () => import('./settings/app-settings-agent-panel'),
  ),
  stats: createPreloadEntry<ReadingStatsModule>(
    'stats',
    () => import('./reading-stats/app-reading-stats'),
  ),
  settingsPanels: createPreloadEntry<SettingsPanelsModule>(
    'settings-panels',
    () => import('./settings/app-settings-panels'),
  ),
  settingsProvider: createPreloadEntry<SettingsProviderModule>(
    'settings-provider',
    () => import('./settings/app-settings-provider-panel'),
  ),
  settingsAbout: createPreloadEntry<SettingsAboutModule>(
    'settings-about',
    () => import('./shell/app-log-viewer'),
  ),
  profileDialog: createPreloadEntry<ProfileDialogModule>(
    'profile-dialog',
    () => import('./settings/app-settings-profile-dialog'),
  ),
};

function preloadIdleModules(articles: ArticleSummaryRecord[]) {
  recordStartupTiming('secondary_modules.preload_scheduled');
  const tasks = [
    () => preloadEntries.settingsPanels.load(),
    () => preloadEntries.settingsProvider.load(),
    () => preloadEntries.settingsAbout.load(),
    () => preloadEntries.profileDialog.load(),
    () => preloadEntries.agents.load(),
    () =>
      preloadEntries.stats.load().then((module) => {
        module.preloadReadingStatsFirstPaintData(articles);
        return module.preloadReadingStatsDeferredModules();
      }),
  ];
  scheduleIdlePreloadQueue(tasks);
}

type IdlePreloadHandle =
  | { kind: 'idle'; id: number }
  | { kind: 'timeout'; id: ReturnType<typeof globalThis.setTimeout> };

function scheduleIdlePreload(callback: () => void): IdlePreloadHandle {
  if ('requestIdleCallback' in window) {
    return { kind: 'idle', id: window.requestIdleCallback(callback, { timeout: 3000 }) };
  }
  return { kind: 'timeout', id: globalThis.setTimeout(callback, 800) };
}

function cancelIdlePreload(handle: IdlePreloadHandle) {
  if (handle.kind === 'idle') window.cancelIdleCallback(handle.id);
  else globalThis.clearTimeout(handle.id);
}

function scheduleIdlePreloadQueue(tasks: Array<() => Promise<unknown>>) {
  let taskIndex = 0;
  const runNextTask = () => {
    const task = tasks[taskIndex];
    taskIndex += 1;
    if (!task) {
      recordStartupTiming('secondary_modules.preload_complete');
      return;
    }
    void task()
      .catch(() => undefined)
      .finally(() => scheduleIdlePreload(runNextTask));
  };
  for (const entry of Object.values(preloadEntries)) entry.markScheduled();
  scheduleIdlePreload(runNextTask);
}

type SettingKey = 'library' | 'stats' | 'settings' | 'agents';

function App() {
  const { t, i18n } = useTranslation();
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [activeThemeId, setActiveThemeId] = useState<AppThemeId>(startupThemeId);
  const [themeIdsByTone, setThemeIdsByTone] = useState(startupThemeIdsByTone);
  const [readerBackgroundColor, setReaderBackgroundColor] = useState(
    compatibleReaderBackgroundForTheme(startupThemeId, startupReaderSettings.backgroundColor),
  );
  const [readerBackgroundsByTone, setReaderBackgroundsByTone] = useState(
    startupReaderBackgroundsByTone,
  );
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const [, setPreloadVersion] = useState(0);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileDialogSourceRect, setProfileDialogSourceRect] = useState<DialogSourceRect>();
  const [libraryReaderOpen, setLibraryReaderOpen] = useState(false);
  const [pendingOpenArticleId, setPendingOpenArticleId] = useState<string | null>(null);
  const [appLockStep, setAppLockStep] = useState<'slide' | 'pin'>('slide');
  const [appLockPin, setAppLockPin] = useState('');
  const [appLockPinInputKey, setAppLockPinInputKey] = useState(0);
  const [appLockError, setAppLockError] = useState('');
  const [appLockVerifying, setAppLockVerifying] = useState(false);
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [onboardingFlowKey, setOnboardingFlowKey] = useState(0);
  const [statsNavigationStartedAt, setStatsNavigationStartedAt] = useState<number | undefined>();
  const windowShowRequestedRef = useRef(false);
  const idlePreloadStartedRef = useRef(false);
  const toastTopOffset = useHeaderToastOffset(libraryReaderOpen);

  useEffect(() => {
    recordStartupTiming('app.mounted');
    requestMainWindow('app.mounted', { storeLoaded: false, storeLoadError: false });
  }, []);

  useEffect(() => {
    applyAppTheme(themeRegistry[activeThemeId]);
  }, [activeThemeId]);

  useEffect(() => subscribePreloadModules(() => setPreloadVersion((version) => version + 1)), []);

  const {
    store,
    storeLoaded,
    storeLoadError,
    storeSyncSnapshot,
    storeRef,
    refreshStore,
    applyStore,
  } = useDesktopStoreState();

  useEffect(() => {
    if (!storeLoaded || storeLoadError) return;
    const storedUiLanguage = normalizeUiLanguage(store.settings.uiLanguage);
    writeCachedUiLanguage(storedUiLanguage);
    changeAppI18nLanguage(storedUiLanguage);
    const storedThemeId = resolveAppThemeId(store.settings.themeId);
    setActiveThemeId((currentThemeId) =>
      currentThemeId === storedThemeId ? currentThemeId : storedThemeId,
    );
    setThemeIdsByTone((currentThemeIds) => ({
      ...currentThemeIds,
      [themeRegistry[storedThemeId].meta.tone]: storedThemeId,
    }));
    const currentReaderSettings = readDesktopReaderSettings();
    const nextBackgroundColor = compatibleReaderBackgroundForTheme(
      storedThemeId,
      currentReaderSettings.backgroundColor,
    );
    if (nextBackgroundColor !== currentReaderSettings.backgroundColor) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...currentReaderSettings,
        backgroundColor: nextBackgroundColor,
      });
      setReaderBackgroundColor(nextSettings.backgroundColor);
      setReaderBackgroundsByTone((currentBackgrounds) => ({
        ...currentBackgrounds,
        [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
      }));
      writeDesktopReaderSettings(nextSettings);
    }
    writeCachedThemeId(storedThemeId);
  }, [store.settings.themeId, store.settings.uiLanguage, storeLoadError, storeLoaded]);

  const {
    deleteArticle,
    deleteArticleAnnotation,
    deleteArticleComment,
    closeArticleDiscussions,
    openArticleDiscussion,
    readArticle,
    saveArticle,
    updateArticle,
    saveArticleReadingProgress,
    saveArticleReaderChatState,
    importArticleUrl,
    cancelArticleUrlImport,
    importEbookFile,
    importPdfFile,
  } = useAppArticleStoreActions({ storeRef, applyStore });
  const {
    userDraft,
    settingsDraft,
    providerDraft,
    testState,
    profileSaveState,
    generalSaveState,
    shortcutSaveState,
    providerSaveState,
    routeSaveState,
    profileSaveError,
    generalSaveError,
    shortcutSaveError,
    providerSaveError,
    routeSaveError,
    canSaveUser,
    canSaveGeneralSettings,
    canSaveShortcutSettings,
    canSaveProvider,
    canSaveProviderRoutes,
    updateUserDraft,
    updateGeneralSettingsDraft,
    updateShortcutSettingsDraft,
    updateProviderDraft,
    updateProviderRoutesDraft,
    saveProfileDraft,
    saveGeneralSettingsDraft,
    saveShortcutSettingsDraft,
    selectProvider,
    createProvider,
    deleteProvider,
    saveProviderDraft,
    saveProviderRoutes,
    testProvider,
  } = useSettingsDrafts({ store, storeSyncSnapshot, applyStore });
  const { agentSaveError, agentSaveState, toggleAgent } = useAppAgentActions({ applyStore });
  const showOnboarding = onboardingForced || !store.settings.onboardingCompletedAt;
  const appLockEnabled = Boolean(store.settings.appLockEnabled);
  const appLocked = Boolean(appLockEnabled && store.settings.appLockLocked);

  useEffect(() => {
    if (!appLocked) {
      setAppLockStep('slide');
      setAppLockPin('');
      setAppLockError('');
    }
  }, [appLocked]);

  useEffect(() => {
    if (!appLockEnabled || appLocked) return;
    function handleAppLockShortcut(event: KeyboardEvent) {
      if (!isAppLockShortcutEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      void lockApp();
    }
    window.addEventListener('keydown', handleAppLockShortcut, true);
    return () => window.removeEventListener('keydown', handleAppLockShortcut, true);
  }, [appLockEnabled, appLocked]);

  useEffect(() => {
    if (!storeLoaded && !storeLoadError) return;
    recordStartupTiming('store.ready_for_ui', {
      storeLoaded,
      storeLoadError: Boolean(storeLoadError),
    });
  }, [storeLoadError, storeLoaded]);

  useEffect(() => {
    if (!storeLoaded || storeLoadError || showOnboarding) return;
    if (idlePreloadStartedRef.current) return;
    idlePreloadStartedRef.current = true;
    const idleId = scheduleIdlePreload(() => {
      recordStartupTiming('secondary_modules.preload_start');
      preloadIdleModules(store.articles);
    });
    return () => cancelIdlePreload(idleId);
  }, [showOnboarding, store.articles, storeLoadError, storeLoaded]);

  useEffect(() => {
    if (activeSetting !== 'library') setLibraryReaderOpen(false);
  }, [activeSetting]);

  useEffect(() => {
    if (!store.settings.developerModeEnabled && activeSettingsSection === 'aiTrace') {
      setActiveSettingsSection('about');
    }
  }, [activeSettingsSection, store.settings.developerModeEnabled]);

  async function saveOnboardingSettings(settings: AppSettings) {
    const nextStore = await window.yomitomoDesktop.saveSettings(settings);
    const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
    writeCachedUiLanguage(nextLanguage);
    changeAppI18nLanguage(nextLanguage);
    applyStore(nextStore);
    if (settings.onboardingCompletedAt) setOnboardingForced(false);
    return nextStore;
  }

  async function selectTheme(themeId: AppThemeId, preferredReaderBackgroundColor?: string) {
    const themeTone = themeRegistry[themeId].meta.tone;
    setActiveThemeId(themeId);
    setThemeIdsByTone((currentThemeIds) => ({
      ...currentThemeIds,
      [themeTone]: themeId,
    }));
    writeCachedThemeId(themeId);
    const nextBackgroundColor = compatibleReaderBackgroundForTheme(
      themeId,
      preferredReaderBackgroundColor || readerBackgroundColor,
      activeThemeId,
    );
    if (nextBackgroundColor !== readerBackgroundColor) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...readDesktopReaderSettings(),
        backgroundColor: nextBackgroundColor,
      });
      setReaderBackgroundColor(nextSettings.backgroundColor);
      setReaderBackgroundsByTone((currentBackgrounds) => ({
        ...currentBackgrounds,
        [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
      }));
      writeDesktopReaderSettings(nextSettings);
    }
    try {
      const nextStore = await window.yomitomoDesktop.saveSettings({ themeId });
      applyStore(nextStore);
    } catch {
      // Keep the immediate visual choice; a later settings sync can reconcile persistence.
    }
  }

  function selectReaderBackground(backgroundColor: string) {
    const nextSettings = normalizeDesktopReaderSettings({
      ...readDesktopReaderSettings(),
      backgroundColor,
    });
    setReaderBackgroundColor(nextSettings.backgroundColor);
    setReaderBackgroundsByTone((currentBackgrounds) => ({
      ...currentBackgrounds,
      [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
    }));
    writeDesktopReaderSettings(nextSettings);
  }

  async function saveLibrarySettings(settings: AppSettings) {
    const nextStore = await window.yomitomoDesktop.saveSettings(settings);
    const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
    writeCachedUiLanguage(nextLanguage);
    changeAppI18nLanguage(nextLanguage);
    applyStore(nextStore);
  }

  function startOnboarding() {
    setOnboardingForced(true);
    setOnboardingFlowKey((key) => key + 1);
  }

  function openModelRoutesSettings() {
    openSettings();
    changeSettingsSection('models');
  }

  function openAgents() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'agents',
      status: preloadEntries.agents.status,
    });
    setActiveSetting('agents');
  }

  function openSettings() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'settings',
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    setActiveSetting('settings');
  }

  function openProfileDialog(sourceElement?: Element) {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'profile-dialog',
      status: preloadEntries.profileDialog.status,
    });
    setProfileDialogSourceRect(sourceElement ? elementDialogSourceRect(sourceElement) : undefined);
    setProfileDialogOpen(true);
  }

  function openStats() {
    const startedAt = performance.now();
    setStatsNavigationStartedAt(startedAt);
    recordStatsTiming('navigation_click', {
      articleCount: store.articles.length,
      rendererElapsedMs: elapsedMs(0),
      preloadStatus: preloadEntries.stats.status,
    });
    setActiveSetting('stats');
  }

  function changeSettingsSection(section: SettingsSectionKey) {
    if (!store.settings.developerModeEnabled && section === 'aiTrace') {
      setActiveSettingsSection('about');
      return;
    }
    recordStartupTiming('secondary_modules.settings_section_change', {
      section,
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    setActiveSettingsSection(section);
  }

  async function lockApp() {
    if (!appLockEnabled) return;
    setAppLockStep('slide');
    setAppLockPin('');
    setAppLockPinInputKey((key) => key + 1);
    setAppLockError('');
    try {
      const nextStore = await window.yomitomoDesktop.setAppLockLocked({ locked: true });
      applyStore(nextStore);
      playAppSoundEffect('app_lock.locked', nextStore.settings);
    } catch {
      setAppLockError(t('appLock.verifyFailed'));
    }
  }

  function completeAppLockSlide() {
    setAppLockStep('pin');
    setAppLockPin('');
    setAppLockPinInputKey((key) => key + 1);
    setAppLockError('');
  }

  async function unlockApp(pinOverride?: string) {
    const pinToVerify = pinOverride ?? appLockPin;
    if (!validAppLockPin(pinToVerify) || appLockVerifying) return;
    setAppLockVerifying(true);
    setAppLockError('');
    try {
      const result = await window.yomitomoDesktop.verifyAppLockPin({ pin: pinToVerify });
      if (result.ok) {
        const nextStore = await window.yomitomoDesktop.setAppLockLocked({ locked: false });
        applyStore(nextStore);
        playAppSoundEffect('app_lock.unlocked', nextStore.settings);
        setAppLockStep('slide');
        setAppLockPin('');
        return;
      }
      setAppLockError(t('appLock.invalidPin'));
      setAppLockPin('');
      setAppLockPinInputKey((key) => key + 1);
    } catch {
      setAppLockError(t('appLock.verifyFailed'));
      setAppLockPin('');
      setAppLockPinInputKey((key) => key + 1);
    } finally {
      setAppLockVerifying(false);
    }
  }

  function requestMainWindow(reason: string, data: Record<string, unknown>) {
    if (windowShowRequestedRef.current) return;
    windowShowRequestedRef.current = true;
    recordStartupTiming('window.show_requested', { reason, ...data });
    window.yomitomoDesktop.showMainWindow();
  }

  if (storeLoadError) {
    return <StoreLoadErrorScreen error={storeLoadError} onRetry={refreshStore} />;
  }

  if (!storeLoaded) return <StartupShell />;

  if (showOnboarding) {
    return (
      <Suspense fallback={null}>
        <OnboardingFlow
          key={onboardingFlowKey}
          store={store}
          onSaveSettings={saveOnboardingSettings}
        />
      </Suspense>
    );
  }

  const today = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  const appShellClassName = [
    'app-shell',
    `is-${desktopPlatform()}`,
    libraryReaderOpen ? 'is-reader-open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const settingsPanelsModule = preloadEntries.settingsPanels.module;
  const settingsProviderModule = preloadEntries.settingsProvider.module;
  const settingsAboutModule = preloadEntries.settingsAbout.module;
  const agentsModule = preloadEntries.agents.module;
  const statsModule = preloadEntries.stats.module;
  const profileDialogModule = preloadEntries.profileDialog.module;
  const ActiveReadingStatsPanel = statsModule?.ReadingStatsPanel ?? ReadingStatsPanel;
  const ActiveAgentSettings = agentsModule?.AgentSettings ?? AgentSettings;
  const ActiveSettingsSectionShell =
    settingsPanelsModule?.SettingsSectionShell ?? SettingsSectionShell;
  const ActiveGeneralSettings = settingsPanelsModule?.GeneralSettings ?? GeneralSettings;
  const ActiveShortcutSettings = settingsPanelsModule?.ShortcutSettings ?? ShortcutSettings;
  const ActiveDataSourcesPanel = settingsPanelsModule?.DataSourcesPanel ?? DataSourcesPanel;
  const ActiveDataManagementSettings =
    settingsPanelsModule?.DataManagementSettings ?? DataManagementSettings;
  const ActiveAiTraceSettingsPanel =
    settingsPanelsModule?.AiTraceSettingsPanel ?? AiTraceSettingsPanel;
  const ActiveProviderSettings = settingsProviderModule?.ProviderSettings ?? ProviderSettings;
  const ActiveAboutSettings = settingsAboutModule?.AboutSettings ?? AboutSettings;
  const ActiveUserProfileSettingsDialog =
    profileDialogModule?.UserProfileSettingsDialog ?? UserProfileSettingsDialog;

  return (
    <main className={appShellClassName}>
      <header className="app-masthead">
        <BrandTitle settings={store.settings} />
        <time className="app-masthead-date" dateTime={new Date().toISOString()}>
          {today}
        </time>
      </header>

      <nav className="app-section-nav" aria-label={t('nav.main')}>
        <SettingsNavButton
          active={activeSetting === 'library'}
          label={t('nav.library')}
          onClick={() => setActiveSetting('library')}
        />
        <SettingsNavButton
          active={activeSetting === 'agents'}
          label={t('nav.agents')}
          onClick={openAgents}
        />
        <SettingsNavButton
          active={activeSetting === 'stats'}
          label={t('nav.stats')}
          onClick={openStats}
        />
        <SettingsNavButton
          active={activeSetting === 'settings'}
          label={t('nav.settings')}
          onClick={openSettings}
        />
        {appLockEnabled ? (
          <button
            aria-label={t('appLock.lockNow', { shortcut: appLockShortcutKeys.join('+') })}
            className="app-nav-lock-button"
            data-tooltip={t('appLock.lockNow', { shortcut: appLockShortcutKeys.join('+') })}
            type="button"
            onClick={lockApp}
          >
            <LockKeyhole aria-hidden="true" size={18} />
          </button>
        ) : null}
        <ThemeSelector
          activeThemeId={activeThemeId}
          open={themeDialogOpen}
          readerBackgroundColor={readerBackgroundColor}
          soundSettings={store.settings}
          readerBackgroundsByTone={readerBackgroundsByTone}
          themeIdsByTone={themeIdsByTone}
          onOpenChange={setThemeDialogOpen}
          onSelectReaderBackground={selectReaderBackground}
          onSelectTheme={(themeId, backgroundColor) => void selectTheme(themeId, backgroundColor)}
        />
        <button
          aria-label={t('nav.profile')}
          className="app-nav-profile-button"
          data-tooltip={t('nav.profile')}
          type="button"
          onClick={(event) => openProfileDialog(event.currentTarget)}
        >
          <AvatarImage
            value={store.user.avatar || ''}
            className="app-nav-profile-avatar"
            fallback={store.user.nickname?.slice(0, 1) || t('common.me')}
          />
        </button>
      </nav>

      <section className="settings-content">
        <Suspense fallback={<LibrarySkeleton />}>
          {activeSetting === 'library' ? (
            <ReadingLibrary
              agents={store.agents}
              articles={store.articles}
              messageSendShortcut={store.settings.messageSendShortcut}
              readerTheme={themeRegistry[activeThemeId].reader}
              settings={store.settings}
              selectionActionShortcuts={store.settings.selectionActionShortcuts}
              openArticleId={pendingOpenArticleId}
              userProfile={store.user}
              onDeleteArticle={deleteArticle}
              onDeleteArticleAnnotation={deleteArticleAnnotation}
              onDeleteArticleComment={deleteArticleComment}
              onCloseArticleDiscussions={closeArticleDiscussions}
              onOpenArticleDiscussion={openArticleDiscussion}
              onArticleOpened={() => setPendingOpenArticleId(null)}
              onImportArticleUrl={importArticleUrl}
              onCancelArticleImport={cancelArticleUrlImport}
              onImportEbookFile={importEbookFile}
              onImportPdfFile={importPdfFile}
              onReadingModeChange={setLibraryReaderOpen}
              onReadArticle={readArticle}
              onSaveArticle={saveArticle}
              onSaveArticleReadingProgress={saveArticleReadingProgress}
              onSaveArticleReaderChatState={saveArticleReaderChatState}
              onSaveSettings={saveLibrarySettings}
              onUpdateArticle={updateArticle}
            />
          ) : null}
          {activeSetting === 'stats' ? (
            <ActiveReadingStatsPanel
              agents={store.agents}
              articles={store.articles}
              navigationStartedAt={statsNavigationStartedAt}
              settings={store.settings}
              onRefresh={refreshStore}
            />
          ) : null}
          {activeSetting === 'settings' ? (
            <ActiveSettingsSectionShell
              activeSection={activeSettingsSection}
              developerModeEnabled={Boolean(store.settings.developerModeEnabled)}
              onSectionChange={changeSettingsSection}
            >
              {activeSettingsSection === 'collection' ? (
                <ActiveGeneralSettings
                  settingsDraft={settingsDraft}
                  canSave={canSaveGeneralSettings}
                  onSettingsChange={updateGeneralSettingsDraft}
                  onSave={saveGeneralSettingsDraft}
                  saveState={generalSaveState}
                  saveError={generalSaveError}
                />
              ) : null}
              {activeSettingsSection === 'models' ? (
                <ActiveProviderSettings
                  draft={providerDraft}
                  settingsDraft={settingsDraft}
                  providers={store.providers}
                  testState={testState}
                  canSave={canSaveProvider}
                  canSaveRoutes={canSaveProviderRoutes}
                  onChange={updateProviderDraft}
                  onRouteChange={updateProviderRoutesDraft}
                  onCreate={createProvider}
                  onDelete={deleteProvider}
                  onSave={saveProviderDraft}
                  saveState={providerSaveState}
                  saveError={providerSaveError}
                  routeSaveState={routeSaveState}
                  routeSaveError={routeSaveError}
                  onRouteSave={saveProviderRoutes}
                  onSelect={selectProvider}
                  onTest={testProvider}
                />
              ) : null}
              {activeSettingsSection === 'dataSources' ? <ActiveDataSourcesPanel /> : null}
              {activeSettingsSection === 'shortcuts' ? (
                <ActiveShortcutSettings
                  settingsDraft={settingsDraft}
                  canSave={canSaveShortcutSettings}
                  onSettingsChange={updateShortcutSettingsDraft}
                  onSave={saveShortcutSettingsDraft}
                  saveState={shortcutSaveState}
                  saveError={shortcutSaveError}
                />
              ) : null}
              {activeSettingsSection === 'data' ? (
                <ActiveDataManagementSettings
                  settings={store.settings}
                  onStoreUpdated={applyStore}
                />
              ) : null}
              {activeSettingsSection === 'aiTrace' && store.settings.developerModeEnabled ? (
                <ActiveAiTraceSettingsPanel agents={store.agents} providers={store.providers} />
              ) : null}
              {activeSettingsSection === 'about' ? (
                <ActiveAboutSettings
                  settings={store.settings}
                  onStartOnboarding={startOnboarding}
                  onStoreUpdated={applyStore}
                />
              ) : null}
            </ActiveSettingsSectionShell>
          ) : null}
          {activeSetting === 'agents' ? (
            <ActiveAgentSettings
              agents={store.agents}
              error={agentSaveError}
              providers={store.providers}
              settings={store.settings}
              saveState={agentSaveState}
              onConfigureRoutes={openModelRoutesSettings}
              onToggle={toggleAgent}
            />
          ) : null}
        </Suspense>
      </section>
      {profileDialogOpen ? (
        <Suspense fallback={null}>
          <ActiveUserProfileSettingsDialog
            draft={userDraft}
            canSave={canSaveUser}
            onChange={updateUserDraft}
            onClose={() => setProfileDialogOpen(false)}
            onSave={async () => {
              if (await saveProfileDraft())
                window.setTimeout(() => setProfileDialogOpen(false), 700);
            }}
            saveState={profileSaveState}
            saveError={profileSaveError}
            sourceRect={profileDialogSourceRect}
          />
        </Suspense>
      ) : null}
      {!appLocked ? (
        <UpdateReleaseDialog
          store={store}
          onSaveSettings={async (settings) => {
            const nextStore = await window.yomitomoDesktop.saveSettings(settings);
            const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
            writeCachedUiLanguage(nextLanguage);
            changeAppI18nLanguage(nextLanguage);
            applyStore(nextStore);
            return nextStore;
          }}
        />
      ) : null}
      {appLocked ? (
        <AppLockOverlay
          error={appLockError}
          inputKey={appLockPinInputKey}
          pin={appLockPin}
          step={appLockStep}
          verifying={appLockVerifying}
          onPinChange={(value) => {
            setAppLockPin(digitsOnly(value));
            setAppLockError('');
          }}
          onSlideComplete={completeAppLockSlide}
          onUnlock={() => void unlockApp()}
        />
      ) : null}
      <AppToaster tone={themeRegistry[activeThemeId].meta.tone} topOffset={toastTopOffset} />
    </main>
  );
}

function AppLockOverlay({
  error,
  inputKey,
  pin,
  step,
  verifying,
  onPinChange,
  onSlideComplete,
  onUnlock,
}: {
  error: string;
  inputKey: number;
  pin: string;
  step: 'slide' | 'pin';
  verifying: boolean;
  onPinChange: (value: string) => void;
  onSlideComplete: () => void;
  onUnlock: (pin?: string) => void;
}) {
  const { t } = useTranslation();
  const pinReady = validAppLockPin(pin);
  return (
    <div
      aria-labelledby="app-lock-title"
      aria-modal="true"
      className="app-lock-overlay"
      role="dialog"
    >
      <div className="app-lock-panel" data-step={step}>
        <span className="app-lock-icon" aria-hidden="true">
          <LockKeyhole size={24} />
        </span>
        <h2 id="app-lock-title">{t('appLock.title')}</h2>
        {step === 'pin' ? <p>{t('appLock.pinDescription')}</p> : null}
        {step === 'slide' ? (
          <SlideToUnlock className="app-lock-slide" onUnlock={onSlideComplete}>
            <SlideToUnlockTrack>
              <SlideToUnlockText>
                {({ isDragging }) => (
                  <ShimmeringText text={t('appLock.slideLabel')} isStopped={isDragging} />
                )}
              </SlideToUnlockText>
              <SlideToUnlockHandle aria-label={t('appLock.slideLabel')} />
            </SlideToUnlockTrack>
          </SlideToUnlock>
        ) : (
          <form
            className="app-lock-pin-form"
            onSubmit={(event) => {
              event.preventDefault();
              onUnlock();
            }}
          >
            <PinOtpInput
              key={inputKey}
              ariaLabel={t('appLock.pinLabel')}
              autoFocus
              disabled={verifying}
              value={pin}
              onChange={onPinChange}
              onComplete={onUnlock}
            />
            {error ? (
              <span className="app-lock-error" role="alert">
                {error}
              </span>
            ) : null}
            <button
              className="app-lock-unlock-button"
              disabled={!pinReady || verifying}
              type="submit"
            >
              {verifying ? t('appLock.verifying') : t('appLock.unlock')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PinOtpInput({
  ariaLabel,
  autoFocus = false,
  disabled = false,
  value,
  onChange,
  onComplete,
}: {
  ariaLabel: string;
  autoFocus?: boolean;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}) {
  return (
    <InputOTP
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      disabled={disabled}
      maxLength={4}
      value={value}
      onChange={(nextValue) => onChange(digitsOnly(nextValue))}
      onComplete={(nextValue) => {
        const pin = digitsOnly(String(nextValue));
        onChange(pin);
        window.setTimeout(() => onComplete?.(pin), 0);
      }}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
      </InputOTPGroup>
    </InputOTP>
  );
}

function StartupShell() {
  return (
    <main className={`app-shell is-${desktopPlatform()}`}>
      <AppMasthead />
      <StartupNav />
      <section className="settings-content">
        <LibrarySkeleton />
      </section>
    </main>
  );
}

function AppMasthead() {
  return (
    <header className="app-masthead">
      <BrandTitle />
    </header>
  );
}

function BrandTitle({ settings }: { settings?: AppSettings }) {
  const { t } = useTranslation();
  const playPronunciation = () => {
    playAppSoundEffect('brand.pronunciation', settings || {});
  };
  return (
    <div className="app-masthead-title">
      <h1>Yomitomo</h1>
      <button
        aria-label={t('brandPronounce')}
        className="app-masthead-phonetic"
        type="button"
        onClick={playPronunciation}
      >
        /joːmitomo/
        <Volume2 aria-hidden="true" size={13} />
      </button>
    </div>
  );
}

function StartupNav() {
  const { t } = useTranslation();
  return (
    <nav className="app-section-nav" aria-label={t('nav.main')}>
      <button className="settings-nav-item is-active" disabled type="button">
        <span>{t('startup.library')}</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>{t('startup.agents')}</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>{t('startup.stats')}</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>{t('startup.settings')}</span>
      </button>
    </nav>
  );
}

function LibrarySkeleton() {
  return (
    <div className="library-skeleton" aria-busy="true">
      <header className="library-skeleton-header">
        <span className="library-skeleton-title" />
        <span className="library-skeleton-action" />
      </header>
      <div className="library-skeleton-toolbar">
        <span />
        <span />
      </div>
      <div className="library-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="library-skeleton-card" key={index}>
            <i />
            <b />
            <em />
          </span>
        ))}
      </div>
    </div>
  );
}

recordStartupTiming('renderer.module_loaded', {
  preloadLoadedAt: window.yomitomoDesktop?.startupTiming?.preloadLoadedAt,
  rendererModuleLoadedAt,
});

const rendererWindowKind = new URLSearchParams(window.location.search).get('window');
const RootApp =
  rendererWindowKind === 'annotation-discussion'
    ? AnnotationDiscussionWindowApp
    : rendererWindowKind === 'annotation-sedimentation'
      ? AnnotationSedimentationWindowApp
      : App;

createRoot(document.getElementById('root')!).render(<RootApp />);
recordStartupTiming('react.render_scheduled');

function desktopPlatform() {
  return window.yomitomoDesktop?.platform ?? 'unknown';
}

function isAppLockShortcutEvent(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  if (key !== 'l' || event.altKey || event.shiftKey || event.repeat) return false;
  return desktopPlatform() === 'darwin'
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function validAppLockPin(value: string) {
  return /^\d{4}$/.test(value);
}

function recordStartupTiming(event: string, data: Record<string, unknown> = {}) {
  const desktop = window.yomitomoDesktop;
  if (!desktop?.recordPerformanceTiming) return;
  void desktop
    .recordPerformanceTiming({
      event: `startup.${event}`,
      data: {
        rendererElapsedMs: elapsedMs(0),
        ...data,
      },
    })
    .catch(() => undefined);
}

function recordStatsTiming(event: string, data: Record<string, unknown>) {
  const desktop = window.yomitomoDesktop;
  if (!desktop?.recordPerformanceTiming) return;
  void desktop.recordPerformanceTiming({ event: `stats.${event}`, data }).catch(() => undefined);
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
