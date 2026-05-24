import { copyFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { app } from 'electron';
import { count, desc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import SQLiteDatabase from 'better-sqlite3';
import type {
  Agent,
  Annotation,
  AppSettings,
  ArticleDeletePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  Comment,
  DesktopStore,
  LlmProvider,
  UserProfile,
  WeReadBook,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadOpenMethod,
  WeReadReadingStatsSnapshot,
  WeReadReadingStatsState,
  WeReadSettings,
  WeReadThought,
} from '@yomitomo/shared';
import {
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  providerPresets,
} from '@yomitomo/shared';
import { agentPersonalities } from '@yomitomo/shared';
import { presetAgentAvatars } from './agent-avatars';
import {
  assertDatabaseReaderCompatible,
  databaseReaderCompatibility,
  ensureDatabaseCompatibilityTable,
  migrationReaderLevel,
  readDatabaseReaderLevel,
  writeDatabaseReaderLevel,
} from './db/compatibility';
import { migrations } from './db/migrations';
import * as schema from './db/schema';
import {
  deleteProviderApiKey,
  providerApiKeyRef,
  readProviderApiKey,
  readWeReadApiKey,
  saveProviderApiKey,
  saveWeReadApiKey,
  deleteWeReadApiKey,
} from './provider-secrets';
import {
  defaultStore,
  defaultUser,
  mergeSettingsForUpsert,
  normalizeAgentKind,
  normalizeAgentUsername,
  normalizeAnnotationDensity,
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeModelNames,
  normalizePresetId,
  normalizeProviderModelInputMode,
  normalizeProviderType,
  normalizeStore,
  normalizeTemperature,
  normalizeUser,
  normalizeUsername,
  type ArticleSummaryRow,
  rowToAgent,
  rowToAnnotation,
  rowToArticle,
  rowToArticleSummary,
  rowToComment,
  rowToProvider,
  rowToSettings,
  rowToUser,
  sortByCreatedAt,
  type ArticleSummaryCounts,
  userToRow,
} from './store-normalizers';

export { mergeSettingsForUpsert } from './store-normalizers';

const DB_FILE_NAME = 'yomitomo.sqlite';
const INSERT_BATCH_SIZE = 32;

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');
const articleSummaryColumns = {
  id: schema.articles.id,
  url: schema.articles.url,
  canonicalUrl: schema.articles.canonicalUrl,
  sourceType: schema.articles.sourceType,
  title: schema.articles.title,
  byline: schema.articles.byline,
  excerpt: schema.articles.excerpt,
  siteName: schema.articles.siteName,
  themeColor: schema.articles.themeColor,
  contentHash: schema.articles.contentHash,
  ebookMetadata: schema.articles.ebookMetadata,
  pdfMetadata: schema.articles.pdfMetadata,
  readingProgress: schema.articles.readingProgress,
  createdAt: schema.articles.createdAt,
  updatedAt: schema.articles.updatedAt,
} satisfies Record<keyof ArticleSummaryRow, unknown>;
const articleIdentityColumns = {
  id: schema.articles.id,
  url: schema.articles.url,
  canonicalUrl: schema.articles.canonicalUrl,
};
const WEREAD_ACCOUNT_ID = 'default';
const WEREAD_SKILL_VERSION = '1.0.3';

let sqlite: SQLiteDatabase.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;
let providerSecretsMigrated = false;
type StoreDatabase = BetterSQLite3Database<typeof schema>;
type StoreTransaction = Parameters<StoreDatabase['transaction']>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type StoreExecutor = StoreDatabase | StoreTransaction;
type ArticleIdentity = Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>;
export type StoreReadProfileEntry = {
  name: string;
  durationMs: number;
  data?: Record<string, number>;
};

function databasePath() {
  return join(app.getPath('userData'), DB_FILE_NAME);
}

export function getDataDirectoryPath() {
  return app.getPath('userData');
}

export function getDatabasePath() {
  return databasePath();
}

function getDatabase() {
  if (db) return db;

  const file = databasePath();
  mkdirSync(dirname(file), { recursive: true });

  sqlite = new SQLiteDatabase(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);

  db = drizzle(sqlite, { schema });
  seedDefaultStore(db);
  return db;
}

function getSqliteDatabase() {
  getDatabase();
  if (!sqlite) throw new Error('本地数据库尚未打开');
  return sqlite;
}

export async function backupDatabaseFile(targetPath: string) {
  const target = resolve(targetPath);
  const source = resolve(databasePath());
  if (target === source) throw new Error('不能把备份保存到当前数据库文件');

  const database = getSqliteDatabase();
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });
  await removeSqliteSidecarFiles(target);
  database.pragma('wal_checkpoint(FULL)');
  await database.backup(target);
  return target;
}

export function closeDatabase() {
  db = null;
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
  providerSecretsMigrated = false;
}

export async function replaceDatabaseFile(sourcePath: string) {
  const source = resolve(sourcePath);
  const target = resolve(databasePath());
  if (source === target) throw new Error('不能从当前数据库文件还原');

  const backupPath = await safetyBackupPath();
  if (existsSync(target)) await backupDatabaseFile(backupPath);

  closeDatabase();
  await mkdir(dirname(target), { recursive: true });
  await removeSqliteSidecarFiles(target);
  await copyFile(source, target);
  return backupPath;
}

async function safetyBackupPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join(app.getPath('userData'), 'backups');
  await mkdir(directory, { recursive: true });
  return join(directory, `yomitomo-before-restore-${timestamp}.sqlite`);
}

async function removeSqliteSidecarFiles(filePath: string) {
  await Promise.all([
    rm(`${filePath}-wal`, { force: true }),
    rm(`${filePath}-shm`, { force: true }),
  ]);
}

