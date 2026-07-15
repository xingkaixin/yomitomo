import * as store from './store';
import {
  hydrateProviderApiKey,
  hydrateProviderInputApiKey,
  readStoredProviderApiKey,
} from '../providers/provider-repository';
import {
  readStoredWeReadApiKey,
  readWeReadBookDetail,
  readWeReadReadingStatsState,
  readWeReadSettings,
  readWeReadState,
  saveWeReadBookDetail,
  saveWeReadLibrarySnapshot,
  saveWeReadReadingStatsSnapshot,
  saveWeReadSettings,
  saveWeReadTestResult,
} from '../weread/weread-repository';

export const storeSnapshotPersistence = {
  readStore: store.readStore,
  readShellStoreWithProfile: store.readShellStoreWithProfile,
  readStoreWithProfile: store.readStoreWithProfile,
  warmStoreDatabaseWithProfile: store.warmStoreDatabaseWithProfile,
};

export const settingsPersistence = {
  readStore: store.readStore,
  saveSettings: store.saveSettings,
  saveSettingsShell: store.saveSettingsShell,
  saveUser: store.saveUser,
};

export const articlePersistence = {
  deleteArticle: store.deleteArticle,
  deleteArticleAnnotation: store.deleteArticleAnnotation,
  deleteArticleComment: store.deleteArticleComment,
  deleteCurrentArticleTranslation: store.deleteCurrentArticleTranslation,
  ensureArticleSiteIcon: store.ensureArticleSiteIcon,
  findArticleByIdentity: store.findArticleByIdentity,
  listLibraryArticles: store.listLibraryArticles,
  readArticle: store.readArticle,
  readArticleCover: store.readArticleCover,
  readArticleStatsSummaries: store.readArticleStatsSummaries,
  readCurrentArticleTranslation: store.readCurrentArticleTranslation,
  readImportSettings: store.readImportSettings,
  saveArticle: store.saveArticle,
  saveArticleAnnotation: store.saveArticleAnnotation,
  saveArticleComment: store.saveArticleComment,
  saveArticleReaderChatState: store.saveArticleReaderChatState,
  saveArticleReadingProgress: store.saveArticleReadingProgress,
  saveArticleTranslation: store.saveArticleTranslation,
};

export const collectionPersistence = {
  addCollectionMembers: store.addCollectionMembers,
  createCollection: store.createCollection,
  deleteCollection: store.deleteCollection,
  listDistillationLibrary: store.listDistillationLibrary,
  listCollections: store.listCollections,
  listLibraryCatalog: store.listLibraryCatalog,
  listLibraryPins: store.listLibraryPins,
  removeCollectionMember: store.removeCollectionMember,
  renameCollection: store.renameCollection,
  setLibraryPin: store.setLibraryPin,
};

export const providerPersistence = {
  deleteProvider: store.deleteProvider,
  hydrateProviderApiKey,
  hydrateProviderInputApiKey,
  readStoredProviderApiKey,
  saveProvider: store.saveProvider,
};

export const agentRuntimePersistence = {
  deleteAgent: store.deleteAgent,
  readAgentRuntimeContext: store.readAgentRuntimeContext,
  saveAgent: store.saveAgent,
};

export const weReadPersistence = {
  readStoredWeReadApiKey,
  readWeReadBookDetail,
  readWeReadReadingStatsState,
  readWeReadSettings,
  readWeReadState,
  saveWeReadBookDetail,
  saveWeReadLibrarySnapshot,
  saveWeReadReadingStatsSnapshot,
  saveWeReadSettings,
  saveWeReadTestResult,
};

export const assistantExecutionPersistence = {
  queryAssistantExecutionRunDetail: store.queryAssistantExecutionRunDetail,
  queryAssistantExecutionRuns: store.queryAssistantExecutionRuns,
  queryAssistantExecutionSummary: store.queryAssistantExecutionSummary,
  recordAssistantExecutionRun: store.recordAssistantExecutionRun,
};

export const modelPricingPersistence = {
  refreshModelPrices: store.refreshModelPrices,
};
