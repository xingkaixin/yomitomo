import { performance } from 'node:perf_hooks';
import { count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
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
  UserProfile,
} from '@yomitomo/shared';
import {
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
} from '@yomitomo/shared';
import { buildAgentRecord, ensurePresetAgents, upsertAgent } from './agent-repository';
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
  purgeSqliteFiles,
  type StoreDatabase,
  type StoreExecutor,
  type StoreReadProfileEntry,
} from './store-db';
import {
  defaultStore,
  defaultUser,
  mergeSettingsForUpsert,
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeStore,
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

const INSERT_BATCH_SIZE = 32;

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
let providerSecretsMigrated = false;
type ArticleIdentity = Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>;

configureStoreDatabaseSeeder(seedDefaultStore);

export function closeDatabase() {
  closeStoreDatabase();
  providerSecretsMigrated = false;
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
        saveArticleImages: Boolean(settings.saveArticleImages),
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
