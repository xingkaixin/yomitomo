import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell, type BrowserWindowConstructorOptions } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  AppSettings,
  ArticleRecord,
  Comment,
  LlmProvider,
  ReadingDeliberationSection,
  ReadingCardReviewRecord,
  ReadingCardReviewerResult,
  ReadingCardSection,
  UserProfile,
} from '@yomitomo/shared';
import { agentPersonalityName, makeId } from '@yomitomo/shared';
import {
  generateReadingCard,
  generateReadingDeliberation,
  listProviderModels,
  reviewReadingCard,
  runAgent,
  runAgentAnnotate,
  runAgentAnnotateStream,
  runAgentStream,
  setAiLogger,
  testProvider,
  type GenerateReadingCardInput,
  type GenerateReadingDeliberationInput,
  type ReviewReadingCardInput,
} from '@yomitomo/ai';
import {
  deleteAgent,
  deleteArticle,
  deleteProvider,
  readStore,
  saveAgent,
  saveArticleReadingDeliberation,
  saveArticleReadingCard,
  saveArticleReadingCardReview,
  saveArticle,
  saveProvider,
  saveSettings,
  saveUser,
} from './store';
import { clearLogFile, getLogPath, logError, logInfo, readLogFile } from './logger';
import { getPairingInfo, getSavedPairingInfo, rotatePairingInfo } from './pairing';
import {
  broadcastArticleDeleted,
  broadcastArticleUpdate,
  broadcastStatus,
  disconnectAuthenticatedSockets,
  getDesktopConnectionStatus,
  setArticleUpdateListener,
  setSocketStatusListener,
  startLocalServer,
  type DesktopConnectionStatus,
} from './server';

let mainWindow: BrowserWindow | null = null;
const appIconPath = join(__dirname, '../../resources/icon.png');

app.setName('Yomitomo');
app.setPath('userData', join(app.getPath('appData'), '@yomitomo/desktop'));
setAiLogger({ info: logInfo, error: logError });

async function createWindow() {
  const browserWindow = new BrowserWindow({
    ...windowChromeOptions(),
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    title: 'Yomitomo | 伴读 · 你的 AI 阅读伙伴',
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = browserWindow;

  browserWindow.on('closed', () => {
    if (mainWindow === browserWindow) mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    browserWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await browserWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });
  sendPairingConnectionStatus();
}

function windowChromeOptions(): BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
    };
  }

  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#f8f3e8',
        symbolColor: '#251d16',
        height: 42,
      },
    };
  }

  return {
    frame: false,
  };
}

