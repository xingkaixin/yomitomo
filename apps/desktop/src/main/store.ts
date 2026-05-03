import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { app } from "electron";
import type {
  Agent,
  ArticleRecord,
  DesktopStore,
  LlmProvider,
  UserProfile,
} from "@yomitomo/shared";
import { makeId } from "@yomitomo/shared";

const STORE_FILE_NAME = "yomitomo-agent-store.json";
const LEGACY_STORE_FILE_NAME = "reader-agent-store.json";

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

function storePath() {
  return join(app.getPath("userData"), STORE_FILE_NAME);
}

function legacyStorePath() {
  return join(app.getPath("appData"), "@reader", "desktop", LEGACY_STORE_FILE_NAME);
}

async function ensureStorePath() {
  const file = storePath();
  try {
    await readFile(file, "utf8");
    return file;
  } catch {
    const raw = await readFile(legacyStorePath(), "utf8");
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, raw);
    return file;
  }
}

export async function readStore(): Promise<DesktopStore> {
  try {
    const raw = await readFile(await ensureStorePath(), "utf8");
    const parsed = JSON.parse(raw) as DesktopStore;
    return {
      user: {
        ...defaultUser,
        ...parsed.user,
        id: parsed.user?.id || defaultUser.id,
        annotationColor: parsed.user?.annotationColor || defaultUser.annotationColor,
      },
      providers: parsed.providers || [],
      agents: (parsed.agents || []).map((agent) => ({
        ...agent,
        annotationColor: agent.annotationColor || "#8ab6d6",
      })),
      articles: parsed.articles || [],
    };
  } catch {
    return defaultStore;
  }
}

export async function writeStore(store: DesktopStore): Promise<DesktopStore> {
  const file = storePath();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(store, null, 2));
  return store;
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

  return writeStore({ ...store, user });
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

  const providers = existing
    ? store.providers.map((item) => (item.id === provider.id ? provider : item))
    : [...store.providers, provider];
  return writeStore({ ...store, providers });
}

export async function deleteProvider(id: string): Promise<DesktopStore> {
  const store = await readStore();
  return writeStore({
    ...store,
    providers: store.providers.filter((provider) => provider.id !== id),
    agents: store.agents.filter((agent) => agent.providerId !== id),
  });
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
    soul:
      input.soul?.trim() ||
      existing?.soul ||
      "你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  const agents = existing
    ? store.agents.map((item) => (item.id === agent.id ? agent : item))
    : [...store.agents, agent];
  return writeStore({ ...store, agents });
}

export async function deleteAgent(id: string): Promise<DesktopStore> {
  const store = await readStore();
  return writeStore({ ...store, agents: store.agents.filter((agent) => agent.id !== id) });
}

export async function saveArticle(input: ArticleRecord): Promise<DesktopStore> {
  const store = await readStore();
  const existing = store.articles.find((article) => article.id === input.id);
  const articles = existing
    ? store.articles.map((article) => (article.id === input.id ? input : article))
    : [input, ...store.articles];

  return writeStore({ ...store, articles: sortArticles(articles) });
}

function sortArticles(articles: ArticleRecord[]) {
  return [...articles].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

function normalizeUsername(value: string, fallback = "me") {
  return (
    value
      .trim()
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 32) || fallback
  );
}
