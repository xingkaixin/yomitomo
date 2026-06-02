import type {
  AppSettings,
  LibraryContentSourceId,
  LibraryContentSourcePreference,
} from '@yomitomo/shared';
import { defaultLibraryContentSourceOrder, normalizeLibraryContentSources } from '@yomitomo/shared';
import type { LibrarySource } from './app-reading-library-utils';

export type LibraryContentSourceOption = {
  value: LibrarySource;
  label: string;
  description: string;
};

export const LIBRARY_CONTENT_SOURCE_OPTIONS: LibraryContentSourceOption[] = [
  { value: 'web', label: '网页文章', description: '网页采集和粘贴链接导入的文章。' },
  { value: 'ebook', label: '电子书', description: '本地导入的 EPUB 电子书。' },
  { value: 'pdf', label: 'PDF', description: '本地导入的 PDF 文档。' },
  { value: 'weread', label: '微信读书', description: '微信读书同步的划线、想法和进度。' },
];

const optionById = new Map<LibraryContentSourceId, LibraryContentSourceOption>(
  LIBRARY_CONTENT_SOURCE_OPTIONS.map((option) => [option.value, option]),
);

export function libraryContentSourcePreferences(
  settings: Pick<AppSettings, 'libraryContentSources'> | undefined,
): LibraryContentSourcePreference[] {
  return normalizeLibraryContentSources(settings?.libraryContentSources);
}

export function enabledLibraryContentSources(
  settings: Pick<AppSettings, 'libraryContentSources'> | undefined,
): LibrarySource[] {
  return libraryContentSourcePreferences(settings)
    .filter((preference) => preference.enabled)
    .map((preference) => preference.id);
}

export function libraryContentSourceOptions(
  settings: Pick<AppSettings, 'libraryContentSources'> | undefined,
): LibraryContentSourceOption[] {
  return enabledLibraryContentSources(settings)
    .map((id) => optionById.get(id))
    .filter((option): option is LibraryContentSourceOption => Boolean(option));
}

export function allLibraryContentSourceOptions(
  preferences: LibraryContentSourcePreference[],
): Array<LibraryContentSourceOption & { enabled: boolean }> {
  const normalized = normalizeLibraryContentSources(preferences);
  const orderedIds = [
    ...normalized.map((preference) => preference.id),
    ...defaultLibraryContentSourceOrder,
  ].filter((id, index, ids) => ids.indexOf(id) === index);

  return orderedIds
    .map((id) => {
      const option = optionById.get(id);
      if (!option) return null;
      return Object.assign({}, option, {
        enabled: normalized.find((preference) => preference.id === id)?.enabled ?? true,
      });
    })
    .filter((option): option is LibraryContentSourceOption & { enabled: boolean } =>
      Boolean(option),
    );
}

export function setLibraryContentSourceEnabled(
  preferences: LibraryContentSourcePreference[],
  id: LibraryContentSourceId,
  enabled: boolean,
): LibraryContentSourcePreference[] {
  const normalized = normalizeLibraryContentSources(preferences);
  const current = normalized.find((preference) => preference.id === id);
  if (!current || current.enabled === enabled) return normalized;

  if (!enabled) {
    if (normalized.filter((preference) => preference.enabled).length <= 1) return normalized;
    return normalized.map((preference) =>
      preference.id === id ? Object.assign({}, preference, { enabled: false }) : preference,
    );
  }

  return normalized.map((preference) =>
    preference.id === id ? Object.assign({}, preference, { enabled: true }) : preference,
  );
}

export function reorderLibraryContentSource(
  preferences: LibraryContentSourcePreference[],
  movedId: LibraryContentSourceId,
  targetId: LibraryContentSourceId,
  placement: 'after' | 'before' = 'before',
): LibraryContentSourcePreference[] {
  const normalized = normalizeLibraryContentSources(preferences);
  if (movedId === targetId) return normalized;
  const movedIndex = normalized.findIndex((preference) => preference.id === movedId);
  const targetIndex = normalized.findIndex((preference) => preference.id === targetId);
  if (movedIndex < 0 || targetIndex < 0) return normalized;

  const next = [...normalized];
  const [moved] = next.splice(movedIndex, 1);
  const targetIndexAfterRemoval = movedIndex < targetIndex ? targetIndex - 1 : targetIndex;
  next.splice(
    placement === 'after' ? targetIndexAfterRemoval + 1 : targetIndexAfterRemoval,
    0,
    moved,
  );
  return next;
}
