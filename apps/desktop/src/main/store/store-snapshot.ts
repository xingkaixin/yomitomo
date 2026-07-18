import type { ArticleRecord, DesktopStore } from '@yomitomo/shared';
import { ensurePresetAgents, upsertAgent } from '../agents/agent-repository';
import { readArticleSummaryCounts } from '../articles/article-summary-counts';
import { readArticleSummaryRowsForStore } from '../articles/article-summary-queries';
import { writeArticleRows } from '../articles/article-row-writes';
import {
  readCollectionMemberRows,
  readCollectionRows,
  readLibraryPinRows,
  writeCollectionMemberRows,
  writeCollectionRows,
  writeLibraryPinRows,
} from '../collections/collection-repository';
import * as schema from '../db/schema';
import { providerApiKeyRef } from '../providers/provider-secrets';
import { upsertProvider } from '../providers/provider-repository';
import {
  configureStoreDatabaseSeeder,
  getDatabase,
  type StoreDatabase,
  type StoreExecutor,
  type StoreReadProfileEntry,
} from './store-db';
import { migrateProviderApiKeys } from './store-provider-key-migration';
import { recoverPendingSecretDeletions } from '../providers/secret-deletion-repository';
import { backfillAnnotationMemoryOnce } from './store-reading-memory-lifecycle';
import { measureStoreRead, measureStoreReadAsync } from './store-read-profile';
import { upsertSettings, upsertUser } from './settings-repository';
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

type WritableDesktopStore = Omit<DesktopStore, 'articles'> & { articles: ArticleRecord[] };

configureStoreDatabaseSeeder(seedDefaultStore);

export async function readStore(): Promise<DesktopStore> {
  return readStoreInternal();
}

export async function readShellStore(): Promise<DesktopStore> {
  return readStoreInternal(undefined, { includeArticles: false });
}

export async function readStoreWithProfile(): Promise<{
  store: DesktopStore;
  profile: StoreReadProfileEntry[];
}> {
  const profile: StoreReadProfileEntry[] = [];
  return { store: await readStoreInternal(profile), profile };
}

export async function readShellStoreWithProfile(): Promise<{
  store: DesktopStore;
  profile: StoreReadProfileEntry[];
}> {
  const profile: StoreReadProfileEntry[] = [];
  return { store: await readStoreInternal(profile, { includeArticles: false }), profile };
}

export function warmStoreDatabaseWithProfile() {
  const profile: StoreReadProfileEntry[] = [];
  measureStoreRead(profile, 'get_database', getDatabase);
  return profile;
}

export async function writeStore(store: WritableDesktopStore): Promise<DesktopStore> {
  const normalized = normalizeWritableStore(store);
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  writeStoreRows(database, normalized);
  return readStore();
}

async function readStoreInternal(
  profile?: StoreReadProfileEntry[],
  options: { includeArticles?: boolean } = {},
): Promise<DesktopStore> {
  const database = measureStoreRead(profile, 'get_database', getDatabase);
  await measureStoreReadAsync(profile, 'recover_secret_deletions', recoverPendingSecretDeletions);
  await measureStoreReadAsync(profile, 'migrate_provider_api_keys', () =>
    migrateProviderApiKeys(database),
  );
  backfillAnnotationMemoryOnce(database, profile);
  return measureStoreRead(profile, 'read_store_rows', () =>
    readStoreRows(database, profile, { includeArticles: options.includeArticles !== false }),
  );
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

function readStoreRows(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
  options: { includeArticles: boolean } = { includeArticles: true },
): DesktopStore {
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
  const articleRows = options.includeArticles
    ? readArticleSummaryRowsForStore(database, profile)
    : [];
  const collectionRows = measureStoreRead(profile, 'read_collections', () =>
    readCollectionRows(database),
  );
  const collectionMemberRows = measureStoreRead(profile, 'read_collection_members', () =>
    readCollectionMemberRows(database),
  );
  const pinRows = measureStoreRead(profile, 'read_library_pins', () =>
    readLibraryPinRows(database),
  );
  const articleCounts = options.includeArticles
    ? measureStoreRead(profile, 'read_article_summary_counts', () =>
        readArticleSummaryCounts(database, profile),
      )
    : new Map();

  return measureStoreRead(
    profile,
    'normalize_store_rows',
    () => ({
      user: normalizeUser(rowToUser(user)),
      settings: rowToSettings(settings),
      providers: providerRows.map(rowToProvider),
      agents: agentRows.map(rowToAgent),
      articles: articleRows.map((row) => rowToArticleSummary(row, [], articleCounts.get(row.id))),
      collections: collectionRows,
      collectionMembers: collectionMemberRows,
      pins: pinRows,
    }),
    {
      articleCount: articleRows.length,
      agentCount: agentRows.length,
      collectionCount: collectionRows.length,
      pinCount: pinRows.length,
    },
  );
}

function writeStoreRows(database: StoreDatabase, store: WritableDesktopStore) {
  database.transaction((tx) => {
    tx.delete(schema.libraryPins).run();
    tx.delete(schema.collectionMembers).run();
    tx.delete(schema.collections).run();
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
    writeCollectionStoreRows(tx, store);
  });
}

function writeCollectionStoreRows(
  database: StoreExecutor,
  store: Pick<DesktopStore, 'collections' | 'collectionMembers' | 'pins'>,
) {
  for (const collection of store.collections) writeCollectionRows(database, collection);
  for (const member of store.collectionMembers) writeCollectionMemberRows(database, member);
  for (const pin of store.pins) writeLibraryPinRows(database, pin);
}