function runMigrations(database: SQLiteDatabase.Database) {
  database.exec(`
CREATE TABLE IF NOT EXISTS __yomitomo_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
`);

  const applied = new Set(
    database
      .prepare('SELECT id FROM __yomitomo_migrations')
      .all()
      .map((row) => String((row as { id: string }).id)),
  );

  ensureDatabaseCompatibilityTable(database);
  let readerLevel = assertDatabaseReaderCompatible(applied, readDatabaseReaderLevel(database));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO __yomitomo_migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
      readerLevel = Math.max(readerLevel, migrationReaderLevel(migration));
      writeDatabaseReaderLevel(database, readerLevel);
    })();
    applied.add(migration.id);
  }

  const compatibility = databaseReaderCompatibility(applied, readDatabaseReaderLevel(database));
  writeDatabaseReaderLevel(database, compatibility.requiredReaderLevel);
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
  if (!sqlite) return;
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  sqlite.exec('VACUUM');
}

function seedDefaultStore(database: StoreDatabase) {
  const hasUser = database
    .select({ id: schema.userProfiles.id })
    .from(schema.userProfiles)
    .limit(1)
    .get();
  if (hasUser) return;

  writeStoreRows(database, defaultStore as WritableDesktopStore);
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
  return measureStoreRead(profile, 'read_store_rows', () => readStoreRows(database, profile));
}

export async function readArticle(id: string): Promise<ArticleRecord | null> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const row = database.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
  if (!row) return null;

  return rowToArticle(row, readArticleAnnotations(database, id));
}

export async function readArticleSummary(id: string): Promise<ArticleSummaryRecord | null> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  const row = database
    .select(articleSummaryColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, id))
    .get();
  if (!row) return null;

  return rowToArticleSummary(row, [], readArticleSummaryCounts(database).get(id));
}

export function readImportSettings(): Pick<AppSettings, 'saveArticleImages'> {
  const settings = getDatabase().select().from(schema.appSettings).limit(1).get();
  return { saveArticleImages: Boolean(settings?.saveArticleImages) };
}

export function findArticleByIdentity(identity: ArticleIdentity): ArticleIdentity | null {
  const database = getDatabase();
  const idMatch = database
    .select(articleIdentityColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, identity.id))
    .get();
  if (idMatch) return idMatch;

  const candidates = Array.from(new Set([identity.canonicalUrl, identity.url]));
  const row = database
    .select(articleIdentityColumns)
    .from(schema.articles)
    .where(
      or(
        inArray(schema.articles.canonicalUrl, candidates),
        inArray(schema.articles.url, candidates),
      ),
    )
    .orderBy(desc(schema.articles.updatedAt))
    .get();
  return row ? findArticleInListByIdentity([row], identity) : null;
}

export function findArticleInListByIdentity<T extends ArticleIdentity>(
  articles: T[],
  identity: ArticleIdentity,
): T | null {
  return (
    articles.find((item) => item.id === identity.id) ||
    articles.find(
      (item) =>
        item.canonicalUrl === identity.canonicalUrl ||
        item.url === identity.url ||
        item.url === identity.canonicalUrl ||
        item.canonicalUrl === identity.url,
    ) ||
    null
  );
}

export async function readArticleCover(id: string): Promise<string> {
  return (
    getDatabase()
      .select({ leadImageUrl: schema.articles.leadImageUrl })
      .from(schema.articles)
      .where(eq(schema.articles.id, id))
      .get()?.leadImageUrl || ''
  );
}

type WritableDesktopStore = Omit<DesktopStore, 'articles'> & { articles: ArticleRecord[] };

export async function writeStore(store: WritableDesktopStore): Promise<DesktopStore> {
  const normalized = normalizeStore(store) as WritableDesktopStore;
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  writeStoreRows(database, normalized);
  return readStore();
}

export async function hydrateProviderApiKey(provider: LlmProvider): Promise<LlmProvider> {
  const apiKey =
    provider.apiKey?.trim() ||
    (await readProviderApiKey(provider.id)) ||
    readLegacyProviderApiKey(provider.id);
  if (!apiKey) throw new Error(`请先为供应商「${provider.name}」配置 API Key`);
  return { ...provider, apiKey };
}

export async function hydrateProviderInputApiKey(
  provider: Partial<LlmProvider>,
): Promise<Partial<LlmProvider>> {
  const apiKey =
    provider.apiKey?.trim() ||
    (provider.id
      ? (await readProviderApiKey(provider.id)) || readLegacyProviderApiKey(provider.id)
      : '');
  return { ...provider, apiKey };
}

export async function readStoredProviderApiKey(providerId: string) {
  return (await readProviderApiKey(providerId)) || readLegacyProviderApiKey(providerId);
}

export async function readStoredWeReadApiKey() {
  const account = readWeReadAccountRow();
  return readWeReadApiKey(account?.apiKeyRef);
}

export async function readWeReadState() {
  return {
    settings: await readWeReadSettings(),
    books: readWeReadBooks(),
  };
}

export async function readWeReadSettings(): Promise<WeReadSettings> {
  const account = readWeReadAccountRow();
  return {
    configured: Boolean(account?.apiKeyRef && (await readWeReadApiKey(account.apiKeyRef))),
    openMethod: normalizeWeReadOpenMethod(account?.openMethod),
    status: normalizeWeReadStatus(account?.status),
    lastSyncAt: account?.lastSyncAt || undefined,
    lastTestAt: account?.lastTestAt || undefined,
    message: account?.message || undefined,
  };
}

export async function saveWeReadSettings(input: {
  apiKey?: string;
  removeApiKey?: boolean;
  openMethod: WeReadOpenMethod;
}) {
  const existing = readWeReadAccountRow();
  let apiKeyRef = existing?.apiKeyRef || null;
  if (input.apiKey?.trim()) apiKeyRef = await saveWeReadApiKey(input.apiKey.trim());
  else if (input.removeApiKey) {
    await deleteWeReadApiKey(apiKeyRef);
    apiKeyRef = null;
  }
  upsertWeReadAccount({
    apiKeyRef,
    openMethod: normalizeWeReadOpenMethod(input.openMethod),
    status: apiKeyRef ? existing?.status || 'idle' : 'idle',
    message: apiKeyRef ? existing?.message : null,
    lastSyncAt: existing?.lastSyncAt,
    lastTestAt: existing?.lastTestAt,
  });
  return readWeReadState();
}

