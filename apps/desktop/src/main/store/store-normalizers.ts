import type { DesktopStore } from '@yomitomo/shared';
import { providerPresets } from '@yomitomo/shared';
import { defaultUser, normalizeUser } from './store-normalizers-user';
import {
  normalizeAgentKind,
  normalizeAnnotationDensity,
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
  normalizeTemperature,
} from './store-normalizers-provider-agent';
import { normalizeSettings } from './store-normalizers-settings';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeEbookRecord,
  normalizePdfRecord,
} from './store-normalizers-sources';

export {
  defaultUser,
  normalizeUser,
  rowToUser,
  userToRow,
  normalizeUsername,
} from './store-normalizers-user';
export {
  normalizeAgentKind,
  normalizeAgentUsername,
  normalizeAnnotationDensity,
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
  normalizeReasoningEffort,
  normalizeTemperature,
  rowToAgent,
  rowToProvider,
} from './store-normalizers-provider-agent';
export {
  rowToComment,
  rowToAnnotation,
  normalizeAssistantRuntimeProgress,
  normalizeTextAnchor,
} from './store-normalizers-annotations';
export {
  rowToArticle,
  rowToArticleSummary,
  type ArticleSummaryCounts,
  type ArticleSummaryRow,
} from './store-normalizers-articles';
export {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeEbookRecord,
  normalizePdfRecord,
  rowToEbook,
  rowToEbookSummary,
  rowToPdf,
  rowToPdfSummary,
} from './store-normalizers-sources';
export { normalizeReaderChatState } from './store-normalizers-reader-chat';
export { mergeSettingsForUpsert, rowToSettings } from './store-normalizers-settings';
export { sortByCreatedAt } from './store-normalizers-common';

export const defaultStore: DesktopStore = {
  user: defaultUser,
  settings: {},
  providers: [],
  agents: [],
  articles: [],
};

export function normalizeStore(store: DesktopStore): DesktopStore {
  return {
    user: normalizeUser(store.user),
    settings: normalizeSettings(store.settings),
    providers: (store.providers || []).map((provider) => {
      const presetId = normalizePresetId(provider.presetId);
      const preset = providerPresets.find((item) => item.id === presetId);
      return Object.assign({}, provider, {
        type: preset?.type || normalizeProviderType(provider.type) || 'openai-chat',
        presetId,
        modelNames:
          provider.modelInputMode === 'custom'
            ? undefined
            : normalizeModelNames(provider.modelNames),
        modelInputMode: normalizeProviderModelInputMode(provider.modelInputMode) || 'list',
        reasoningEffort: 'none',
      });
    }),
    agents: (store.agents || []).map((agent) =>
      Object.assign({}, agent, {
        annotationColor: agent.annotationColor || '#8ab6d6',
        kind: normalizeAgentKind(agent.kind) || 'annotation',
        enabled: agent.enabled ?? true,
        annotationDensity: normalizeAnnotationDensity(agent.annotationDensity) || 'medium',
        temperature: normalizeTemperature(agent.temperature),
      }),
    ),
    articles: (store.articles || []).map((article) =>
      Object.assign({}, article, {
        sourceType: normalizeArticleSourceType(article.sourceType),
        ebook: normalizeEbookRecord(article.ebook),
        pdf: normalizePdfRecord(article.pdf),
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
      }),
    ),
  };
}
