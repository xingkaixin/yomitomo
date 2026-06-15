import { performance } from 'node:perf_hooks';
import { eq } from 'drizzle-orm';
import type {
  Agent,
  Annotation,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleTranslation,
  ArticleUpsertPatch,
  Comment,
  DesktopStore,
  UserProfile,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { buildAgentRecord, ensurePresetAgents, upsertAgent } from '../agents/agent-repository';
import {
  insertAssistantExecutionRun,
  type AssistantExecutionRunInput,
} from '../assistant/assistant-execution-repository';
import { logError } from '../app/logger';
import {
  listAssistantExecutionRuns,
  summarizeAssistantExecutions,
} from '../assistant/assistant-execution-query-repository';
import type { AssistantExecutionQueryInput } from '../../ipc-contract';
import { refreshModelsDevPrices } from '../providers/model-pricing-repository';
import {
  backfillStoredArticleAnnotationMemoryEntries,
  buildArticleUpsertPatch,
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteArticleRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
  findArticleByIdentityRows,
  readArticleCoverRows,
  readArticleSiteIconRawRows,
  updateArticleSiteIconRows,
  readArticleRows,
  readArticleSummaryCounts,
  readArticleSummaryRows,
  readArticleSummaryRowsForStore,
  saveArticleReaderChatStateRows,
  saveArticleReadingProgressRows,
  saveArticleRows,
  touchArticleRows,
  upsertAnnotationRows,
  upsertCommentRows,
  writeArticleRows,
  type ArticleIdentity,
} from '../articles/article-repository';
import {
  deleteArticleTranslationRows,
  readCurrentArticleTranslationRows,
  upsertArticleTranslationRows,
} from '../articles/article-translation-repository';
import * as schema from '../db/schema';
import { providerApiKeyRef, saveProviderApiKey } from '../providers/provider-secrets';
import {
  buildProviderRecord,
  deleteProviderSecret,
  readProviderSecretStorageRow,
  resolveProviderApiKeyStorage,
  upsertProvider,
  type SaveProviderInput,
} from '../providers/provider-repository';
import {
  closeDatabase as closeStoreDatabase,
  configureStoreDatabaseSeeder,
  getDatabase,
  getSqliteExecutor,
  purgeSqliteFiles,
  type StoreDatabase,
  type StoreReadProfileEntry,
} from './store-db';
import {
  readImportSettings as readImportSettingsRows,
  saveUserProfile,
  upsertSettings,
  upsertUser,
} from './settings-repository';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';
import {
  defaultStore,
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeStore,
  normalizeUser,
  rowToAgent,
  rowToArticleSummary,
  rowToProvider,
  rowToSettings,
  rowToUser,
} from './store-normalizers';
export {
  readStoredWeReadApiKey,
  readWeReadBookDetail,
  readWeReadBooks,
  readWeReadReadingStatsState,
  readWeReadSettings,
  readWeReadState,
  saveWeReadBookDetail,
  saveWeReadBookDetails,
  saveWeReadBooks,
  saveWeReadReadingStatsSnapshot,
  saveWeReadSettings,
  saveWeReadTestResult,
} from '../weread/weread-repository';

export { mergeSettingsForUpsert } from './store-normalizers';
export {
  buildArticleChildRows,
  buildArticleReaderChatStatePatch,
  buildArticleReadingProgressPatch,
  buildArticleUpsertPatch,
  findArticleInListByIdentity,
} from '../articles/article-repository';
export {
  backupDatabaseFile,
  getDataDirectoryPath,
  getDatabasePath,
  replaceDatabaseFile,
} from './store-db';
export {
  buildProviderRecord,
  hydrateProviderApiKey,
  hydrateProviderInputApiKey,
  readStoredProviderApiKey,
  resolveProviderApiKeyStorage,
  type ProviderApiKeyStorage,
  type SaveProviderInput,
} from '../providers/provider-repository';
export { buildAgentRecord } from '../agents/agent-repository';
let providerSecretsMigrated = false;
let annotationMemoryBackfilled = false;
const annotationMemoryBackfillVersion = 'annotation-memory-v1';

configureStoreDatabaseSeeder(seedDefaultStore);

export function closeDatabase() {
  closeStoreDatabase();
  providerSecretsMigrated = false;
  annotationMemoryBackfilled = false;
}

async function migrateProviderApiKeys(database: StoreDatabase) {
  if (providerSecretsMigrated) return;

  const providerRows = database.select().from(schema.providers).all();
  let migrated = false;
  for (const provider of providerRows) {
    const apiKey = provider.apiKey.trim();
    if (!apiKey) continue;

    let apiKeyRef: string;
    try {
      apiKeyRef = await saveProviderApiKey(provider.id, apiKey);
    } catch {
      continue;
    }
    database
      .update(schema.providers)
      .set({ apiKey: '', apiKeyRef })
      .where(eq(schema.providers.id, provider.id))
      .run();
    migrated = true;
  }

  if (migrated) {
    try {
      purgeLegacyProviderApiKeysFromSqliteFiles();
    } catch {
      // SQLite cleanup failure should not block state reads.
    }
  }
  providerSecretsMigrated = true;
}

function purgeLegacyProviderApiKeysFromSqliteFiles() {
  purgeSqliteFiles();
}

function seedDefaultStore(database: StoreDatabase) {
  const hasUser = database
    .select({ id: schema.userProfiles.id })
    .from(schema.userProfiles)
    .limit(1)
    .get();
  if (hasUser) return;

  writeStoreRows(database, { ...defaultStore, articles: [] });
}

export async function readStore(): Promise<DesktopStore> {
  return readStoreInternal();
}

export type AgentRuntimeStoreContext = Pick<DesktopStore, 'agents' | 'providers' | 'settings'>;

export async function readAgentRuntimeContext(): Promise<AgentRuntimeStoreContext> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readAgentRuntimeContextRows(database);
}

