import { ARTICLE_SOURCE_TYPES } from './sources/article-types';
import { isRecord } from './runtime-guards';
import type { UiLanguage } from './locale-types';

export type { UiLanguage } from './locale-types';

export type MessageSendShortcut = 'enter' | 'mod-enter';

export const assistantExecutionModes = ['fast_response', 'deep_verification'] as const;

export type AssistantExecutionMode = (typeof assistantExecutionModes)[number];

export type BilingualTranslationTargetLanguage = UiLanguage;

export type BilingualTranslationStyle =
  | 'blur'
  | 'blockquote'
  | 'weakened'
  | 'dashedLine'
  | 'border';

export type SelectionActionShortcuts = {
  copy: string;
  annotate: string;
  ask: string;
};

export const defaultLibraryContentSourceOrder = [...ARTICLE_SOURCE_TYPES, 'weread'] as const;

export type LibraryContentSourceId = (typeof defaultLibraryContentSourceOrder)[number];

export type LibraryContentSourcePreference = {
  id: LibraryContentSourceId;
  enabled: boolean;
};

export type ResolvedAppSettings = {
  uiLanguage: UiLanguage;
  themeId: string | undefined;
  soundEffectsEnabled: boolean;
  soundEffectsVolume: number;
  appLockEnabled: boolean;
  appLockLocked: boolean;
  appLockLockOnStartup: boolean;
  appLockShortcut: string | undefined;
  libraryPageSize: number | undefined;
  libraryContentSources: LibraryContentSourcePreference[];
  defaultProviderId: string | undefined;
  readingAssistantProviderId: string | undefined;
  reviewAssistantProviderId: string | undefined;
  bilingualTranslationProviderId: string | undefined;
  bilingualTranslationTargetLanguage: BilingualTranslationTargetLanguage;
  bilingualTranslationStyle: BilingualTranslationStyle;
  bilingualTranslationAiContextAware: boolean;
  assistantExecutionMode: AssistantExecutionMode;
  messageSendShortcut: MessageSendShortcut;
  selectionActionShortcuts: SelectionActionShortcuts;
  saveArticleImages: boolean;
  allowLocalNetworkArticleImport: boolean;
  readingMemoryRemoteConsent: boolean;
  telemetryEnabled: boolean;
  developerModeEnabled: boolean;
  logRetentionDays: number;
  onboardingCompletedAt: string | undefined;
  lastSeenVersion: string | undefined;
};

export type AppSettingsPatch = Omit<
  Partial<ResolvedAppSettings>,
  'bilingualTranslationTargetLanguage' | 'selectionActionShortcuts'
> & {
  bilingualTranslationTargetLanguage?: string;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
};

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === 'en' || value === 'ja' ? value : 'zh-CN';
}

export function normalizeAssistantExecutionMode(value: unknown): AssistantExecutionMode {
  return value === 'deep_verification' ? 'deep_verification' : 'fast_response';
}

export function normalizeSoundEffectsVolume(value: unknown): number {
  const volume = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(volume)) return 0.7;
  return Math.min(1, Math.max(0, volume));
}

export function normalizeLibraryContentSources(value: unknown): LibraryContentSourcePreference[] {
  const input = Array.isArray(value) ? value : [];
  const byId = new Map<LibraryContentSourceId, LibraryContentSourcePreference>();
  for (const item of input) {
    if (!isRecord(item) || !isLibraryContentSourceId(item.id) || byId.has(item.id)) continue;
    byId.set(item.id, {
      id: item.id,
      enabled: Boolean(item.enabled),
    });
  }

  const result = [
    ...input
      .map((item) => (isRecord(item) && isLibraryContentSourceId(item.id) ? item.id : undefined))
      .filter((id): id is LibraryContentSourceId => Boolean(id))
      .filter((id, index, ids) => ids.indexOf(id) === index),
    ...defaultLibraryContentSourceOrder.filter((id) => !byId.has(id)),
  ].map((id) => byId.get(id) || { id, enabled: true });

  if (result.some((item) => item.enabled)) return result;
  return result.map((item, index) =>
    index === 0 ? Object.assign({}, item, { enabled: true }) : item,
  );
}

function isLibraryContentSourceId(value: unknown): value is LibraryContentSourceId {
  return defaultLibraryContentSourceOrder.some((sourceId) => sourceId === value);
}
