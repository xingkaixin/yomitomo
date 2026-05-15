import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import SQLiteDatabase from 'better-sqlite3';
import type {
  Agent,
  AgentAnnotationDensity,
  AnnotationEvidenceSource,
  AgentReadingIntent,
  AgentKind,
  Annotation,
  AnnotationType,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleSourceType,
  Comment,
  DesktopStore,
  EbookChapterRecord,
  EbookMetadata,
  EpubBookIndex,
  EpubChapterIndex,
  EpubParagraphIndex,
  EpubSegmentIndex,
  FocusCoReadingPlan,
  LlmProvider,
  ProviderPresetId,
  ProviderType,
  QuestionStatus,
  ReadingDeliberationRecord,
  ReadingDeliberationSection,
  ReadingCardRecord,
  ReadingCardReviewFinding,
  ReadingCardReviewRecord,
  ReadingCardReviewSeverity,
  ReadingCardReviewVerdict,
  ReadingCardReviewerResult,
  ReadingCardSection,
  TextAnchor,
  UserProfile,
  ReasoningEffort,
} from '@yomitomo/shared';
import {
  makeId,
  normalizeAnnotationConfidence,
  normalizeAnnotationEvidenceSource,
  normalizeAnnotationMove,
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

const DB_FILE_NAME = 'yomitomo.sqlite';

const defaultUser: UserProfile = {
  id: 'user_local',
  nickname: '我',
  username: 'me',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: new Date(0).toISOString(),
};

const defaultStore: DesktopStore = {
  user: defaultUser,
  settings: {},
  providers: [],
  agents: [],
  articles: [],
};

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
    readingNoteProviderId: input.readingNoteProviderId || undefined,
    messageSendShortcut: normalizeMessageSendShortcut(input.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(input.selectionActionShortcuts),
    saveArticleImages: Boolean(input.saveArticleImages),
    onboardingCompletedAt: input.onboardingCompletedAt || undefined,
  });
  return readStore();
}

type SaveProviderInput = Partial<LlmProvider> & {
  removeApiKey?: boolean;
};

export async function saveProvider(input: SaveProviderInput): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id
    ? store.providers.find((provider) => provider.id === input.id)
    : undefined;
  const preset =
    providerPresets.find((item) => item.id === input.presetId) ||
    (existing ? undefined : defaultProviderPreset);
  const modelInputMode =
    normalizeProviderModelInputMode(input.modelInputMode ?? existing?.modelInputMode) || 'list';
  const id = existing?.id || makeId('provider');
  const existingRow = input.id
    ? getDatabase().select().from(schema.providers).where(eq(schema.providers.id, input.id)).get()
    : undefined;
  const existingApiKeyRef = existingRow?.apiKeyRef || undefined;
  const legacyApiKey = existingRow?.apiKey.trim() || '';
  const inputApiKey = input.apiKey?.trim();
  const apiKeyRef = inputApiKey
    ? await saveProviderApiKey(id, inputApiKey)
    : input.removeApiKey
      ? existingApiKeyRef
        ? await removeProviderApiKey(id, existingApiKeyRef)
        : undefined
      : existingApiKeyRef
        ? existingApiKeyRef
        : undefined;
  const storedApiKey = inputApiKey || input.removeApiKey || apiKeyRef ? '' : legacyApiKey;
  const provider: LlmProvider = {
    id,
    name: input.name?.trim() || preset?.name || 'Untitled Provider',
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
      settings?.reviewAssistantProviderId === id ||
      settings?.readingNoteProviderId === id
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
        readingNoteProviderId:
          settings.readingNoteProviderId === id
            ? undefined
            : (settings.readingNoteProviderId ?? undefined),
        saveArticleImages: Boolean(settings.saveArticleImages),
      });
    }
    tx.delete(schema.providers).where(eq(schema.providers.id, id)).run();
  });
  return readStore();
}