export async function saveWeReadTestResult(ok: boolean, message: string) {
  const existing = readWeReadAccountRow();
  upsertWeReadAccount({
    apiKeyRef: existing?.apiKeyRef || null,
    openMethod: normalizeWeReadOpenMethod(existing?.openMethod),
    status: ok ? 'connected' : 'error',
    message,
    lastSyncAt: existing?.lastSyncAt,
    lastTestAt: new Date().toISOString(),
  });
  return readWeReadState();
}

export async function saveWeReadBooks(books: WeReadBook[]) {
  const database = getDatabase();
  database.transaction((tx) => {
    for (const book of books) upsertWeReadBook(tx, book);
    removeStaleWeReadBooks(
      tx,
      books.map((book) => book.bookId),
    );
    const existing = tx
      .select()
      .from(schema.wereadAccounts)
      .where(eq(schema.wereadAccounts.id, WEREAD_ACCOUNT_ID))
      .get();
    upsertWeReadAccountRow(tx, {
      apiKeyRef: existing?.apiKeyRef || null,
      openMethod: normalizeWeReadOpenMethod(existing?.openMethod),
      status: 'connected',
      message: null,
      lastSyncAt: new Date().toISOString(),
      lastTestAt: existing?.lastTestAt,
    });
  });
  return readWeReadState();
}

export async function saveWeReadBookDetails(details: WeReadBookDetail[]) {
  const database = getDatabase();
  database.transaction((tx) => {
    for (const detail of details) upsertWeReadBookDetail(tx, detail);
    removeStaleWeReadBooks(
      tx,
      details.map((detail) => detail.book.bookId),
    );
    const existing = tx
      .select()
      .from(schema.wereadAccounts)
      .where(eq(schema.wereadAccounts.id, WEREAD_ACCOUNT_ID))
      .get();
    upsertWeReadAccountRow(tx, {
      apiKeyRef: existing?.apiKeyRef || null,
      openMethod: normalizeWeReadOpenMethod(existing?.openMethod),
      status: 'connected',
      message: null,
      lastSyncAt: new Date().toISOString(),
      lastTestAt: existing?.lastTestAt,
    });
  });
  return readWeReadState();
}

export async function saveWeReadBookDetail(detail: WeReadBookDetail) {
  const database = getDatabase();
  database.transaction((tx) => {
    if (detail.highlights.length + detail.thoughts.length === 0)
      removeWeReadBookRows(tx, [detail.book.bookId]);
    else upsertWeReadBookDetail(tx, detail);
  });
  const saved = readWeReadBookDetail(detail.book.bookId);
  return saved;
}

export function readWeReadBooks(): WeReadBook[] {
  return getDatabase()
    .select()
    .from(schema.wereadBooks)
    .orderBy(desc(schema.wereadBooks.updatedAt))
    .all()
    .map(rowToWeReadBook)
    .toSorted(
      (left, right) => (right.lastReadAt || right.sort || 0) - (left.lastReadAt || left.sort || 0),
    );
}

export function readWeReadBookDetail(bookId: string): WeReadBookDetail | null {
  const database = getDatabase();
  const book = database
    .select()
    .from(schema.wereadBooks)
    .where(eq(schema.wereadBooks.bookId, bookId))
    .get();
  if (!book) return null;
  const chapters = database
    .select()
    .from(schema.wereadChapters)
    .where(eq(schema.wereadChapters.bookId, bookId))
    .all()
    .map(rowToWeReadChapter)
    .toSorted((left, right) => left.chapterIdx - right.chapterIdx);
  const highlights = database
    .select()
    .from(schema.wereadHighlights)
    .where(eq(schema.wereadHighlights.bookId, bookId))
    .all()
    .map(rowToWeReadHighlight);
  const thoughts = database
    .select()
    .from(schema.wereadThoughts)
    .where(eq(schema.wereadThoughts.bookId, bookId))
    .all()
    .map(rowToWeReadThought);
  return { book: rowToWeReadBook(book), chapters, highlights, thoughts };
}

export function readWeReadReadingStatsState(): WeReadReadingStatsState {
  return {
    snapshots: getDatabase()
      .select()
      .from(schema.wereadReadingStats)
      .orderBy(desc(schema.wereadReadingStats.fetchedAt))
      .all()
      .map(rowToWeReadReadingStatsSnapshot),
  };
}

export function saveWeReadReadingStatsSnapshot(snapshot: WeReadReadingStatsSnapshot) {
  const row = {
    id: snapshot.id,
    mode: snapshot.mode,
    periodStart: snapshot.periodStart,
    sourceBaseTime: snapshot.sourceBaseTime ?? null,
    payload: snapshot.data,
    fetchedAt: snapshot.fetchedAt,
    updatedAt: new Date().toISOString(),
  };
  getDatabase()
    .insert(schema.wereadReadingStats)
    .values(row)
    .onConflictDoUpdate({ target: schema.wereadReadingStats.id, set: row })
    .run();
  return readWeReadReadingStatsState();
}

function readLegacyProviderApiKey(providerId: string) {
  return (
    getDatabase()
      .select({ apiKey: schema.providers.apiKey })
      .from(schema.providers)
      .where(eq(schema.providers.id, providerId))
      .get()
      ?.apiKey.trim() || ''
  );
}

function readWeReadAccountRow() {
  return getDatabase()
    .select()
    .from(schema.wereadAccounts)
    .where(eq(schema.wereadAccounts.id, WEREAD_ACCOUNT_ID))
    .get();
}

