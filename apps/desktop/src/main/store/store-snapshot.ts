import type { DesktopStore } from '@yomitomo/shared';
import { ensurePresetAgents } from '../agents/agent-repository';
import { readArticleSummaryCounts } from '../articles/article-summary-counts';
import { readArticleSummaryRowsForStore } from '../articles/article-summary-queries';
import {
  readCollectionMemberRows,
  readCollectionRows,
  readLibraryPinRows,
} from '../collections/collection-repository';
import * as schema from '../db/schema';
import {
  configureStoreDatabaseSeeder,
  getDatabase,
  type StoreDatabase,
  type StoreReadProfileEntry,
} from './store-db';
import { migrateProviderApiKeys } from './store-provider-key-migration';
import { recoverPendingSecretDeletions } from '../providers/secret-deletion-repository';
import { recoverPendingArticleSourceCleanup } from '../articles/article-source-cleanup';
import { backfillAnnotationMemoryOnce } from './store-reading-memory-lifecycle';
import { measureStoreRead, measureStoreReadAsync } from './store-read-profile';
import { upsertSettings, upsertUser } from './settings-repository';
import {
  defaultStore,
  normalizeUser,
  rowToAgent,
  rowToArticleSummary,
  rowToProvider,
  rowToSettings,
  rowToUser,
} from './store-normalizers';

configureStoreDatabaseSeeder(ensureDefaultStoreRows);

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

async function readStoreInternal(
  profile?: StoreReadProfileEntry[],
  options: { includeArticles?: boolean } = {},
): Promise<DesktopStore> {
  const database = measureStoreRead(profile, 'get_database', getDatabase);
  await measureStoreReadAsync(profile, 'recover_secret_deletions', recoverPendingSecretDeletions);
  await measureStoreReadAsync(
    profile,
    'recover_article_source_cleanup',
    recoverPendingArticleSourceCleanup,
  );
  await measureStoreReadAsync(profile, 'migrate_provider_api_keys', () =>
    migrateProviderApiKeys(database),
  );
  backfillAnnotationMemoryOnce(database, profile);
  return measureStoreRead(profile, 'read_store_rows', () =>
    readStoreRows(database, profile, { includeArticles: options.includeArticles !== false }),
  );
}

function ensureDefaultStoreRows(database: StoreDatabase) {
  const hasUser = database
    .select({ id: schema.userProfiles.id })
    .from(schema.userProfiles)
    .limit(1)
    .get();
  const hasSettings = database
    .select({ id: schema.appSettings.id })
    .from(schema.appSettings)
    .limit(1)
    .get();
  if (hasUser && hasSettings) return;

  database.transaction((tx) => {
    if (!hasUser) upsertUser(tx, defaultStore.user);
    if (!hasSettings) upsertSettings(tx, defaultStore.settings);
  });
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
      articles: articleRows.map((row) => rowToArticleSummary(row, articleCounts.get(row.id))),
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