export async function saveAgent(input: Partial<Agent>): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id ? store.agents.find((agent) => agent.id === input.id) : undefined;
  const username = normalizeAgentUsername(
    input.username || existing?.username || input.nickname || 'agent',
    'agent',
  );
  const agent: Agent = {
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
): Promise<DesktopStore> {
  getDatabase()
    .update(schema.articles)
    .set({
      readingProgress: normalizeArticleReadingProgress(progress),
      updatedAt: progress.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
  return readStore();
}

export async function deleteArticle(id: string): Promise<DesktopStore> {
  getDatabase().delete(schema.articles).where(eq(schema.articles.id, id)).run();
  return readStore();
}

export async function saveArticleReadingCard(
  articleId: string,
  readingCard: ReadingCardRecord,
): Promise<DesktopStore> {
  getDatabase()
    .update(schema.articles)
    .set({
      readingCardId: readingCard.id,
      readingCardMarkdown: readingCard.contentMarkdown,
      readingCardSections: readingCard.sections,
      readingCardProviderId: readingCard.providerId,
      readingCardProviderName: readingCard.providerName,
      readingCardModelName: readingCard.modelName,
      readingCardCreatedAt: readingCard.createdAt,
      readingCardUpdatedAt: readingCard.updatedAt,
      readingCardReviewId: null,
      readingCardReviewResults: null,
      readingCardReviewCreatedAt: null,
      readingCardReviewUpdatedAt: null,
      updatedAt: readingCard.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
  return readStore();
}

export async function saveArticleReadingDeliberation(
  articleId: string,
  deliberation: ReadingDeliberationRecord,
): Promise<DesktopStore> {
  getDatabase()
    .update(schema.articles)
    .set({
      readingDeliberationId: deliberation.id,
      readingDeliberationMarkdown: deliberation.contentMarkdown,
      readingDeliberationSections: deliberation.sections,
      readingDeliberationProviderId: deliberation.providerId,
      readingDeliberationProviderName: deliberation.providerName,
      readingDeliberationModelName: deliberation.modelName,
      readingDeliberationCreatedAt: deliberation.createdAt,
      readingDeliberationUpdatedAt: deliberation.updatedAt,
      updatedAt: deliberation.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
  return readStore();
}

export async function saveArticleReadingCardReview(
  articleId: string,
  review: ReadingCardReviewRecord,
): Promise<DesktopStore> {
  getDatabase()
    .update(schema.articles)
    .set({
      readingCardReviewId: review.id,
      readingCardReviewResults: review.reviewerResults,
      readingCardReviewCreatedAt: review.createdAt,
      readingCardReviewUpdatedAt: review.updatedAt,
      updatedAt: review.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
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
    list.push({
      id: row.id,
      author: row.author as Comment['author'],
      content: row.content,
      createdAt: row.createdAt,
      replyTo: row.replyTo || undefined,
      agentId: row.agentId || undefined,
      agentUsername: row.agentUsername || undefined,
      agentNickname: row.agentNickname || undefined,
      agentAvatar: row.agentAvatar || undefined,
      agentAnnotationColor: row.agentAnnotationColor || undefined,
      readingIntent: normalizeAgentReadingIntent(row.readingIntent) || undefined,
      questionStatus: normalizeQuestionStatus(row.questionStatus) || undefined,
      userId: row.userId || undefined,
      userUsername: row.userUsername || undefined,
      userNickname: row.userNickname || undefined,
      userAvatar: row.userAvatar || undefined,
      userAnnotationColor: row.userAnnotationColor || undefined,
      pending: row.pending || undefined,
    });
    commentsByAnnotation.set(row.annotationId, list);
  }

  const annotationsByArticle = new Map<string, Annotation[]>();
  for (const row of annotationRows) {
    const list = annotationsByArticle.get(row.articleId) || [];
    list.push({
      id: row.id,
      anchor: row.anchor as TextAnchor,
      author: row.author as Annotation['author'],
      annotationType: normalizeAnnotationType(row.annotationType) || undefined,
      readingIntent: normalizeAgentReadingIntent(row.readingIntent) || undefined,
      questionStatus: normalizeQuestionStatus(row.questionStatus) || undefined,
      moveType: normalizeAnnotationMove(row.moveType) || undefined,
      whyHere: row.whyHere || undefined,
      evidenceUsed: normalizeAnnotationEvidenceUsed(row.evidenceUsed),
      confidence: normalizeAnnotationConfidence(row.confidence) || undefined,
      shouldShow: row.shouldShow ?? undefined,
      color: row.color,
      agentId: row.agentId || undefined,
      agentUsername: row.agentUsername || undefined,
      agentNickname: row.agentNickname || undefined,
      agentAvatar: row.agentAvatar || undefined,
      agentAnnotationColor: row.agentAnnotationColor || undefined,
      userId: row.userId || undefined,
      userUsername: row.userUsername || undefined,
      userNickname: row.userNickname || undefined,
      userAvatar: row.userAvatar || undefined,
      userAnnotationColor: row.userAnnotationColor || undefined,
      comments: sortByCreatedAt(commentsByAnnotation.get(row.id) || []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    annotationsByArticle.set(row.articleId, list);
  }

  return {
    user: normalizeUser(rowToUser(user)),
    settings: rowToSettings(settings),
    providers: providerRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: normalizeProviderType(row.type) || 'openai-chat',
      presetId: normalizePresetId(row.presetId || undefined),
      logo: row.logo || undefined,
      baseUrl: row.baseUrl,
      apiKey: '',
      hasApiKey: Boolean(row.apiKeyRef || row.apiKey),
      modelName: row.modelName,
      modelNames: normalizeModelNames(row.modelNames) || undefined,
      modelInputMode: normalizeProviderModelInputMode(row.modelInputMode) || 'list',
      reasoningEffort: normalizeReasoningEffort(row.reasoningEffort || undefined) || 'none',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    agents: agentRows.map((row) => ({
      id: row.id,
      kind: normalizeAgentKind(row.kind) || 'annotation',
      presetId: row.presetId || undefined,
      enabled: Boolean(row.enabled),
      providerId: row.providerId,
      nickname: row.nickname,
      username: row.username,
      avatar: row.avatar,
      annotationColor: row.annotationColor || '#8ab6d6',
      annotationDensity: normalizeAnnotationDensity(row.annotationDensity) || 'medium',
      temperature: normalizeTemperature(row.temperature),
      soul: row.soul,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    articles: articleRows
      .map((row) => ({
        id: row.id,
        url: row.url,
        canonicalUrl: row.canonicalUrl,
        sourceType: normalizeArticleSourceType(row.sourceType),
        title: row.title,
        byline: row.byline || undefined,
        excerpt: row.excerpt || undefined,
        siteName: row.siteName || undefined,
        siteIconUrl: row.siteIconUrl || undefined,
        leadImageUrl: row.leadImageUrl || undefined,
        themeColor: row.themeColor || undefined,
        contentHtml: row.contentHtml || undefined,
        contentHash: row.contentHash,
        ebook: rowToEbook(row),
        readingProgress: normalizeArticleReadingProgress(row.readingProgress),
        focusCoReadingPlan: row.focusCoReadingPlan
          ? (row.focusCoReadingPlan as FocusCoReadingPlan)
          : undefined,
        readingDeliberation: rowToReadingDeliberation(row),
        readingCard: rowToReadingCard(row),
        annotations: sortByCreatedAt(annotationsByArticle.get(row.id) || []),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))
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
      readingDeliberationId: article.readingDeliberation?.id,
      readingDeliberationMarkdown: article.readingDeliberation?.contentMarkdown,
      readingDeliberationSections: article.readingDeliberation?.sections,
      readingDeliberationProviderId: article.readingDeliberation?.providerId,
      readingDeliberationProviderName: article.readingDeliberation?.providerName,
      readingDeliberationModelName: article.readingDeliberation?.modelName,
      readingDeliberationCreatedAt: article.readingDeliberation?.createdAt,
      readingDeliberationUpdatedAt: article.readingDeliberation?.updatedAt,
      readingCardId: article.readingCard?.id,
      readingCardMarkdown: article.readingCard?.contentMarkdown,
      readingCardSections: article.readingCard?.sections,
      readingCardProviderId: article.readingCard?.providerId,
      readingCardProviderName: article.readingCard?.providerName,
      readingCardModelName: article.readingCard?.modelName,
      readingCardCreatedAt: article.readingCard?.createdAt,
      readingCardUpdatedAt: article.readingCard?.updatedAt,
      readingCardReviewId: article.readingCard?.review?.id,
      readingCardReviewResults: article.readingCard?.review?.reviewerResults,
      readingCardReviewCreatedAt: article.readingCard?.review?.createdAt,
      readingCardReviewUpdatedAt: article.readingCard?.review?.updatedAt,
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
      questionStatus: annotation.questionStatus,
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
        questionStatus: comment.questionStatus,
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
    readingNoteProviderId: merged.readingNoteProviderId || null,
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

export function mergeSettingsForUpsert(settings: AppSettings, existing?: AppSettings): AppSettings {
  return {
    defaultProviderId: settingsFieldProvided(settings, 'defaultProviderId')
      ? settings.defaultProviderId || undefined
      : existing?.defaultProviderId || undefined,
    readingAssistantProviderId: settingsFieldProvided(settings, 'readingAssistantProviderId')
      ? settings.readingAssistantProviderId || undefined
      : existing?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settingsFieldProvided(settings, 'reviewAssistantProviderId')
      ? settings.reviewAssistantProviderId || undefined
      : existing?.reviewAssistantProviderId || undefined,
    readingNoteProviderId: settingsFieldProvided(settings, 'readingNoteProviderId')
      ? settings.readingNoteProviderId || undefined
      : existing?.readingNoteProviderId || undefined,
    messageSendShortcut: settingsFieldProvided(settings, 'messageSendShortcut')
      ? normalizeMessageSendShortcut(settings.messageSendShortcut)
      : normalizeMessageSendShortcut(existing?.messageSendShortcut),
    selectionActionShortcuts: settingsFieldProvided(settings, 'selectionActionShortcuts')
      ? normalizeSelectionActionShortcuts(settings.selectionActionShortcuts)
      : normalizeSelectionActionShortcuts(existing?.selectionActionShortcuts),
    saveArticleImages: settingsFieldProvided(settings, 'saveArticleImages')
      ? Boolean(settings.saveArticleImages)
      : Boolean(existing?.saveArticleImages),
    onboardingCompletedAt: settingsFieldProvided(settings, 'onboardingCompletedAt')
      ? settings.onboardingCompletedAt || undefined
      : existing?.onboardingCompletedAt || undefined,
  };
}

function settingsFieldProvided(settings: AppSettings, field: keyof AppSettings) {
  return Object.prototype.hasOwnProperty.call(settings, field);
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

function normalizeStore(store: DesktopStore): DesktopStore {
  return {
    user: normalizeUser(store.user),
    settings: normalizeSettings(store.settings),
    providers: (store.providers || []).map((provider) =>
      Object.assign({}, provider, {
        type: normalizeProviderType(provider.type) || 'openai-chat',
        presetId: normalizePresetId(provider.presetId),
        modelNames:
          provider.modelInputMode === 'custom'
            ? undefined
            : normalizeModelNames(provider.modelNames),
        modelInputMode: normalizeProviderModelInputMode(provider.modelInputMode) || 'list',
        reasoningEffort: normalizeReasoningEffort(provider.reasoningEffort) || 'none',
      }),
    ),
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
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
      }),
    ),
  };
}

function rowToSettings(row: typeof schema.appSettings.$inferSelect | undefined): AppSettings {
  return {
    defaultProviderId: row?.defaultProviderId || undefined,
    readingAssistantProviderId: row?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: row?.reviewAssistantProviderId || undefined,
    readingNoteProviderId: row?.readingNoteProviderId || undefined,
    messageSendShortcut: normalizeMessageSendShortcut(row?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(row?.selectionActionShortcuts),
    saveArticleImages: Boolean(row?.saveArticleImages),
    onboardingCompletedAt: row?.onboardingCompletedAt || undefined,
  };
}

function normalizeSettings(settings: AppSettings | undefined): AppSettings {
  return {
    defaultProviderId: settings?.defaultProviderId || undefined,
    readingAssistantProviderId: settings?.readingAssistantProviderId || undefined,
    reviewAssistantProviderId: settings?.reviewAssistantProviderId || undefined,
    readingNoteProviderId: settings?.readingNoteProviderId || undefined,
    messageSendShortcut: normalizeMessageSendShortcut(settings?.messageSendShortcut),
    selectionActionShortcuts: normalizeSelectionActionShortcuts(settings?.selectionActionShortcuts),
    saveArticleImages: Boolean(settings?.saveArticleImages),
    onboardingCompletedAt: settings?.onboardingCompletedAt || undefined,
  };
}

function rowToEbook(row: typeof schema.articles.$inferSelect): ArticleRecord['ebook'] {
  const sourceType = normalizeArticleSourceType(row.sourceType);
  if (sourceType !== 'ebook') return undefined;

  const metadata = normalizeEbookMetadata(row.ebookMetadata);
  const chapters = normalizeEbookChapters(row.ebookChapters);
  const index = normalizeEpubBookIndex(row.ebookIndex);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

function normalizeArticleSourceType(value: unknown): ArticleSourceType {
  return value === 'ebook' ? 'ebook' : 'web';
}

function normalizeArticleReadingProgress(value: unknown): ArticleReadingProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const progress = value as Record<string, unknown>;
  const pageIndex = Number(progress.pageIndex);
  const pageCount = Number(progress.pageCount);
  const chapterIndex = Number(progress.chapterIndex);
  const chapterProgress = Number(progress.chapterProgress);
  const progressValue = Number(progress.progress);
  return {
    pageIndex: Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1,
    chapterIndex: Number.isInteger(chapterIndex) && chapterIndex >= 0 ? chapterIndex : undefined,
    chapterProgress: Number.isFinite(chapterProgress)
      ? Math.max(0, Math.min(1, chapterProgress))
      : undefined,
    progress: Number.isFinite(progressValue) ? Math.max(0, Math.min(1, progressValue)) : 0,
    updatedAt: stringValue(progress.updatedAt) || new Date().toISOString(),
  };
}

function normalizeEbookRecord(value: ArticleRecord['ebook'] | undefined): ArticleRecord['ebook'] {
  const metadata = normalizeEbookMetadata(value?.metadata);
  const chapters = normalizeEbookChapters(value?.chapters);
  const index = normalizeEpubBookIndex(value?.index);
  return metadata && chapters.length > 0 ? { metadata, chapters, index } : undefined;
}

function normalizeEbookMetadata(value: unknown): EbookMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = value as Record<string, unknown>;
  const fileName = stringValue(metadata.fileName);
  const fileSize = Number(metadata.fileSize);
  return {
    format: metadata.format === 'epub' ? 'epub' : 'epub',
    fileName,
    fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0,
    language: stringValue(metadata.language) || undefined,
    publisher: stringValue(metadata.publisher) || undefined,
    description: stringValue(metadata.description) || undefined,
  };
}

function normalizeEbookChapters(value: unknown): EbookChapterRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const chapter = item as Record<string, unknown>;
    const html = stringValue(chapter.html);
    const title = stringValue(chapter.title);
    if (!html || !title) return [];
    const textLength = Number(chapter.textLength);
    return [
      {
        id: stringValue(chapter.id) || `chapter-${index + 1}`,
        title,
        href: stringValue(chapter.href) || undefined,
        html,
        textLength: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
      },
    ];
  });
}

function normalizeEpubBookIndex(value: unknown): EpubBookIndex | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const index = value as Record<string, unknown>;
  const chapters = normalizeEpubChapterIndexes(index.chapters);
  const segments = normalizeEpubSegmentIndexes(index.segments);
  const paragraphs = normalizeEpubParagraphIndexes(index.paragraphs);
  const textLength = Number(index.textLength);
  if (chapters.length === 0 || segments.length === 0 || paragraphs.length === 0) return undefined;
  return {
    version: 1,
    articleId: stringValue(index.articleId),
    textLength: Number.isFinite(textLength) && textLength >= 0 ? textLength : 0,
    chapters,
    segments,
    paragraphs,
  };
}

function normalizeEpubChapterIndexes(value: unknown): EpubChapterIndex[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const chapter = item as Record<string, unknown>;
    const id = stringValue(chapter.id);
    if (!id) return [];
    return [
      {
        id,
        title: stringValue(chapter.title),
        href: stringValue(chapter.href) || undefined,
        indexInBook: normalizeNonNegativeInteger(chapter.indexInBook),
        textStart: normalizeNonNegativeInteger(chapter.textStart),
        textEnd: normalizeNonNegativeInteger(chapter.textEnd),
        textLength: normalizeNonNegativeInteger(chapter.textLength),
        previewStart: stringValue(chapter.previewStart),
        previewEnd: stringValue(chapter.previewEnd),
        segmentIds: stringArray(chapter.segmentIds),
        paragraphIds: stringArray(chapter.paragraphIds),
      },
    ];
  });
}

function normalizeEpubSegmentIndexes(value: unknown): EpubSegmentIndex[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const segment = item as Record<string, unknown>;
    const id = stringValue(segment.id);
    const chapterId = stringValue(segment.chapterId);
    if (!id || !chapterId) return [];
    return [
      {
        id,
        chapterId,
        indexInChapter: normalizeNonNegativeInteger(segment.indexInChapter),
        textStart: normalizeNonNegativeInteger(segment.textStart),
        textEnd: normalizeNonNegativeInteger(segment.textEnd),
        textLength: normalizeNonNegativeInteger(segment.textLength),
        previewStart: stringValue(segment.previewStart),
        previewEnd: stringValue(segment.previewEnd),
        paragraphIds: stringArray(segment.paragraphIds),
      },
    ];
  });
}

function normalizeEpubParagraphIndexes(value: unknown): EpubParagraphIndex[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const paragraph = item as Record<string, unknown>;
    const id = stringValue(paragraph.id);
    const chapterId = stringValue(paragraph.chapterId);
    const segmentId = stringValue(paragraph.segmentId);
    if (!id || !chapterId || !segmentId) return [];
    return [
      {
        id,
        chapterId,
        segmentId,
        indexInChapter: normalizeNonNegativeInteger(paragraph.indexInChapter),
        indexInSegment: normalizeNonNegativeInteger(paragraph.indexInSegment),
        textStart: normalizeNonNegativeInteger(paragraph.textStart),
        textEnd: normalizeNonNegativeInteger(paragraph.textEnd),
        textLength: normalizeNonNegativeInteger(paragraph.textLength),
        previewStart: stringValue(paragraph.previewStart),
        previewEnd: stringValue(paragraph.previewEnd),
      },
    ];
  });
}

function rowToReadingCard(row: typeof schema.articles.$inferSelect): ReadingCardRecord | undefined {
  if (!row.readingCardMarkdown || !row.readingCardId) return undefined;
  return {
    id: row.readingCardId,
    articleId: row.id,
    title: row.title,
    contentMarkdown: row.readingCardMarkdown,
    sections: normalizeReadingCardSections(row.readingCardSections),
    review: rowToReadingCardReview(row),
    providerId: row.readingCardProviderId || '',
    providerName: row.readingCardProviderName || '',
    modelName: row.readingCardModelName || '',
    createdAt: row.readingCardCreatedAt || row.updatedAt,
    updatedAt: row.readingCardUpdatedAt || row.updatedAt,
  };
}

function rowToReadingDeliberation(
  row: typeof schema.articles.$inferSelect,
): ReadingDeliberationRecord | undefined {
  if (!row.readingDeliberationMarkdown || !row.readingDeliberationId) return undefined;
  return {
    id: row.readingDeliberationId,
    articleId: row.id,
    title: row.title,
    contentMarkdown: row.readingDeliberationMarkdown,
    sections: normalizeReadingDeliberationSections(row.readingDeliberationSections),
    providerId: row.readingDeliberationProviderId || '',
    providerName: row.readingDeliberationProviderName || '',
    modelName: row.readingDeliberationModelName || '',
    createdAt: row.readingDeliberationCreatedAt || row.updatedAt,
    updatedAt: row.readingDeliberationUpdatedAt || row.updatedAt,
  };
}

function rowToReadingCardReview(
  row: typeof schema.articles.$inferSelect,
): ReadingCardReviewRecord | undefined {
  if (!row.readingCardReviewId || !row.readingCardId) return undefined;
  return {
    id: row.readingCardReviewId,
    articleId: row.id,
    readingCardId: row.readingCardId,
    reviewerResults: normalizeReadingCardReviewerResults(row.readingCardReviewResults),
    createdAt: row.readingCardReviewCreatedAt || row.updatedAt,
    updatedAt: row.readingCardReviewUpdatedAt || row.updatedAt,
  };
}

function normalizeReadingCardSections(value: unknown): ReadingCardSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const section = item as { title?: unknown; content?: unknown };
    return typeof section.title === 'string' && typeof section.content === 'string'
      ? [{ title: section.title, content: section.content }]
      : [];
  });
}

function normalizeReadingDeliberationSections(value: unknown): ReadingDeliberationSection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const section = item as { title?: unknown; content?: unknown };
    return typeof section.title === 'string' && typeof section.content === 'string'
      ? [{ title: section.title, content: section.content }]
      : [];
  });
}