function upsertWeReadAccount(input: {
  apiKeyRef: string | null;
  openMethod: WeReadOpenMethod;
  status: string;
  message?: string | null;
  lastSyncAt?: string | null;
  lastTestAt?: string | null;
}) {
  upsertWeReadAccountRow(getDatabase(), input);
}

function upsertWeReadAccountRow(
  database: StoreExecutor,
  input: {
    apiKeyRef: string | null;
    openMethod: WeReadOpenMethod;
    status: string;
    message?: string | null;
    lastSyncAt?: string | null;
    lastTestAt?: string | null;
  },
) {
  const row = {
    id: WEREAD_ACCOUNT_ID,
    apiKeyRef: input.apiKeyRef,
    openMethod: input.openMethod,
    skillVersion: WEREAD_SKILL_VERSION,
    status: input.status,
    message: input.message || null,
    lastSyncAt: input.lastSyncAt || null,
    lastTestAt: input.lastTestAt || null,
    updatedAt: new Date().toISOString(),
  };
  database
    .insert(schema.wereadAccounts)
    .values(row)
    .onConflictDoUpdate({ target: schema.wereadAccounts.id, set: row })
    .run();
}

function upsertWeReadBook(database: StoreExecutor, book: WeReadBook) {
  const row = {
    bookId: book.bookId,
    title: book.title,
    author: book.author || null,
    cover: book.cover || null,
    intro: book.intro || null,
    reviewCount: book.reviewCount,
    noteCount: book.noteCount,
    bookmarkCount: book.bookmarkCount,
    readingProgress: book.readingProgress,
    markedStatus: book.markedStatus ?? null,
    sort: book.sort ?? null,
    currentChapterUid: book.currentChapterUid ?? null,
    currentChapterOffset: book.currentChapterOffset ?? null,
    readingTime: book.readingTime ?? null,
    recordReadingTime: book.recordReadingTime ?? null,
    lastReadAt: book.lastReadAt ?? null,
    syncedAt: book.syncedAt || new Date().toISOString(),
    updatedAt: book.updatedAt,
  };
  database
    .insert(schema.wereadBooks)
    .values(row)
    .onConflictDoUpdate({ target: schema.wereadBooks.bookId, set: row })
    .run();
}

function upsertWeReadBookDetail(database: StoreExecutor, detail: WeReadBookDetail) {
  upsertWeReadBook(database, detail.book);
  database
    .delete(schema.wereadChapters)
    .where(eq(schema.wereadChapters.bookId, detail.book.bookId))
    .run();
  database
    .delete(schema.wereadHighlights)
    .where(eq(schema.wereadHighlights.bookId, detail.book.bookId))
    .run();
  database
    .delete(schema.wereadThoughts)
    .where(eq(schema.wereadThoughts.bookId, detail.book.bookId))
    .run();
  for (const chapter of detail.chapters) insertWeReadChapter(database, chapter);
  for (const highlight of detail.highlights) insertWeReadHighlight(database, highlight);
  for (const thought of detail.thoughts) insertWeReadThought(database, thought);
}

function removeStaleWeReadBooks(database: StoreExecutor, bookIds: string[]) {
  const staleBookRows =
    bookIds.length > 0
      ? database
          .select({ bookId: schema.wereadBooks.bookId })
          .from(schema.wereadBooks)
          .where(notInArray(schema.wereadBooks.bookId, bookIds))
          .all()
      : database.select({ bookId: schema.wereadBooks.bookId }).from(schema.wereadBooks).all();
  const staleBookIds = staleBookRows.map((row) => row.bookId);
  if (staleBookIds.length === 0) return;

  removeWeReadBookRows(database, staleBookIds);
}

function removeWeReadBookRows(database: StoreExecutor, staleBookIds: string[]) {
  database
    .delete(schema.wereadChapters)
    .where(inArray(schema.wereadChapters.bookId, staleBookIds))
    .run();
  database
    .delete(schema.wereadHighlights)
    .where(inArray(schema.wereadHighlights.bookId, staleBookIds))
    .run();
  database
    .delete(schema.wereadThoughts)
    .where(inArray(schema.wereadThoughts.bookId, staleBookIds))
    .run();
  database.delete(schema.wereadBooks).where(inArray(schema.wereadBooks.bookId, staleBookIds)).run();
}

function insertWeReadChapter(database: StoreExecutor, chapter: WeReadChapter) {
  database
    .insert(schema.wereadChapters)
    .values({
      bookId: chapter.bookId,
      chapterUid: chapter.chapterUid,
      chapterIdx: chapter.chapterIdx,
      title: chapter.title,
      level: chapter.level,
      wordCount: chapter.wordCount ?? null,
    })
    .run();
}

function insertWeReadHighlight(database: StoreExecutor, highlight: WeReadHighlight) {
  database
    .insert(schema.wereadHighlights)
    .values({
      bookmarkId: highlight.bookmarkId,
      bookId: highlight.bookId,
      chapterUid: highlight.chapterUid,
      chapterIdx: highlight.chapterIdx ?? null,
      range: highlight.range || null,
      markText: highlight.markText,
      colorStyle: highlight.colorStyle ?? null,
      createTime: highlight.createTime,
    })
    .run();
}

function insertWeReadThought(database: StoreExecutor, thought: WeReadThought) {
  database
    .insert(schema.wereadThoughts)
    .values({
      reviewId: thought.reviewId,
      bookId: thought.bookId,
      userVid: thought.userVid ?? null,
      author: thought.author || null,
      chapterUid: thought.chapterUid ?? null,
      chapterIdx: thought.chapterIdx ?? null,
      chapterName: thought.chapterName || null,
      range: thought.range || null,
      abstract: thought.abstract || null,
      content: thought.content,
      createTime: thought.createTime,
    })
    .run();
}

