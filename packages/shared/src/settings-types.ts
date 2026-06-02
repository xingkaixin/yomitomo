export type MessageSendShortcut = 'enter' | 'mod-enter';

export type AssistantExecutionMode = 'fast_response' | 'deep_verification';

export type SelectionActionShortcuts = {
  copy: string;
  annotate: string;
};

export type LibraryContentSourceId = 'web' | 'ebook' | 'pdf' | 'weread';

export type LibraryContentSourcePreference = {
  id: LibraryContentSourceId;
  enabled: boolean;
};

export const defaultLibraryContentSourceOrder: LibraryContentSourceId[] = [
  'web',
  'ebook',
  'pdf',
  'weread',
];

export type AppSettings = {
  themeId?: string;
  libraryPageSize?: number;
  libraryContentSources?: LibraryContentSourcePreference[];
  defaultProviderId?: string;
  readingAssistantProviderId?: string;
  reviewAssistantProviderId?: string;
  assistantExecutionMode?: AssistantExecutionMode;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  saveArticleImages?: boolean;
  developerModeEnabled?: boolean;
  logRetentionDays?: number;
  onboardingCompletedAt?: string;
};

export function normalizeAssistantExecutionMode(value: unknown): AssistantExecutionMode {
  return value === 'deep_verification' ? 'deep_verification' : 'fast_response';
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
  return value === 'web' || value === 'ebook' || value === 'pdf' || value === 'weread';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}