function normalizeReadingCardReviewerResults(value: unknown): ReadingCardReviewerResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const result = item as Record<string, unknown>;
    const id = stringValue(result.id);
    const reviewerId = stringValue(result.reviewerId);
    if (!id || !reviewerId) return [];
    return [
      {
        id,
        reviewerId,
        reviewerNickname: stringValue(result.reviewerNickname),
        reviewerUsername: stringValue(result.reviewerUsername),
        reviewerAvatar: stringValue(result.reviewerAvatar),
        reviewerColor: stringValue(result.reviewerColor),
        status: result.status === 'error' ? 'error' : 'done',
        verdict: normalizeReviewVerdict(result.verdict),
        summary: stringValue(result.summary),
        findings: normalizeReviewFindings(result.findings),
        acceptedClaims: stringArray(result.acceptedClaims),
        missingAngles: stringArray(result.missingAngles),
        rawResponse: stringValue(result.rawResponse) || undefined,
        createdAt: stringValue(result.createdAt) || new Date(0).toISOString(),
      },
    ];
  });
}

function normalizeReviewFindings(value: unknown): ReadingCardReviewFinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const finding = item as Record<string, unknown>;
    const problem = stringValue(finding.problem);
    if (!problem) return [];
    return [
      {
        section: stringValue(finding.section),
        severity: normalizeReviewSeverity(finding.severity),
        problem,
        evidenceIds: numberArray(finding.evidenceIds),
        suggestedRewrite: stringValue(finding.suggestedRewrite) || undefined,
      },
    ];
  });
}

