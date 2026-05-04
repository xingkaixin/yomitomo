import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell, type BrowserWindowConstructorOptions } from 'electron';
import type {
  Agent,
  LlmProvider,
  ReadingDeliberationSection,
  ReadingCardReviewRecord,
  ReadingCardReviewerResult,
  ReadingCardSection,
  UserProfile,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import {
  deleteAgent,
  deleteProvider,
  readStore,
  saveAgent,
  saveArticleReadingDeliberation,
  saveArticleReadingCard,
  saveArticleReadingCardReview,
  saveProvider,
  saveSettings,
  saveUser,
} from './store';
import {
  generateReadingCard,
  generateReadingDeliberation,
  reviewReadingCard,
  type GenerateReadingDeliberationInput,
  testProvider,
  type GenerateReadingCardInput,
  type ReviewReadingCardInput,
} from './llm';
import { clearLogFile, getLogPath, logInfo, readLogFile } from './logger';
import { getPairingInfo, rotatePairingInfo } from './pairing';
import {
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

async function createWindow() {
  mainWindow = new BrowserWindow({
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

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
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
  ipcMain.handle('store:get', () => readStore());
  ipcMain.handle('log:path', () => getLogPath());
  ipcMain.handle('log:read', () => readLogFile());
  ipcMain.handle('log:clear', () => clearLogFile());
  ipcMain.handle('url:open', (_event, value: string) => openExternalUrl(value));
  ipcMain.handle('pairing:get', () => getPairingInfo());
  ipcMain.handle('pairing:connection-status', () => getDesktopConnectionStatus());
  ipcMain.handle('pairing:rotate', async () => {
    const pairing = await rotatePairingInfo();
    disconnectAuthenticatedSockets();
    sendPairingConnectionStatus({ authenticatedSocketCount: 0 });
    return pairing;
  });
  ipcMain.handle('user:save', (_event, input: Partial<UserProfile>) => saveUser(input));
  ipcMain.handle('settings:save', (_event, input: { defaultProviderId?: string }) =>
    saveSettings(input),
  );
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
  ipcMain.handle('reading-card:generate', async (_event, input: GenerateReadingCardInput) => {
    const store = await readStore();
    const provider = store.providers.find((item) => item.id === store.settings.defaultProviderId);
    if (!provider) throw new Error('请先在通用设置里选择默认供应商');
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
      const provider = store.providers.find((item) => item.id === store.settings.defaultProviderId);
      if (!provider) throw new Error('请先在通用设置里选择默认供应商');
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
        (selectedReviewAgentIds.size === 0 || selectedReviewAgentIds.has(agent.id)),
    );
    if (reviewAgents.length === 0) {
      throw new Error(
        selectedReviewAgentIds.size > 0 ? '请选择有效的审核助手' : '请先创建审核助手',
      );
    }

    const createdAt = new Date().toISOString();
    const reviewerResults: ReadingCardReviewerResult[] = await Promise.all(
      reviewAgents.map(async (agent) => {
        try {
          const provider = store.providers.find((item) => item.id === agent.providerId);
          if (!provider) throw new Error(`审核助手 ${agent.nickname} 缺少供应商`);
          const result = await reviewReadingCard(provider, agent, input);
          return createReviewerResult(agent, result, createdAt);
        } catch (error) {
          const message = error instanceof Error ? error.message : '审稿失败';
          return createReviewerResult(
            agent,
            {
              verdict: 'revise',
              summary: `${agent.nickname} 没有完成审稿：${message}`,
              findings: [
                {
                  section: '整张卡片',
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
    const review: ReadingCardReviewRecord = {
      id: makeId('reading_card_review'),
      articleId: input.article.id,
      readingCardId: input.readingCard.id,
      reviewerResults,
      createdAt,
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
  mainWindow?.webContents.send('pairing:connection-status', status);
}

function sendStoreUpdated(store: Awaited<ReturnType<typeof readStore>>) {
  mainWindow?.webContents.send('store:updated', store);
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
    verdict: result.verdict,
    summary: result.summary,
    findings: result.findings,
    acceptedClaims: result.acceptedClaims,
    missingAngles: result.missingAngles,
    rawResponse: result.rawResponse,
    createdAt,
  };
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