app.whenReady().then(async () => {
  logInfo('app.ready', { logPath: getLogPath() });
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  registerIpc();
  setSocketStatusListener(sendPairingConnectionStatus);
  setArticleUpdateListener(sendStoreUpdated);
  await startLocalServer();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

function registerIpc() {
  ipcMain.handle('app:info', () => ({ desktopVersion: app.getVersion() }));
  ipcMain.handle('store:get', () => readStore());
  ipcMain.handle('log:path', () => getLogPath());
  ipcMain.handle('log:read', () => readLogFile());
  ipcMain.handle('log:clear', () => clearLogFile());
  ipcMain.handle('url:open', (_event, value: string) => openExternalUrl(value));
  ipcMain.handle('article:save', async (_event, input: ArticleRecord) => {
    const store = await saveArticle(input);
    const article = store.articles.find((item) => item.id === input.id);
    if (article) broadcastArticleUpdate(article);
    sendStoreUpdated(store);
    return store;
  });
  ipcMain.handle('pairing:get', () => getPairingInfo());
  ipcMain.handle('pairing:saved', () => getSavedPairingInfo());
  ipcMain.handle('pairing:connection-status', () => getDesktopConnectionStatus());
  ipcMain.handle('pairing:rotate', async () => {
    const pairing = await rotatePairingInfo();
    disconnectAuthenticatedSockets();
    sendPairingConnectionStatus({ authenticatedSocketCount: 0 });
    return pairing;
  });
  ipcMain.handle('user:save', (_event, input: Partial<UserProfile>) => saveUser(input));
  ipcMain.handle('settings:save', async (_event, input: AppSettings) => {
    const store = await saveSettings(input);
    broadcastStatus();
    return store;
  });
  ipcMain.handle('provider:save', async (_event, input: Partial<LlmProvider>) => {
    const store = await saveProvider(input);
    broadcastStatus();
    return store;
  });
  ipcMain.handle('provider:delete', async (_event, id: string) => {
    const store = await deleteProvider(id);
    broadcastStatus();
    return store;
  });
  ipcMain.handle('provider:test', async (_event, id: string) => {
    try {
      const store = await readStore();
      const provider = store.providers.find((item) => item.id === id);
      if (!provider) return { ok: false, message: 'Provider 不存在' };
      return testProvider(provider);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Provider 测试失败' };
    }
  });
  ipcMain.handle('provider:list-models', (_event, input: Partial<LlmProvider>) =>
    listProviderModels(input),
  );
  ipcMain.handle('article:delete', async (_event, id: string) => {
    const previousStore = await readStore();
    const article = previousStore.articles.find((item) => item.id === id);
    const store = await deleteArticle(id);
    if (article) {
      broadcastArticleDeleted({
        id: article.id,
        url: article.url,
        canonicalUrl: article.canonicalUrl,
      });
    }
    sendStoreUpdated(store);
    return store;
  });
  ipcMain.handle('agent:comment', async (_event, payload: AgentMessagePayload) => {
    const store = await readStore();
    const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到批注助手：@${payload.agentUsername}`);
    const provider = taskProvider(store.providers, store.settings, 'readingAssistant');
    const comment = await runAgent(provider, agent, {
      ...payload,
      agentRoster: publicAnnotationAgents(store.agents),
    });
    return {
      ...comment,
      id: makeId('comment'),
      readingIntent: payload.readingIntent || comment.readingIntent,
    } satisfies Comment;
  });
  ipcMain.on(
    'agent:comment:stream',
    async (
      event,
      input: {
        requestId: string;
        payload: AgentMessagePayload;
      },
    ) => {
      const channel = `agent:comment:stream:${input.requestId}`;
      try {
        const store = await readStore();
        const agent = findAnnotationAgent(
          store.agents,
          input.payload.agentId,
          input.payload.agentUsername,
        );
        if (!agent) throw new Error(`找不到批注助手：@${input.payload.agentUsername}`);
        const provider = taskProvider(store.providers, store.settings, 'readingAssistant');
        const comment: Comment = {
          id: makeId('comment'),
          author: 'ai',
          content: '',
          createdAt: new Date().toISOString(),
          agentId: agent.id,
          agentUsername: agent.username,
          agentNickname: agent.nickname,
          agentAvatar: agent.avatar,
          agentAnnotationColor: agent.annotationColor,
          readingIntent: input.payload.readingIntent,
          pending: true,
        };
        event.sender.send(channel, { type: 'start', comment });
        await runAgentStream(
          provider,
          agent,
          {
            ...input.payload,
            agentRoster: publicAnnotationAgents(store.agents),
            readingIntent: input.payload.readingIntent || comment.readingIntent,
          },
          (delta) => {
            comment.content += delta;
            event.sender.send(channel, { type: 'delta', delta });
          },
        );
        event.sender.send(channel, {
          type: 'done',
          comment: { ...comment, pending: false },
        });
      } catch (error) {
        event.sender.send(channel, {
          type: 'error',
          message: error instanceof Error ? error.message : '助手回复失败',
        });
      }
    },
  );
  ipcMain.handle('agent:annotate', async (_event, payload: AgentAnnotatePayload) => {
    const store = await readStore();
    const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到批注助手：@${payload.agentUsername}`);
    const provider = taskProvider(store.providers, store.settings, 'readingAssistant');
    const annotations = await runAgentAnnotate(provider, agent, payload);
    return { annotations };
  });
  ipcMain.on(
    'agent:annotate:stream',
    async (
      event,
      input: {
        requestId: string;
        payload: AgentAnnotatePayload;
      },
    ) => {
      const channel = `agent:annotate:stream:${input.requestId}`;
      try {
        const store = await readStore();
        const agent = findAnnotationAgent(
          store.agents,
          input.payload.agentId,
          input.payload.agentUsername,
        );
        if (!agent) throw new Error(`找不到批注助手：@${input.payload.agentUsername}`);
        const provider = taskProvider(store.providers, store.settings, 'readingAssistant');
        const annotations: ArticleRecord['annotations'] = [];
        event.sender.send(channel, { type: 'start' });
        await runAgentAnnotateStream(provider, agent, input.payload, (annotation) => {
          annotations.push(annotation);
          event.sender.send(channel, { type: 'item', annotation });
        });
        event.sender.send(channel, { type: 'done', annotations });
      } catch (error) {
        event.sender.send(channel, {
          type: 'error',
          message: error instanceof Error ? error.message : '助手批注失败',
        });
      }
    },
  );
  ipcMain.handle('reading-card:generate', async (_event, input: GenerateReadingCardInput) => {
    const store = await readStore();
    const provider = taskProvider(store.providers, store.settings, 'readingNote');
    const content = await generateReadingCard(provider, input);
    const now = new Date().toISOString();
    const readingCard = {
      id: input.article.readingCard?.id || makeId('reading_card'),
      articleId: input.article.id,
      title: input.article.title,
      contentMarkdown: content,
      sections: parseReadingCardSections(content),
      providerId: provider.id,
      providerName: provider.name,
      modelName: provider.modelName,
      createdAt: input.article.readingCard?.createdAt || now,
      updatedAt: now,
    };
    await saveArticleReadingCard(input.article.id, readingCard);
    return { readingCard };
  });
  ipcMain.handle(
    'reading-deliberation:generate',
    async (_event, input: GenerateReadingDeliberationInput) => {
      const store = await readStore();
      const provider = taskProvider(store.providers, store.settings, 'readingNote');
      const content = await generateReadingDeliberation(provider, input);
      const now = new Date().toISOString();
      const deliberation = {
        id: input.article.readingDeliberation?.id || makeId('reading_deliberation'),
        articleId: input.article.id,
        title: input.article.title,
        contentMarkdown: content,
        sections: parseMarkdownSections(content),
        providerId: provider.id,
        providerName: provider.name,
        modelName: provider.modelName,
        createdAt: input.article.readingDeliberation?.createdAt || now,
        updatedAt: now,
      };
      await saveArticleReadingDeliberation(input.article.id, deliberation);
      return { readingDeliberation: deliberation };
    },
  );
  ipcMain.handle('reading-card:review', async (_event, input: ReviewReadingCardInput) => {
    const store = await readStore();
    const selectedReviewAgentIds = new Set(input.reviewAgentIds || []);
    const reviewAgents = store.agents.filter(
      (agent) =>
        agent.kind === 'review' &&
        agent.enabled &&
        (selectedReviewAgentIds.size === 0 || selectedReviewAgentIds.has(agent.id)),
    );
    if (reviewAgents.length === 0) {
      throw new Error(
        selectedReviewAgentIds.size > 0 ? '请选择有效的审核助手' : '请先创建审核助手',
      );
    }

    const provider = taskProvider(store.providers, store.settings, 'reviewAssistant');
    const createdAt = new Date().toISOString();
    const reviewerResults: ReadingCardReviewerResult[] = await Promise.all(
      reviewAgents.map(async (agent) => {
        try {
          const result = await reviewReadingCard(provider, agent, input);
          return createReviewerResult(agent, result, createdAt);
        } catch (error) {
          const message = error instanceof Error ? error.message : '审稿失败';
          return createReviewerResult(
            agent,
            {
              status: 'error',
              verdict: 'revise',
              summary: `${agent.nickname} 没有完成审稿：${message}`,
              findings: [
                {
                  section: '整篇笔记',
                  severity: 'high',
                  problem: message,
                  evidenceIds: [],
                },
              ],
              acceptedClaims: [],
              missingAngles: [],
              rawResponse: message,
            },
            createdAt,
          );
        }
      }),
    );
    const previousReview = input.previousReview;
    const mergedReviewerResults = previousReview
      ? mergeReviewerResults(previousReview.reviewerResults, reviewerResults)
      : reviewerResults;
    const review: ReadingCardReviewRecord = {
      id: previousReview?.id || makeId('reading_card_review'),
      articleId: input.article.id,
      readingCardId: input.readingCard.id,
      reviewerResults: mergedReviewerResults,
      createdAt: previousReview?.createdAt || createdAt,
      updatedAt: createdAt,
    };
    await saveArticleReadingCardReview(input.article.id, review);
    return { review };
  });
  ipcMain.handle('agent:save', async (_event, input: Partial<Agent>) => {
    const store = await saveAgent(input);
    broadcastStatus();
    return store;
  });
  ipcMain.handle('agent:delete', async (_event, id: string) => {
    const store = await deleteAgent(id);
    broadcastStatus();
    return store;
  });
}

function sendPairingConnectionStatus(
  status: DesktopConnectionStatus = getDesktopConnectionStatus(),
) {
  sendToRenderer('pairing:connection-status', status);
}

function sendStoreUpdated(store: Awaited<ReturnType<typeof readStore>>) {
  sendToRenderer('store:updated', store);
}

function sendToRenderer(
  channel: 'pairing:connection-status',
  payload: DesktopConnectionStatus,
): void;
function sendToRenderer(
  channel: 'store:updated',
  payload: Awaited<ReturnType<typeof readStore>>,
): void;
function sendToRenderer(channel: string, payload: unknown) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

type ProviderTask = 'readingAssistant' | 'reviewAssistant' | 'readingNote';

const providerTaskSettings: Record<ProviderTask, keyof AppSettings> = {
  readingAssistant: 'readingAssistantProviderId',
  reviewAssistant: 'reviewAssistantProviderId',
  readingNote: 'readingNoteProviderId',
};

const providerTaskLabels: Record<ProviderTask, string> = {
  readingAssistant: '阅读理解助手',
  reviewAssistant: '深度审阅助手',
  readingNote: '读后笔记助手',
};

function taskProvider(
  providers: LlmProvider[],
  settings: AppSettings,
  task: ProviderTask,
): LlmProvider {
  const providerId = settings[providerTaskSettings[task]] || settings.defaultProviderId;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`请先在任务路由选择${providerTaskLabels[task]}供应商`);
  return provider;
}

function findAnnotationAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function publicAnnotationAgents(agents: Agent[]) {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .map((agent) => ({
      id: agent.id,
      kind: agent.kind,
      enabled: agent.enabled,
      presetId: agent.presetId,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      personalityName: agentPersonalityName(agent),
      temperature: agent.temperature,
    }));
}

function createReviewerResult(
  agent: Agent,
  result: Omit<
    ReadingCardReviewerResult,
    | 'id'
    | 'reviewerId'
    | 'reviewerNickname'
    | 'reviewerUsername'
    | 'reviewerAvatar'
    | 'reviewerColor'
    | 'createdAt'
  >,
  createdAt: string,
): ReadingCardReviewerResult {
  return {
    id: makeId('reading_card_reviewer_result'),
    reviewerId: agent.id,
    reviewerNickname: agent.nickname,
    reviewerUsername: agent.username,
    reviewerAvatar: agent.avatar,
    reviewerColor: agent.annotationColor,
    status: result.status || 'done',
    verdict: result.verdict,
    summary: result.summary,
    findings: result.findings,
    acceptedClaims: result.acceptedClaims,
    missingAngles: result.missingAngles,
    rawResponse: result.rawResponse,
    createdAt,
  };
}

function mergeReviewerResults(
  previousResults: ReadingCardReviewerResult[],
  nextResults: ReadingCardReviewerResult[],
) {
  const nextByReviewerId = new Map(nextResults.map((result) => [result.reviewerId, result]));
  const merged = previousResults.map((result) => nextByReviewerId.get(result.reviewerId) || result);
  const previousReviewerIds = new Set(previousResults.map((result) => result.reviewerId));
  return [
    ...merged,
    ...nextResults.filter((result) => !previousReviewerIds.has(result.reviewerId)),
  ];
}

function parseReadingCardSections(markdown: string): ReadingCardSection[] {
  return parseMarkdownSections(markdown);
}

function parseMarkdownSections(markdown: string): ReadingDeliberationSection[] {
  const sections: ReadingDeliberationSection[] = [];
  let current: ReadingDeliberationSection | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) continue;
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }
  if (current) sections.push(current);
  return sections;
}

async function openExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持打开 HTTP 链接');
  }
  await shell.openExternal(url.toString());
}