function rowToWeReadBook(row: typeof schema.wereadBooks.$inferSelect): WeReadBook {
  return {
    bookId: row.bookId,
    title: row.title,
    author: row.author || undefined,
    cover: row.cover || undefined,
    intro: row.intro || undefined,
    reviewCount: row.reviewCount,
    noteCount: row.noteCount,
    bookmarkCount: row.bookmarkCount,
    readingProgress: row.readingProgress,
    markedStatus: row.markedStatus ?? undefined,
    sort: row.sort ?? undefined,
    currentChapterUid: row.currentChapterUid ?? undefined,
    currentChapterOffset: row.currentChapterOffset ?? undefined,
    readingTime: row.readingTime ?? undefined,
    recordReadingTime: row.recordReadingTime ?? undefined,
    lastReadAt: row.lastReadAt ?? undefined,
    syncedAt: row.syncedAt || undefined,
    updatedAt: row.updatedAt,
  };
}

function rowToWeReadReadingStatsSnapshot(
  row: typeof schema.wereadReadingStats.$inferSelect,
): WeReadReadingStatsSnapshot {
  return {
    id: row.id,
    mode:
      row.mode === 'weekly' || row.mode === 'monthly' || row.mode === 'annually'
        ? row.mode
        : 'overall',
    periodStart: row.periodStart,
    sourceBaseTime: row.sourceBaseTime ?? undefined,
    data: row.payload as WeReadReadingStatsSnapshot['data'],
    fetchedAt: row.fetchedAt,
  };
}

function rowToWeReadChapter(row: typeof schema.wereadChapters.$inferSelect): WeReadChapter {
  return {
    bookId: row.bookId,
    chapterUid: row.chapterUid,
    chapterIdx: row.chapterIdx,
    title: row.title,
    level: row.level,
    wordCount: row.wordCount ?? undefined,
  };
}

function rowToWeReadHighlight(row: typeof schema.wereadHighlights.$inferSelect): WeReadHighlight {
  return {
    bookmarkId: row.bookmarkId,
    bookId: row.bookId,
    chapterUid: row.chapterUid,
    chapterIdx: row.chapterIdx ?? undefined,
    range: row.range || undefined,
    markText: row.markText,
    colorStyle: row.colorStyle ?? undefined,
    createTime: row.createTime,
  };
}

function rowToWeReadThought(row: typeof schema.wereadThoughts.$inferSelect): WeReadThought {
  return {
    reviewId: row.reviewId,
    bookId: row.bookId,
    userVid: row.userVid ?? undefined,
    author: (row.author as WeReadThought['author']) || undefined,
    chapterUid: row.chapterUid ?? undefined,
    chapterIdx: row.chapterIdx ?? undefined,
    chapterName: row.chapterName || undefined,
    range: row.range || undefined,
    abstract: row.abstract || undefined,
    content: row.content,
    createTime: row.createTime,
  };
}

function normalizeWeReadOpenMethod(value: unknown): WeReadOpenMethod {
  return value === 'web' ? 'web' : 'deeplink';
}

function normalizeWeReadStatus(value: unknown): WeReadSettings['status'] {
  return value === 'connected' || value === 'error' || value === 'idle' ? value : 'idle';
}

export async function saveUser(input: Partial<UserProfile>): Promise<DesktopStore> {
  const store = await readStore();
  const user: UserProfile = {
    id: store.user.id || defaultUser.id,
    nickname: input.nickname?.trim() || store.user.nickname,
    username: normalizeUsername(input.username || input.nickname || store.user.username || 'me'),
    avatar: input.avatar || store.user.avatar,
    annotationColor: input.annotationColor?.trim() || store.user.annotationColor,
    updatedAt: new Date().toISOString(),
  };

  upsertUser(getDatabase(), user);
  return readStore();
}

export async function saveSettings(input: AppSettings): Promise<DesktopStore> {
  upsertSettings(getDatabase(), input);
  return readStore();
}

export type SaveProviderInput = Partial<LlmProvider> & {
  removeApiKey?: boolean;
};

export type ProviderApiKeyStorage = {
  apiKeyRef?: string;
  storedApiKey: string;
};

type ProviderApiKeyStorageRow = {
  apiKey: string;
  apiKeyRef: string | null;
};

export async function resolveProviderApiKeyStorage(
  providerId: string,
  input: SaveProviderInput,
  existingRow: ProviderApiKeyStorageRow | undefined,
): Promise<ProviderApiKeyStorage> {
  const existingApiKeyRef = existingRow?.apiKeyRef || undefined;
  const legacyApiKey = existingRow?.apiKey.trim() || '';
  const inputApiKey = input.apiKey?.trim();

  if (inputApiKey) {
    return {
      apiKeyRef: await saveProviderApiKey(providerId, inputApiKey),
      storedApiKey: '',
    };
  }

  if (input.removeApiKey) {
    return {
      apiKeyRef: existingApiKeyRef
        ? await removeProviderApiKey(providerId, existingApiKeyRef)
        : undefined,
      storedApiKey: '',
    };
  }

  if (existingApiKeyRef) {
    return { apiKeyRef: existingApiKeyRef, storedApiKey: '' };
  }

  return { storedApiKey: legacyApiKey };
}