export async function readStoreWithProfile(): Promise<{
  store: DesktopStore;
  profile: StoreReadProfileEntry[];
}> {
  const profile: StoreReadProfileEntry[] = [];
  return { store: await readStoreInternal(profile), profile };
}

export function warmStoreDatabaseWithProfile() {
  const profile: StoreReadProfileEntry[] = [];
  measureStoreRead(profile, 'get_database', getDatabase);
  return profile;
}

async function readStoreInternal(profile?: StoreReadProfileEntry[]): Promise<DesktopStore> {
  const database = measureStoreRead(profile, 'get_database', getDatabase);
  await measureStoreReadAsync(profile, 'migrate_provider_api_keys', () =>
    migrateProviderApiKeys(database),
  );
  backfillAnnotationMemoryOnce(database, profile);
  return measureStoreRead(profile, 'read_store_rows', () => readStoreRows(database, profile));
}

export async function readArticle(id: string): Promise<ArticleRecord | null> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const article = readArticleRows(database, id);
  if (article?.sourceType === 'pdf') backfillArticleAnnotationMemory(article);
  return article;
}

export async function readArticleSummary(id: string) {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readArticleSummaryRows(database, id);
}

export async function readCurrentArticleTranslation(input: {
  articleId: string;
  sourceContentHash: string;
  targetLanguage: string;
  promptVersion: number;
}) {
  return readCurrentArticleTranslationRows(getDatabase(), input);
}

export async function saveArticleTranslation(
  translation: Omit<ArticleTranslation, 'segments'> & {
    segments?: ArticleTranslation['segments'];
  },
) {
  return upsertArticleTranslationRows(getDatabase(), translation);
}

export async function deleteCurrentArticleTranslation(input: {
  articleId: string;
  sourceContentHash: string;
  targetLanguage: string;
  promptVersion: number;
}) {
  const translation = readCurrentArticleTranslationRows(getDatabase(), input);
  if (!translation) return null;
  deleteArticleTranslationRows(getDatabase(), translation.id);
  return translation;
}

