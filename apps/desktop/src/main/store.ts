import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import SQLiteDatabase from 'better-sqlite3';
import type {
  Agent,
  Annotation,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  Comment,
  DesktopStore,
  LlmProvider,
  UserProfile,
} from '@yomitomo/shared';
import {
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  providerPresets,
} from '@yomitomo/shared';
import { agentPersonalities } from '@yomitomo/shared';
import { presetAgentAvatars } from './agent-avatars';
import { migrations } from './db/migrations';
import * as schema from './db/schema';
import {
  deleteProviderApiKey,
  providerApiKeyRef,
  readProviderApiKey,
  saveProviderApiKey,
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
  normalizeReasoningEffort,
  normalizeStore,
  normalizeTemperature,
  normalizeUser,
  normalizeUsername,
  rowToAgent,
  rowToAnnotation,
  rowToArticle,
  rowToComment,
  rowToProvider,
  rowToSettings,
  rowToUser,
  sortByCreatedAt,
  userToRow,
} from './store-normalizers';

export { mergeSettingsForUpsert } from './store-normalizers';

const DB_FILE_NAME = 'yomitomo.sqlite';

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

let sqlite: SQLiteDatabase.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;
let providerSecretsMigrated = false;
type StoreDatabase = BetterSQLite3Database<typeof schema>;
type StoreTransaction = Parameters<StoreDatabase['transaction']>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type StoreExecutor = StoreDatabase | StoreTransaction;

function databasePath() {
  return join(app.getPath('userData'), DB_FILE_NAME);
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

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO __yomitomo_migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
    })();
  }
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

  writeStoreRows(database, defaultStore);
}

export async function readStore(): Promise<DesktopStore> {
  const database = getDatabase();
  await migrateProviderApiKeys(database);
  return readStoreRows(database);
}

export async function writeStore(store: DesktopStore): Promise<DesktopStore> {
  const normalized = normalizeStore(store);
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
  upsertSettings(getDatabase(), {
    defaultProviderId: input.defaultProviderId || undefined,
    readingAssistantProviderId: input.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: input.reviewAssistantProviderId || undefined,
    messageSendShortcut: normalizeMessageSendShortcut(input.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(input.selectionActionShortcuts),
    saveArticleImages: Boolean(input.saveArticleImages),
    onboardingCompletedAt: input.onboardingCompletedAt || undefined,
  });
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
    type: normalizeProviderType(input.type || existing?.type || preset?.type) || 'openai-chat',
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
    reasoningEffort:
      normalizeReasoningEffort(input.reasoningEffort || existing?.reasoningEffort) || 'none',
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

export async function saveArticle(input: ArticleRecord): Promise<DesktopStore> {
  writeArticleRowsInTransaction(getDatabase(), input);
  return readStore();
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

export async function deleteArticle(id: string): Promise<DesktopStore> {
  getDatabase().delete(schema.articles).where(eq(schema.articles.id, id)).run();
  return readStore();
}

function ensurePresetAgents(
  database: StoreDatabase,
  providerRows: Array<typeof schema.providers.$inferSelect>,
  settings: typeof schema.appSettings.$inferSelect | undefined,
) {
  if (providerRows.length === 0) return;

  const defaultProviderId =
    settings?.readingAssistantProviderId &&
    providerRows.some((provider) => provider.id === settings.readingAssistantProviderId)
      ? settings.readingAssistantProviderId
      : settings?.defaultProviderId &&
          providerRows.some((provider) => provider.id === settings.defaultProviderId)
        ? settings.defaultProviderId
        : providerRows[0]!.id;
  const agentRows = database.select().from(schema.agents).all();
  const rowsByPreset = new Map(
    agentRows.flatMap((row) => (row.presetId ? [[row.presetId, row] as const] : [])),
  );
  const now = new Date().toISOString();

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
    upsertAgent(database, agent);
  }
}

function readStoreRows(database: StoreDatabase): DesktopStore {
  const user = database.select().from(schema.userProfiles).limit(1).get();
  const settings = database.select().from(schema.appSettings).limit(1).get();
  const providerRows = database.select().from(schema.providers).all();
  ensurePresetAgents(database, providerRows, settings);
  const agentRows = database.select().from(schema.agents).all();
  const articleRows = database.select().from(schema.articles).all();
  const annotationRows = database.select().from(schema.annotations).all();
  const commentRows = database.select().from(schema.comments).all();

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

  return {
    user: normalizeUser(rowToUser(user)),
    settings: rowToSettings(settings),
    providers: providerRows.map(rowToProvider),
    agents: agentRows.map(rowToAgent),
    articles: articleRows
      .map((row) => rowToArticle(row, sortByCreatedAt(annotationsByArticle.get(row.id) || [])))
      .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
  };
}

function writeStoreRows(database: StoreDatabase, store: DesktopStore) {
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
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
        focusCoReadingPlan: article.focusCoReadingPlan,
        updatedAt: article.updatedAt,
      },
    })
    .run();

  database.delete(schema.annotations).where(eq(schema.annotations.articleId, article.id)).run();
  for (const annotation of article.annotations) {
    writeAnnotationRows(database, article.id, annotation);
  }
}

function writeArticleRowsInTransaction(database: StoreDatabase, article: ArticleRecord) {
  database.transaction((tx) => {
    writeArticleRows(tx, article);
  });
}

function writeAnnotationRows(database: StoreExecutor, articleId: string, annotation: Annotation) {
  database
    .insert(schema.annotations)
    .values({
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
    })
    .run();

  for (const comment of annotation.comments) {
    database
      .insert(schema.comments)
      .values({
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
        userId: comment.userId,
        userUsername: comment.userUsername,
        userNickname: comment.userNickname,
        userAvatar: comment.userAvatar,
        userAnnotationColor: comment.userAnnotationColor,
        pending: comment.pending,
      })
      .run();
  }
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