export function buildProviderRecord(
  input: SaveProviderInput,
  options: {
    existing?: LlmProvider;
    id: string;
    now: string;
    apiKeyRef?: string;
    storedApiKey: string;
  },
): LlmProvider {
  const { existing, id, now, apiKeyRef, storedApiKey } = options;
  const preset =
    providerPresets.find((item) => item.id === input.presetId) ||
    (existing ? undefined : defaultProviderPreset);
  const modelInputMode =
    normalizeProviderModelInputMode(input.modelInputMode ?? existing?.modelInputMode) || 'list';

  return {
    id,
    name: input.name?.trim() || existing?.name || preset?.name || 'Untitled Provider',
    type: preset?.type || normalizeProviderType(input.type || existing?.type) || 'openai-chat',
    presetId: normalizePresetId(input.presetId || existing?.presetId || preset?.id),
    logo: input.logo || existing?.logo || preset?.logo,
    baseUrl:
      input.baseUrl?.trim() ||
      existing?.baseUrl ||
      preset?.baseUrl ||
      defaultProviderPreset?.baseUrl ||
      'https://api.deepseek.com',
    apiKey: '',
    hasApiKey: Boolean(apiKeyRef || storedApiKey),
    modelName:
      input.modelName?.trim() ||
      existing?.modelName ||
      preset?.modelName ||
      defaultProviderPreset?.modelName ||
      'deepseek-chat',
    modelNames:
      modelInputMode === 'custom'
        ? undefined
        : normalizeModelNames(input.modelNames) ||
          normalizeModelNames(existing?.modelNames) ||
          preset?.modelNames,
    modelInputMode,
    reasoningEffort: 'none',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export async function saveProvider(input: SaveProviderInput): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id
    ? store.providers.find((provider) => provider.id === input.id)
    : undefined;
  const id = existing?.id || makeId('provider');
  const existingRow = input.id
    ? getDatabase().select().from(schema.providers).where(eq(schema.providers.id, input.id)).get()
    : undefined;
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

async function removeProviderApiKey(providerId: string, apiKeyRef?: string) {
  await deleteProviderApiKey(providerId, apiKeyRef);
  return undefined;
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
  await deleteProviderApiKey(id);
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
        saveArticleImages: Boolean(settings.saveArticleImages),
      });
    }
    tx.delete(schema.providers).where(eq(schema.providers.id, id)).run();
  });
  return readStore();
}

export function buildAgentRecord(
  input: Partial<Agent>,
  store: Pick<DesktopStore, 'agents' | 'providers'>,
  now: string,
): Agent {
  const existing = input.id ? store.agents.find((agent) => agent.id === input.id) : undefined;
  const username = normalizeAgentUsername(
    input.username || existing?.username || input.nickname || 'agent',
    'agent',
  );
  return {
    id: existing?.id || makeId('agent'),
    kind: normalizeAgentKind(input.kind ?? existing?.kind) || 'annotation',
    presetId: input.presetId || existing?.presetId,
    enabled: input.enabled ?? existing?.enabled ?? true,
    providerId: input.providerId || existing?.providerId || store.providers[0]?.id || '',
    nickname: input.nickname?.trim() || existing?.nickname || 'Yomitomo',
    username,
    avatar: input.avatar?.trim() || existing?.avatar || '🤖',
    annotationColor: input.annotationColor?.trim() || existing?.annotationColor || '#8ab6d6',
    annotationDensity:
      normalizeAnnotationDensity(input.annotationDensity) ||
      normalizeAnnotationDensity(existing?.annotationDensity) ||
      'medium',
    temperature: normalizeTemperature(input.temperature ?? existing?.temperature),
    soul:
      input.soul?.trim() ||
      existing?.soul ||
      '你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
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

export async function saveArticle(input: ArticleRecord): Promise<ArticleUpsertPatch> {
  writeArticleRowsInTransaction(getDatabase(), input);
  const article = await readArticleSummary(input.id);
  if (!article) throw new Error('文章保存失败');
  return buildArticleUpsertPatch(article);
}

export function buildArticleUpsertPatch(article: ArticleSummaryRecord): ArticleUpsertPatch {
  return { type: 'article-upsert', article };
}

export async function saveArticleReadingProgress(
  articleId: string,
  progress: ArticleReadingProgress,
): Promise<ArticleReadingProgressPatch> {
  const patch = buildArticleReadingProgressPatch(articleId, progress);
  getDatabase()
    .update(schema.articles)
    .set({
      readingProgress: patch.readingProgress,
      updatedAt: patch.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
  return patch;
}

export function buildArticleReadingProgressPatch(
  articleId: string,
  progress: ArticleReadingProgress,
): ArticleReadingProgressPatch {
  const readingProgress = normalizeArticleReadingProgress(progress) || progress;
  return { articleId, readingProgress, updatedAt: readingProgress.updatedAt };
}

export async function deleteArticle(id: string): Promise<ArticleDeletePatch> {
  getDatabase().delete(schema.articles).where(eq(schema.articles.id, id)).run();
  return { articleId: id };
}

function ensurePresetAgents(
  database: StoreDatabase,
  providerRows: Array<typeof schema.providers.$inferSelect>,
  settings: typeof schema.appSettings.$inferSelect | undefined,
): Array<typeof schema.agents.$inferSelect> {
  const agentRows = database.select().from(schema.agents).all();
  if (providerRows.length === 0) return agentRows;

  const defaultProviderId =
    settings?.readingAssistantProviderId &&
    providerRows.some((provider) => provider.id === settings.readingAssistantProviderId)
      ? settings.readingAssistantProviderId
      : settings?.defaultProviderId &&
          providerRows.some((provider) => provider.id === settings.defaultProviderId)
        ? settings.defaultProviderId
        : providerRows[0]!.id;
  const rowsByPreset = new Map(
    agentRows.flatMap((row) => (row.presetId ? [[row.presetId, row] as const] : [])),
  );
  const now = new Date().toISOString();
  let changed = false;

  for (const personality of agentPersonalities) {
    const existing = rowsByPreset.get(personality.id);
    const agent: Agent = {
      id: existing?.id || `agent_${personality.id.replace(/[^A-Za-z0-9_]/g, '_')}`,
      kind: personality.kind,
      presetId: personality.id,
      enabled: existing?.enabled ?? personality.defaultEnabled,
      providerId: existing?.providerId || defaultProviderId,
      nickname: personality.name,
      username: personality.name,
      avatar:
        presetAgentAvatars[personality.id] || existing?.avatar || personality.name.slice(0, 1),
      annotationColor: existing?.annotationColor || personality.defaultColor,
      annotationDensity: normalizeAnnotationDensity(existing?.annotationDensity) || 'medium',
      temperature: personality.temperature,
      soul: personality.soul,
      createdAt: existing?.createdAt || now,
      updatedAt: existing?.updatedAt || now,
    };
    if (existing && agentRowMatches(existing, agent)) continue;
    upsertAgent(database, agent);
    changed = true;
  }

  return changed ? database.select().from(schema.agents).all() : agentRows;
}

function agentRowMatches(row: typeof schema.agents.$inferSelect, agent: Agent) {
  return (
    row.id === agent.id &&
    row.kind === agent.kind &&
    row.presetId === (agent.presetId || null) &&
    Boolean(row.enabled) === agent.enabled &&
    row.providerId === agent.providerId &&
    row.nickname === agent.nickname &&
    row.username === agent.username &&
    row.avatar === agent.avatar &&
    row.annotationColor === agent.annotationColor &&
    row.annotationDensity === agent.annotationDensity &&
    row.temperature === agent.temperature &&
    row.soul === agent.soul
  );
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
  const articleRows = measureStoreRead(profile, 'read_article_summaries', () =>
    database
      .select(articleSummaryColumns)
      .from(schema.articles)
      .orderBy(desc(schema.articles.updatedAt))
      .all(),
  );
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

function readArticleSummaryCounts(database: StoreDatabase, profile?: StoreReadProfileEntry[]) {
  const annotationCounts = measureStoreRead(profile, 'count_annotations_by_article', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        count: count(),
      })
      .from(schema.annotations)
      .groupBy(schema.annotations.articleId)
      .all(),
  );
  const commentCounts = measureStoreRead(profile, 'count_comments_by_article', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        count: count(),
      })
      .from(schema.comments)
      .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
      .where(isNull(schema.comments.replyTo))
      .groupBy(schema.annotations.articleId)
      .all(),
  );
  const countsByArticle = new Map<string, ArticleSummaryCounts>();

  for (const row of annotationCounts) {
    countsByArticle.set(row.articleId, {
      annotationCount: Number(row.count),
      commentCount: 0,
    });
  }

  for (const row of commentCounts) {
    const counts = countsByArticle.get(row.articleId);
    if (counts) counts.commentCount = Number(row.count);
    else
      countsByArticle.set(row.articleId, { annotationCount: 0, commentCount: Number(row.count) });
  }

  return countsByArticle;
}

function readArticleAnnotations(database: StoreDatabase, articleId: string) {
  const annotationRows = database
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.articleId, articleId))
    .all();
  const annotationIds = annotationRows.map((row) => row.id);
  const commentRows =
    annotationIds.length > 0
      ? database
          .select()
          .from(schema.comments)
          .where(inArray(schema.comments.annotationId, annotationIds))
          .all()
      : [];
  return sortByCreatedAt(
    groupAnnotationsByArticle(annotationRows, commentRows).get(articleId) || [],
  );
}