export function readImportSettings(): Pick<AppSettings, 'saveArticleImages'> {
  return readImportSettingsRows(getDatabase());
}

export function findArticleByIdentity(identity: ArticleIdentity): ArticleIdentity | null {
  return findArticleByIdentityRows(getDatabase(), identity);
}

export async function readArticleCover(id: string): Promise<string> {
  return readArticleCoverRows(getDatabase(), id);
}

// 返回本地化的 data URI favicon；存量文章首次访问时按需回填（一次性、非热路径），之后永久命中。
export async function ensureArticleSiteIcon(id: string): Promise<string> {
  const database = getDatabase();
  const raw = readArticleSiteIconRawRows(database, id);
  if (raw.startsWith('data:image/')) return raw;
  if (!/^https?:\/\//i.test(raw)) return '';

  const { fetchFaviconDataUrl } = await import('../articles/article-favicon');
  const dataUrl = await fetchFaviconDataUrl(raw);
  if (!dataUrl) return '';
  updateArticleSiteIconRows(database, id, dataUrl);
  return dataUrl;
}

type WritableDesktopStore = Omit<DesktopStore, 'articles'> & { articles: ArticleRecord[] };

export async function writeStore(store: WritableDesktopStore): Promise<DesktopStore> {
  const normalized = normalizeWritableStore(store);
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  writeStoreRows(database, normalized);
  return readStore();
}

export async function saveUser(input: Partial<UserProfile>): Promise<DesktopStore> {
  saveUserProfile(getDatabase(), input);
  return readStore();
}

export async function saveSettings(input: AppSettings): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readStore();
}

export function recordAssistantExecutionRun(input: AssistantExecutionRunInput) {
  insertAssistantExecutionRun(getDatabase(), input);
}

export function refreshModelPrices() {
  return refreshModelsDevPrices(getDatabase());
}

export function queryAssistantExecutionRuns(input: AssistantExecutionQueryInput) {
  return listAssistantExecutionRuns(getDatabase(), input);
}

export function queryAssistantExecutionSummary(input: AssistantExecutionQueryInput) {
  return summarizeAssistantExecutions(getDatabase(), input);
}

export async function saveProvider(input: SaveProviderInput): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id
    ? store.providers.find((provider) => provider.id === input.id)
    : undefined;
  const id = existing?.id || makeId('provider');
  const existingRow = input.id ? readProviderSecretStorageRow(input.id) : undefined;
  const { apiKeyRef, storedApiKey } = await resolveProviderApiKeyStorage(id, input, existingRow);
  const provider = buildProviderRecord(input, {
    id,
    now,
    existing,
    apiKeyRef,
    storedApiKey,
  });

  upsertProvider(getDatabase(), provider, apiKeyRef, storedApiKey);
  return readStore();
}

function measureStoreRead<T>(
  profile: StoreReadProfileEntry[] | undefined,
  name: string,
  read: () => T,
  data?: Record<string, number>,
): T {
  const startedAt = performance.now();
  try {
    return read();
  } finally {
    profile?.push({ name, durationMs: elapsedMs(startedAt), data });
  }
}

async function measureStoreReadAsync<T>(
  profile: StoreReadProfileEntry[] | undefined,
  name: string,
  read: () => Promise<T>,
  data?: Record<string, number>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await read();
  } finally {
    profile?.push({ name, durationMs: elapsedMs(startedAt), data });
  }
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