function normalizeReviewVerdict(value: unknown): ReadingCardReviewVerdict {
  return value === 'pass' ? 'pass' : 'revise';
}

function normalizeReviewSeverity(value: unknown): ReadingCardReviewSeverity {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0)
    : [];
}

function normalizeNonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeUser(user: Partial<UserProfile> | undefined): UserProfile {
  return {
    ...defaultUser,
    ...user,
    id: user?.id || defaultUser.id,
    annotationColor: user?.annotationColor || defaultUser.annotationColor,
  };
}

function rowToUser(row: typeof schema.userProfiles.$inferSelect | undefined): UserProfile {
  if (!row) return defaultUser;
  return {
    id: row.id,
    nickname: row.nickname,
    username: row.username,
    avatar: row.avatar,
    annotationColor: row.annotationColor,
    updatedAt: row.updatedAt,
  };
}

function userToRow(user: UserProfile): typeof schema.userProfiles.$inferInsert {
  return {
    id: user.id,
    nickname: user.nickname,
    username: user.username,
    avatar: user.avatar,
    annotationColor: user.annotationColor,
    updatedAt: user.updatedAt,
  };
}

function sortByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].toSorted(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}

function normalizeUsername(value: string, fallback = 'me') {
  return (
    value
      .trim()
      .replace(/^@/, '')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 32) || fallback
  );
}

