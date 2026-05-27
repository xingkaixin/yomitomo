import { performance } from 'node:perf_hooks';
import { eq } from 'drizzle-orm';
import type {
  Agent,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleUpsertPatch,
  DesktopStore,
  UserProfile,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { buildAgentRecord, ensurePresetAgents, upsertAgent } from './agent-repository';
import {
  backfillStoredArticleAnnotationMemoryEntries,
  buildArticleUpsertPatch,
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteArticleRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
  findArticleByIdentityRows,
  readArticleCoverRows,
  readArticleRows,
  readArticleSummaryCounts,
  readArticleSummaryRows,
  readArticleSummaryRowsForStore,
  saveArticleReadingProgressRows,
  saveArticleRows,
  writeArticleRows,
  type ArticleIdentity,
} from './article-repository';
import * as schema from './db/schema';
import { providerApiKeyRef, saveProviderApiKey } from './provider-secrets';
import {
  buildProviderRecord,
  deleteProviderSecret,
  readProviderSecretStorageRow,
  resolveProviderApiKeyStorage,
  upsertProvider,
  type SaveProviderInput,
} from './provider-repository';
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
import type { ReadingMemorySqliteExecutor } from './reading-memory-store';
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
} from './weread-repository';

export { mergeSettingsForUpsert } from './store-normalizers';
export {
  buildArticleChildRows,
  buildArticleReadingProgressPatch,
  buildArticleUpsertPatch,
  findArticleInListByIdentity,
} from './article-repository';
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
} from './provider-repository';
export { buildAgentRecord } from './agent-repository';
let providerSecretsMigrated = false;
let annotationMemoryBackfilled = false;

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

export function readImportSettings(): Pick<AppSettings, 'saveArticleImages'> {
  return readImportSettingsRows(getDatabase());
}

export function findArticleByIdentity(identity: ArticleIdentity): ArticleIdentity | null {
  return findArticleByIdentityRows(getDatabase(), identity);
}

export async function readArticleCover(id: string): Promise<string> {
  return readArticleCoverRows(getDatabase(), id);
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
      settings?.reviewAssistantProviderId === id
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

export async function saveArticleReadingProgress(
  articleId: string,
  progress: ArticleReadingProgress,
) {
  return saveArticleReadingProgressRows(getDatabase(), articleId, progress);
}

export async function deleteArticle(id: string) {
  return deleteArticleRowsWithMemoryLifecycle(sqliteExecutor(), id);
}

export async function deleteArticleAnnotation(input: {
  articleId: string;
  annotationId: string;
}): Promise<ArticleUpsertPatch | null> {
  deleteAnnotationRowsWithMemoryLifecycle(sqliteExecutor(), input);
  const article = readArticleSummaryRows(getDatabase(), input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export async function deleteArticleComment(input: {
  articleId: string;
  annotationId: string;
  commentId: string;
}): Promise<ArticleUpsertPatch | null> {
  deleteCommentRowsWithMemoryLifecycle(sqliteExecutor(), input);
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
  annotationMemoryBackfilled = true;

  try {
    measureStoreRead(profile, 'backfill_annotation_memory', () =>
      backfillStoredArticleAnnotationMemoryEntries(database, sqliteExecutor(), {
        includePdf: false,
      }),
    );
  } catch (error) {
    console.warn('[reading-memory] backfill annotation memory entries failed', { error });
  }
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
