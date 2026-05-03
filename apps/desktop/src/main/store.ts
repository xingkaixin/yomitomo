import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import SQLiteDatabase from "better-sqlite3";
import type {
  Agent,
  AgentAnnotationDensity,
  Annotation,
  AnnotationType,
  ArticleRecord,
  Comment,
  DesktopStore,
  LlmProvider,
  TextAnchor,
  UserProfile,
} from "@yomitomo/shared";
import { makeId } from "@yomitomo/shared";
import { migrations } from "./db/migrations";
import * as schema from "./db/schema";

const DB_FILE_NAME = "yomitomo.sqlite";

const defaultUser: UserProfile = {
  id: "user_local",
  nickname: "我",
  username: "me",
  avatar: "",
  annotationColor: "#f4c95d",
  updatedAt: new Date(0).toISOString(),
};

const defaultStore: DesktopStore = {
  user: defaultUser,
  providers: [],
  agents: [],
  articles: [],
};

let sqlite: SQLiteDatabase.Database | null = null;
let db: BetterSQLite3Database<typeof schema> | null = null;
type StoreDatabase = BetterSQLite3Database<typeof schema>;
type StoreTransaction = Parameters<StoreDatabase["transaction"]>[0] extends (tx: infer T) => unknown
  ? T
  : never;
type StoreExecutor = StoreDatabase | StoreTransaction;

function databasePath() {
  return join(app.getPath("userData"), DB_FILE_NAME);
}

function getDatabase() {
  if (db) return db;

  const file = databasePath();
  mkdirSync(dirname(file), { recursive: true });

  sqlite = new SQLiteDatabase(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
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
      .prepare("SELECT id FROM __yomitomo_migrations")
      .all()
      .map((row) => String((row as { id: string }).id)),
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare("INSERT INTO __yomitomo_migrations (id, applied_at) VALUES (?, ?)")
        .run(migration.id, new Date().toISOString());
    })();
  }
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
  return readStoreRows(getDatabase());
}

export async function writeStore(store: DesktopStore): Promise<DesktopStore> {
  const normalized = normalizeStore(store);
  writeStoreRows(getDatabase(), normalized);
  return normalized;
}

export async function saveUser(input: Partial<UserProfile>): Promise<DesktopStore> {
  const store = await readStore();
  const user: UserProfile = {
    id: store.user.id || defaultUser.id,
    nickname: input.nickname?.trim() || store.user.nickname,
    username: normalizeUsername(input.username || store.user.username || "me"),
    avatar: input.avatar || store.user.avatar,
    annotationColor: input.annotationColor?.trim() || store.user.annotationColor,
    updatedAt: new Date().toISOString(),
  };

  upsertUser(getDatabase(), user);
  return readStore();
}

export async function saveProvider(input: Partial<LlmProvider>): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id
    ? store.providers.find((provider) => provider.id === input.id)
    : undefined;
  const provider: LlmProvider = {
    id: existing?.id || makeId("provider"),
    name: input.name?.trim() || "Untitled Provider",
    type: input.type || existing?.type || "anthropic",
    baseUrl: input.baseUrl?.trim() || existing?.baseUrl || "https://api.anthropic.com",
    apiKey: input.apiKey?.trim() || existing?.apiKey || "",
    modelName: input.modelName?.trim() || existing?.modelName || "claude-3-5-sonnet-latest",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  upsertProvider(getDatabase(), provider);
  return readStore();
}

export async function deleteProvider(id: string): Promise<DesktopStore> {
  getDatabase().delete(schema.providers).where(eq(schema.providers.id, id)).run();
  return readStore();
}

export async function saveAgent(input: Partial<Agent>): Promise<DesktopStore> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existing = input.id ? store.agents.find((agent) => agent.id === input.id) : undefined;
  const username = normalizeUsername(
    input.username || existing?.username || input.nickname || "agent",
    "agent",
  );
  const agent: Agent = {
    id: existing?.id || makeId("agent"),
    providerId: input.providerId || existing?.providerId || store.providers[0]?.id || "",
    nickname: input.nickname?.trim() || existing?.nickname || "Yomitomo",
    username,
    avatar: input.avatar?.trim() || existing?.avatar || "🤖",
    annotationColor: input.annotationColor?.trim() || existing?.annotationColor || "#8ab6d6",
    annotationDensity:
      normalizeAnnotationDensity(input.annotationDensity) ||
      normalizeAnnotationDensity(existing?.annotationDensity) ||
      "medium",
    temperature: normalizeTemperature(input.temperature ?? existing?.temperature),
    soul:
      input.soul?.trim() ||
      existing?.soul ||
      "你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。",
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

function readStoreRows(database: StoreDatabase): DesktopStore {
  const user = database.select().from(schema.userProfiles).limit(1).get();
  const providerRows = database.select().from(schema.providers).all();
  const agentRows = database.select().from(schema.agents).all();
  const articleRows = database.select().from(schema.articles).all();
  const annotationRows = database.select().from(schema.annotations).all();
  const commentRows = database.select().from(schema.comments).all();

  const commentsByAnnotation = new Map<string, Comment[]>();
  for (const row of commentRows) {
    const list = commentsByAnnotation.get(row.annotationId) || [];
    list.push({
      id: row.id,
      author: row.author as Comment["author"],
      content: row.content,
      createdAt: row.createdAt,
      replyTo: row.replyTo || undefined,
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
      author: row.author as Annotation["author"],
      annotationType: normalizeAnnotationType(row.annotationType) || undefined,
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
    providers: providerRows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as LlmProvider["type"],
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
      modelName: row.modelName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    agents: agentRows.map((row) => ({
      id: row.id,
      providerId: row.providerId,
      nickname: row.nickname,
      username: row.username,
      avatar: row.avatar,
      annotationColor: row.annotationColor || "#8ab6d6",
      annotationDensity: normalizeAnnotationDensity(row.annotationDensity) || "medium",
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
        title: row.title,
        byline: row.byline || undefined,
        excerpt: row.excerpt || undefined,
        contentHash: row.contentHash,
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
    tx.delete(schema.userProfiles).run();

    upsertUser(tx, store.user);
    for (const provider of store.providers) upsertProvider(tx, provider);
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
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      contentHash: article.contentHash,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.articles.id,
      set: {
        url: article.url,
        canonicalUrl: article.canonicalUrl,
        title: article.title,
        byline: article.byline,
        excerpt: article.excerpt,
        contentHash: article.contentHash,
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

function upsertProvider(database: StoreExecutor, provider: LlmProvider) {
  database
    .insert(schema.providers)
    .values({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelName: provider.modelName,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.providers.id,
      set: {
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        modelName: provider.modelName,
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
    providers: store.providers || [],
    agents: (store.agents || []).map((agent) =>
      Object.assign({}, agent, {
        annotationColor: agent.annotationColor || "#8ab6d6",
        annotationDensity: normalizeAnnotationDensity(agent.annotationDensity) || "medium",
        temperature: normalizeTemperature(agent.temperature),
      }),
    ),
    articles: store.articles || [],
  };
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
  return [...items].toSorted((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

function normalizeUsername(value: string, fallback = "me") {
  return (
    value
      .trim()
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .slice(0, 32) || fallback
  );
}

function normalizeAnnotationDensity(value: unknown): AgentAnnotationDensity | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function normalizeTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.5;
  return Math.min(1, Math.max(0, temperature));
}

function normalizeAnnotationType(value: unknown): AnnotationType | null {
  return value === "key_point" ||
    value === "assumption" ||
    value === "concept" ||
    value === "question" ||
    value === "quote"
    ? value
    : null;
}