function normalizeAgentUsername(value: string, fallback = 'agent') {
  return value.trim().replace(/^@/, '').replace(/\s+/g, '').slice(0, 32) || fallback;
}

function normalizeAnnotationDensity(value: unknown): AgentAnnotationDensity | null {
  return value === 'low' || value === 'medium' || value === 'high' ? value : null;
}

function normalizeAgentKind(value: unknown): AgentKind | null {
  return value === 'annotation' || value === 'review' ? value : null;
}

function normalizeProviderType(value: unknown): ProviderType | null {
  if (value === 'openai') return 'openai-chat';
  return value === 'openai-chat' ||
    value === 'openai-responses' ||
    value === 'anthropic' ||
    value === 'gemini'
    ? value
    : null;
}

function normalizeProviderModelInputMode(value: unknown) {
  return value === 'custom' || value === 'list' ? value : null;
}

function normalizePresetId(value: unknown): ProviderPresetId | undefined {
  return providerPresets.some((preset) => preset.id === value)
    ? (value as ProviderPresetId)
    : undefined;
}

function normalizeModelNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = Array.from(
    new Set(
      value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()),
    ),
  ).filter(Boolean);
  return names.length > 0 ? names : undefined;
}

function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  return value === 'default' ||
    value === 'none' ||
    value === 'minimal' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'auto'
    ? value
    : undefined;
}

function normalizeTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.5;
  return Math.min(1, Math.max(0, temperature));
}

function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === 'key_point' ||
    value === 'assumption' ||
    value === 'concept' ||
    value === 'question' ||
    value === 'quote'
    ? value
    : null;
}

function normalizeAnnotationEvidenceUsed(value: unknown): AnnotationEvidenceSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value
    .map((item) => normalizeAnnotationEvidenceSource(item))
    .filter((item): item is AnnotationEvidenceSource => Boolean(item));
  return sources.length > 0 ? Array.from(new Set(sources)) : undefined;
}

function normalizeAgentReadingIntent(value: unknown): AgentReadingIntent | null {
  return value === 'explain' ||
    value === 'decompose' ||
    value === 'challenge' ||
    value === 'question' ||
    value === 'connect'
    ? value
    : null;
}

function normalizeQuestionStatus(value: unknown): QuestionStatus | null {
  return value === 'open' || value === 'answered' || value === 'parked' ? value : null;
}