export async function deleteProvider(id: string): Promise<DesktopStore> {
  await deleteProviderSecret(id);
  const database = getDatabase();
  database.transaction((tx) => {
    const settings = tx.select().from(schema.appSettings).limit(1).get();
    if (
      settings?.defaultProviderId === id ||
      settings?.readingAssistantProviderId === id ||
      settings?.reviewAssistantProviderId === id ||
      settings?.bilingualTranslationProviderId === id
    ) {
      upsertSettings(tx, {
        defaultProviderId:
          settings.defaultProviderId === id ? undefined : (settings.defaultProviderId ?? undefined),
        readingAssistantProviderId:
          settings.readingAssistantProviderId === id
            ? undefined
            : (settings.readingAssistantProviderId ?? undefined),
        reviewAssistantProviderId:
          settings.reviewAssistantProviderId === id
            ? undefined
            : (settings.reviewAssistantProviderId ?? undefined),
        bilingualTranslationProviderId:
          settings.bilingualTranslationProviderId === id
            ? undefined
            : (settings.bilingualTranslationProviderId ?? undefined),
        saveArticleImages: settings.saveArticleImages,
      });
    }
    tx.delete(schema.providers).where(eq(schema.providers.id, id)).run();
  });
  return readStore();
}

export async function saveAgent(input: Partial<Agent>): Promise<DesktopStore> {
  const store = await readStore();
  const agent = buildAgentRecord(input, store, new Date().toISOString());
  upsertAgent(getDatabase(), agent);
  return readStore();
}

export async function deleteAgent(id: string): Promise<DesktopStore> {
  getDatabase().delete(schema.agents).where(eq(schema.agents.id, id)).run();
  return readStore();
}

export async function saveArticle(input: ArticleRecord) {
  return saveArticleRows(input);
}

export async function saveArticleAnnotation(input: {
  articleId: string;
  annotation: Annotation;
  updatedAt?: string;
}) {
  return upsertAnnotationRows(getDatabase(), input, sqliteExecutor());
}

export async function saveArticleComment(input: {
  articleId: string;
  annotationId: string;
  comment: Comment;
  updatedAt?: string;
}) {
  return upsertCommentRows(getDatabase(), input, sqliteExecutor());
}

export async function saveArticleReadingProgress(
  articleId: string,
  progress: ArticleReadingProgress,
) {
  return saveArticleReadingProgressRows(getDatabase(), articleId, progress);
}

export async function saveArticleReaderChatState(
  articleId: string,
  readerChatState: ArticleRecord['readerChatState'],
) {
  return saveArticleReaderChatStateRows(getDatabase(), articleId, readerChatState);
}

export async function deleteArticle(id: string) {
  return deleteArticleRowsWithMemoryLifecycle(sqliteExecutor(), id);
}