function groupAnnotationsByArticle(
  annotationRows: Array<typeof schema.annotations.$inferSelect>,
  commentRows: Array<typeof schema.comments.$inferSelect>,
) {
  const commentsByAnnotation = new Map<string, Comment[]>();
  for (const row of commentRows) {
    const list = commentsByAnnotation.get(row.annotationId) || [];
    list.push(rowToComment(row));
    commentsByAnnotation.set(row.annotationId, list);
  }

  const annotationsByArticle = new Map<string, Annotation[]>();
  for (const row of annotationRows) {
    const list = annotationsByArticle.get(row.articleId) || [];
    list.push(rowToAnnotation(row, sortByCreatedAt(commentsByAnnotation.get(row.id) || [])));
    annotationsByArticle.set(row.articleId, list);
  }
  return annotationsByArticle;
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

function writeArticleRows(database: StoreExecutor, article: ArticleRecord) {
  database
    .insert(schema.articles)
    .values({
      id: article.id,
      url: article.url,
      canonicalUrl: article.canonicalUrl,
      sourceType: normalizeArticleSourceType(article.sourceType),
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      siteName: article.siteName,
      siteIconUrl: article.siteIconUrl,
      leadImageUrl: article.leadImageUrl,
      themeColor: article.themeColor,
      contentHtml: article.contentHtml,
      contentHash: article.contentHash,
      ebookMetadata: article.ebook?.metadata,
      ebookChapters: article.ebook?.chapters,
      ebookIndex: article.ebook?.index,
      pdfMetadata: article.pdf?.metadata,
      readingProgress: normalizeArticleReadingProgress(article.readingProgress),
      focusCoReadingPlan: article.focusCoReadingPlan,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.articles.id,
      set: {
        url: article.url,
        canonicalUrl: article.canonicalUrl,
        sourceType: normalizeArticleSourceType(article.sourceType),
        title: article.title,
        byline: article.byline,
        excerpt: article.excerpt,
        siteName: article.siteName,
        siteIconUrl: article.siteIconUrl,
        leadImageUrl: article.leadImageUrl,
        themeColor: article.themeColor,
        contentHtml: article.contentHtml,
        contentHash: article.contentHash,
        ebookMetadata: article.ebook?.metadata,
        ebookChapters: article.ebook?.chapters,
        ebookIndex: article.ebook?.index,
        pdfMetadata: article.pdf?.metadata,
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
        focusCoReadingPlan: article.focusCoReadingPlan,
        updatedAt: article.updatedAt,
      },
    })
    .run();

  database.delete(schema.annotations).where(eq(schema.annotations.articleId, article.id)).run();
  const { annotationRows, commentRows } = buildArticleChildRows(article);
  for (let index = 0; index < annotationRows.length; index += INSERT_BATCH_SIZE) {
    database
      .insert(schema.annotations)
      .values(annotationRows.slice(index, index + INSERT_BATCH_SIZE))
      .run();
  }
  for (let index = 0; index < commentRows.length; index += INSERT_BATCH_SIZE) {
    database
      .insert(schema.comments)
      .values(commentRows.slice(index, index + INSERT_BATCH_SIZE))
      .run();
  }
}

function writeArticleRowsInTransaction(database: StoreDatabase, article: ArticleRecord) {
  database.transaction((tx) => {
    writeArticleRows(tx, article);
  });
}

export function buildArticleChildRows(article: Pick<ArticleRecord, 'id' | 'annotations'>) {
  const annotationRows = article.annotations.map((annotation) =>
    annotationToRow(article.id, annotation),
  );
  const commentRows = article.annotations.flatMap(commentRowsForAnnotation);
  return { annotationRows, commentRows };
}

function annotationToRow(articleId: string, annotation: Annotation) {
  return {
    id: annotation.id,
    articleId,
    anchor: annotation.anchor,
    author: annotation.author,
    annotationType: annotation.annotationType,
    readingIntent: annotation.readingIntent,
    moveType: annotation.moveType,
    whyHere: annotation.whyHere,
    evidenceUsed: annotation.evidenceUsed,
    confidence: annotation.confidence,
    shouldShow: annotation.shouldShow,
    color: annotation.color,
    agentId: annotation.agentId,
    agentUsername: annotation.agentUsername,
    agentNickname: annotation.agentNickname,
    agentAvatar: annotation.agentAvatar,
    agentAnnotationColor: annotation.agentAnnotationColor,
    userId: annotation.userId,
    userUsername: annotation.userUsername,
    userNickname: annotation.userNickname,
    userAvatar: annotation.userAvatar,
    userAnnotationColor: annotation.userAnnotationColor,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

function commentRowsForAnnotation(annotation: Annotation) {
  return annotation.comments.map((comment) => ({
    id: comment.id,
    annotationId: annotation.id,
    author: comment.author,
    content: comment.content,
    createdAt: comment.createdAt,
    replyTo: comment.replyTo,
    agentId: comment.agentId,
    agentUsername: comment.agentUsername,
    agentNickname: comment.agentNickname,
    agentAvatar: comment.agentAvatar,
    agentAnnotationColor: comment.agentAnnotationColor,
    readingIntent: comment.readingIntent,
    reviewLabel: comment.reviewLabel,
    userId: comment.userId,
    userUsername: comment.userUsername,
    userNickname: comment.userNickname,
    userAvatar: comment.userAvatar,
    userAnnotationColor: comment.userAnnotationColor,
    pending: comment.pending,
  }));
}

function upsertUser(database: StoreExecutor, user: UserProfile) {
  database
    .insert(schema.userProfiles)
    .values(userToRow(normalizeUser(user)))
    .onConflictDoUpdate({
      target: schema.userProfiles.id,
      set: userToRow(normalizeUser(user)),
    })
    .run();
}

function upsertSettings(database: StoreExecutor, settings: AppSettings) {
  const existing = database.select().from(schema.appSettings).limit(1).get();
  const merged = mergeSettingsForUpsert(settings, existing ? rowToSettings(existing) : undefined);
  const row = {
    id: 'default',
    defaultProviderId: merged.defaultProviderId || null,
    readingAssistantProviderId: merged.readingAssistantProviderId || null,
    reviewAssistantProviderId: merged.reviewAssistantProviderId || null,
    messageSendShortcut: normalizeMessageSendShortcut(merged.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(merged.selectionActionShortcuts),
    saveArticleImages: Boolean(merged.saveArticleImages),
    logRetentionDays: merged.logRetentionDays || null,
    onboardingCompletedAt: merged.onboardingCompletedAt || null,
    updatedAt: new Date().toISOString(),
  };
  database
    .insert(schema.appSettings)
    .values(row)
    .onConflictDoUpdate({
      target: schema.appSettings.id,
      set: row,
    })
    .run();
}

function upsertProvider(
  database: StoreExecutor,
  provider: LlmProvider,
  apiKeyRef?: string,
  apiKey = '',
) {
  database
    .insert(schema.providers)
    .values({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      presetId: provider.presetId,
      logo: provider.logo,
      baseUrl: provider.baseUrl,
      apiKey,
      apiKeyRef: apiKeyRef || null,
      modelName: provider.modelName,
      modelNames: provider.modelNames,
      modelInputMode: provider.modelInputMode,
      reasoningEffort: provider.reasoningEffort,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.providers.id,
      set: {
        name: provider.name,
        type: provider.type,
        presetId: provider.presetId,
        logo: provider.logo,
        baseUrl: provider.baseUrl,
        apiKey,
        apiKeyRef: apiKeyRef || null,
        modelName: provider.modelName,
        modelNames: provider.modelNames,
        modelInputMode: provider.modelInputMode,
        reasoningEffort: provider.reasoningEffort,
        updatedAt: provider.updatedAt,
      },
    })
    .run();
}

function upsertAgent(database: StoreExecutor, agent: Agent) {
  database
    .insert(schema.agents)
    .values({
      id: agent.id,
      kind: agent.kind,
      presetId: agent.presetId,
      enabled: agent.enabled,
      providerId: agent.providerId,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      temperature: agent.temperature,
      soul: agent.soul,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.agents.id,
      set: {
        providerId: agent.providerId,
        kind: agent.kind,
        presetId: agent.presetId,
        enabled: agent.enabled,
        nickname: agent.nickname,
        username: agent.username,
        avatar: agent.avatar,
        annotationColor: agent.annotationColor,
        annotationDensity: agent.annotationDensity,
        temperature: agent.temperature,
        soul: agent.soul,
        updatedAt: agent.updatedAt,
      },
    })
    .run();
}