export async function deleteArticleAnnotation(input: {
  articleId: string;
  annotationId: string;
  updatedAt?: string;
}): Promise<ArticleUpsertPatch | null> {
  const updatedAt = input.updatedAt || new Date().toISOString();
  deleteAnnotationRowsWithMemoryLifecycle(sqliteExecutor(), { ...input, deletedAt: updatedAt });
  touchArticleRows(getDatabase(), input.articleId, updatedAt);
  const article = readArticleSummaryRows(getDatabase(), input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export async function deleteArticleComment(input: {
  articleId: string;
  annotationId: string;
  commentId: string;
  updatedAt?: string;
}): Promise<ArticleUpsertPatch | null> {
  const updatedAt = input.updatedAt || new Date().toISOString();
  deleteCommentRowsWithMemoryLifecycle(sqliteExecutor(), { ...input, deletedAt: updatedAt });
  touchArticleRows(getDatabase(), input.articleId, updatedAt);
  const article = readArticleSummaryRows(getDatabase(), input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

function sqliteExecutor(): ReadingMemorySqliteExecutor {
  return getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor;
}

function normalizeWritableStore(store: WritableDesktopStore): WritableDesktopStore {
  const normalized = normalizeStore(store);
  return {
    ...normalized,
    articles: store.articles.map((article) => ({
      ...article,
      sourceType: normalizeArticleSourceType(article.sourceType),
      readingProgress: normalizeArticleReadingProgress(article.readingProgress),
    })),
  };
}

function backfillAnnotationMemoryOnce(database: StoreDatabase, profile?: StoreReadProfileEntry[]) {
  if (annotationMemoryBackfilled) return;
  if (isAnnotationMemoryBackfillComplete(database)) {
    annotationMemoryBackfilled = true;
    return;
  }

  try {
    measureStoreRead(profile, 'backfill_annotation_memory', () =>
      backfillStoredArticleAnnotationMemoryEntries(database, sqliteExecutor(), {
        includePdf: false,
      }),
    );
    markAnnotationMemoryBackfillComplete(database);
    annotationMemoryBackfilled = true;
  } catch (error) {
    annotationMemoryBackfilled = true;
    logError('reading-memory.backfill_annotation_memory_failed', error);
  }
}

function isAnnotationMemoryBackfillComplete(database: StoreDatabase) {
  const settings = database
    .select({ version: schema.appSettings.annotationMemoryBackfillVersion })
    .from(schema.appSettings)
    .limit(1)
    .get();
  return settings?.version === annotationMemoryBackfillVersion;
}

function markAnnotationMemoryBackfillComplete(database: StoreDatabase) {
  database
    .update(schema.appSettings)
    .set({
      annotationMemoryBackfillVersion,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.appSettings.id, 'default'))
    .run();
}

function backfillArticleAnnotationMemory(article: Pick<ArticleRecord, 'id' | 'annotations'>) {
  try {
    backfillStoredArticleAnnotationMemoryEntries(getDatabase(), sqliteExecutor(), {
      articleIds: [article.id],
      includePdf: true,
    });
  } catch (error) {
    console.warn('[reading-memory] backfill article annotation memory entries failed', {
      articleId: article.id,
      error,
    });
  }
}

function readStoreRows(database: StoreDatabase, profile?: StoreReadProfileEntry[]): DesktopStore {
  const user = measureStoreRead(profile, 'read_user', () =>
    database.select().from(schema.userProfiles).limit(1).get(),
  );
  const settings = measureStoreRead(profile, 'read_settings', () =>
    database.select().from(schema.appSettings).limit(1).get(),
  );
  const providerRows = measureStoreRead(profile, 'read_providers', () =>
    database.select().from(schema.providers).all(),
  );
  const agentRows = measureStoreRead(profile, 'ensure_preset_agents', () =>
    ensurePresetAgents(database, providerRows, settings),
  );
  const articleRows = readArticleSummaryRowsForStore(database, profile);
  const articleCounts = measureStoreRead(profile, 'read_article_summary_counts', () =>
    readArticleSummaryCounts(database, profile),
  );

  return measureStoreRead(
    profile,
    'normalize_store_rows',
    () => ({
      user: normalizeUser(rowToUser(user)),
      settings: rowToSettings(settings),
      providers: providerRows.map(rowToProvider),
      agents: agentRows.map(rowToAgent),
      articles: articleRows.map((row) => rowToArticleSummary(row, [], articleCounts.get(row.id))),
    }),
    { articleCount: articleRows.length, agentCount: agentRows.length },
  );
}

function readAgentRuntimeContextRows(database: StoreDatabase): AgentRuntimeStoreContext {
  const settings = database.select().from(schema.appSettings).limit(1).get();
  const providerRows = database.select().from(schema.providers).all();
  const agentRows = ensurePresetAgents(database, providerRows, settings);
  return {
    settings: rowToSettings(settings),
    providers: providerRows.map(rowToProvider),
    agents: agentRows.map(rowToAgent),
  };
}

function writeStoreRows(database: StoreDatabase, store: WritableDesktopStore) {
  database.transaction((tx) => {
    tx.delete(schema.comments).run();
    tx.delete(schema.annotations).run();
    tx.delete(schema.articles).run();
    tx.delete(schema.agents).run();
    tx.delete(schema.providers).run();
    tx.delete(schema.appSettings).run();
    tx.delete(schema.userProfiles).run();

    upsertUser(tx, store.user);
    upsertSettings(tx, store.settings);
    for (const provider of store.providers)
      upsertProvider(tx, provider, provider.hasApiKey ? providerApiKeyRef(provider.id) : undefined);
    for (const agent of store.agents) upsertAgent(tx, agent);
    for (const article of store.articles) writeArticleRows(tx, article);
  });
}
