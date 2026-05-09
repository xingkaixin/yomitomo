import { createServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  Agent,
  AppSettings,
  ArticleRecord,
  DesktopServerMessage,
  DesktopStore,
  LlmProvider,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentPersonalities,
  agentPersonalityName,
  hashText,
  isDesktopSocketOriginAllowed,
  makeId,
  parseDesktopClientMessage,
} from '@yomitomo/shared';
import { runAgentAnnotateStream, runAgentStream } from '@yomitomo/ai';
import { readStore, saveArticle } from './store';
import { logError, logInfo } from './logger';
import { getPairingInfo, getSavedPairingInfo, verifyPairingToken } from './pairing';
import {
  authorizeDesktopClientMessage,
  resolveSocketAuthResult,
  type DesktopSocketAuthState,
} from './server-auth';

const PORT = 43891;

let httpServer: Server | null = null;
let wsServer: WebSocketServer | null = null;
const socketStates = new WeakMap<WebSocket, DesktopSocketAuthState>();
let socketStatusListener: ((status: DesktopConnectionStatus) => void) | null = null;
let articleUpdateListener: ((store: DesktopStore) => void) | null = null;
let articleOpenListener: ((article: ArticleRecord) => void) | null = null;

export type DesktopConnectionStatus = {
  authenticatedSocketCount: number;
  extensionVersions?: string[];
  lastExtensionVersion?: string;
};

let lastExtensionVersion = '';

export function setSocketStatusListener(listener: (status: DesktopConnectionStatus) => void) {
  socketStatusListener = listener;
}

export function getDesktopConnectionStatus(): DesktopConnectionStatus {
  const authenticatedStates = Array.from(wsServer?.clients || [])
    .map((client) => socketStates.get(client))
    .filter((state): state is DesktopSocketAuthState => Boolean(state?.authenticated));
  const extensionVersions = Array.from(
    new Set(authenticatedStates.map((state) => state.extensionVersion).filter(Boolean) as string[]),
  );

  return {
    authenticatedSocketCount: authenticatedStates.length,
    extensionVersions,
    lastExtensionVersion: lastExtensionVersion || undefined,
  };
}

export function setArticleUpdateListener(listener: (store: DesktopStore) => void) {
  articleUpdateListener = listener;
}

export function setArticleOpenListener(listener: (article: ArticleRecord) => void) {
  articleOpenListener = listener;
}

export async function startLocalServer() {
  if (httpServer) return;

  httpServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  wsServer = new WebSocketServer({ server: httpServer });
  wsServer.on('connection', (socket, request) => {
    const origin = request.headers.origin;
    const originAllowed = isDesktopSocketOriginAllowed(origin);
    socketStates.set(socket, { authenticated: false, originAllowed });
    logInfo('ws.connection', { origin, originAllowed });

    socket.on('message', (raw) => {
      void handleMessage(socket, raw.toString());
    });

    socket.on('close', (code, reason) => {
      logInfo('ws.close', { code, reason: reason.toString() });
      notifySocketStatusChange();
    });
  });

  httpServer.listen(PORT, '127.0.0.1');
  logInfo('server.listen', { port: PORT });
}

export function broadcastStatus() {
  wsServer?.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && socketStates.get(client)?.authenticated) {
      void sendStatus(client);
    }
  });
}

export function broadcastArticleUpdate(article: ArticleRecord) {
  wsServer?.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && socketStates.get(client)?.authenticated) {
      send(client, { type: 'article:updated', article });
    }
  });
}

export function broadcastArticleDeleted(
  article: Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>,
) {
  wsServer?.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && socketStates.get(client)?.authenticated) {
      send(client, { type: 'article:deleted', article });
    }
  });
}

export function disconnectAuthenticatedSockets() {
  wsServer?.clients.forEach((client) => {
    if (socketStates.get(client)?.authenticated) {
      client.close(1008, 'pairing rotated');
    }
  });
}

async function handleMessage(socket: WebSocket, raw: string) {
  let requestId: string | undefined;
  try {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      send(socket, { type: 'error', message: '消息不是有效 JSON' });
      return;
    }

    const parsed = parseDesktopClientMessage(value);
    if (!parsed.ok) {
      send(socket, {
        type: 'error',
        requestId: parsed.error.requestId,
        message: parsed.error.message,
      });
      return;
    }

    const message = parsed.message;
    requestId = 'requestId' in message ? message.requestId : undefined;
    if (message.type !== 'ping') logInfo('ws.message', { type: message.type, requestId });

    if (message.type === 'auth') {
      await authenticateSocket(socket, message.token);
      return;
    }

    const authorization = authorizeDesktopClientMessage(socketStates.get(socket), message);
    if (!authorization.ok) {
      send(socket, {
        type: 'error',
        requestId: authorization.requestId,
        message: authorization.message,
      });
      return;
    }

    if (message.type === 'hello') {
      rememberExtensionVersion(socket, message.extensionVersion);
      await sendStatus(socket);
      return;
    }

    if (message.type === 'ping') return;

    if (message.type === 'agent:list') {
      const store = await readStore();
      send(socket, {
        type: 'agent:list:result',
        requestId: message.requestId,
        user: toPublicUser(store.user),
        settings: store.settings,
        agents: toPublicAgents(
          store.agents.filter((agent) => agent.kind === 'annotation' && agent.enabled),
        ),
      });
      return;
    }

    if (message.type === 'article:save') {
      const previousStore = await readStore();
      const previousArticle = previousStore.articles.find((item) => item.id === message.payload.id);
      if (
        previousArticle &&
        articleSyncSignature(previousArticle) === articleSyncSignature(message.payload)
      ) {
        send(socket, {
          type: 'article:save:result',
          requestId: message.requestId,
          article: previousArticle,
        });
        return;
      }

      const store = await saveArticle(message.payload);
      const article = store.articles.find((item) => item.id === message.payload.id);
      logInfo('article.save', {
        requestId: message.requestId,
        articleId: message.payload.id,
        title: message.payload.title,
        annotations: message.payload.annotations.length,
      });
      if (article) {
        send(socket, { type: 'article:save:result', requestId: message.requestId, article });
        broadcastArticleUpdate(article);
      }
      articleUpdateListener?.(store);
      return;
    }

    if (message.type === 'article:get') {
      const store = await readStore();
      const article = findStoreArticle(store, message.payload);
      send(socket, { type: 'article:get:result', requestId: message.requestId, article });
      return;
    }

    if (message.type === 'article:open') {
      const store = await readStore();
      const article = findStoreArticle(store, message.payload);
      if (article) articleOpenListener?.(article);
      send(socket, { type: 'article:open:result', requestId: message.requestId, article });
      return;
    }

    if (message.type === 'agent:message') {
      const store = await readStore();
      const agent = findAgent(
        store.agents.filter((item) => item.enabled),
        message.payload.agentId,
        message.payload.agentUsername,
      );
      if (!agent) throw new Error(`找不到 Agent：@${message.payload.agentUsername}`);

      const provider = taskProvider(store, 'readingAssistant');

      const comment = {
        id: makeId('comment'),
        author: 'ai' as const,
        content: '',
        createdAt: new Date().toISOString(),
        agentId: agent.id,
        agentUsername: agent.username,
        agentNickname: agent.nickname,
        agentAvatar: agent.avatar,
        agentAnnotationColor: agent.annotationColor,
        readingIntent:
          message.payload.readingIntent ||
          message.payload.annotation.readingIntent ||
          message.payload.userComment.readingIntent,
        pending: true,
      };
      const agentMessagePayload = {
        ...message.payload,
        agentRoster: toPublicAgents(store.agents.filter((item) => item.enabled)),
        readingIntent: comment.readingIntent,
      };

      send(socket, {
        type: 'agent:message:start',
        requestId: message.requestId,
        annotationId: message.payload.annotation.id,
        comment,
      });

      await runAgentStream(provider, agent, agentMessagePayload, (delta) => {
        send(socket, {
          type: 'agent:message:delta',
          requestId: message.requestId,
          annotationId: message.payload.annotation.id,
          commentId: comment.id,
          delta,
        });
      });

      send(socket, {
        type: 'agent:message:done',
        requestId: message.requestId,
        annotationId: message.payload.annotation.id,
        commentId: comment.id,
      });
      return;
    }

    if (message.type === 'agent:annotate') {
      const store = await readStore();
      const agent = findAgent(
        store.agents.filter((item) => item.enabled),
        message.payload.agentId,
        message.payload.agentUsername,
      );
      if (!agent) throw new Error(`找不到 Agent：@${message.payload.agentUsername}`);

      const provider = taskProvider(store, 'readingAssistant');

      logInfo('agent.annotate.start', {
        requestId: message.requestId,
        agent: agent.username,
        annotationType: message.payload.annotationType,
        readingIntent: message.payload.readingIntent,
        instructed: Boolean(message.payload.instruction),
        articleTitle: message.payload.article.title,
        articleChars: message.payload.article.text.length,
        targeted: Boolean(message.payload.targetAnchor),
        plannedActions: message.payload.readingPlan?.length || 0,
      });
      send(socket, {
        type: 'agent:annotate:start',
        requestId: message.requestId,
        agent: toPublicAgents([agent])[0],
      });

      let annotationCount = 0;
      await runAgentAnnotateStream(provider, agent, message.payload, (annotation) => {
        annotationCount += 1;
        logInfo('agent.annotate.item', {
          requestId: message.requestId,
          agent: agent.username,
          annotationId: annotation.id,
          readingIntent: annotation.readingIntent,
          exactChars: annotation.anchor.exact.length,
          exactPreview: annotation.anchor.exact.slice(0, 80),
        });
        send(socket, { type: 'agent:annotate:item', requestId: message.requestId, annotation });
      });

      logInfo('agent.annotate.done', {
        requestId: message.requestId,
        agent: agent.username,
        annotations: annotationCount,
      });
      send(socket, { type: 'agent:annotate:done', requestId: message.requestId });
      return;
    }
  } catch (error) {
    logError('ws.message.error', error, { requestId });
    send(socket, {
      type: 'error',
      requestId,
      message: error instanceof Error ? error.message : '本地服务处理失败',
    });
  }
}

async function authenticateSocket(socket: WebSocket, token: string) {
  const state = socketStates.get(socket);
  const pairing = await getSavedPairingInfo();
  if (!pairing) {
    send(socket, { type: 'auth:result', ok: false, message: '请先在桌面端生成配对码' });
    socket.close(1008, 'pairing required');
    return;
  }

  const auth = resolveSocketAuthResult(state, verifyPairingToken(token, pairing.token));
  if (!auth.ok) {
    send(socket, { type: 'auth:result', ok: false, message: auth.message });
    socket.close(1008, auth.message);
    return;
  }

  socketStates.set(socket, auth.state);
  send(socket, { type: 'auth:result', ok: true, pairingId: pairing.pairingId });
  notifySocketStatusChange();
  await sendStatus(socket);
}

async function sendStatus(socket: WebSocket) {
  const store = await readStore();
  const pairing = await getPairingInfo();
  send(socket, {
    type: 'status',
    ok: true,
    user: toPublicUser(store.user),
    settings: store.settings,
    agents: toPublicAgents(
      store.agents.filter((agent) => agent.kind === 'annotation' && agent.enabled),
    ),
    pairingId: pairing.pairingId,
  });
}

function send(socket: WebSocket, message: DesktopServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    logInfo('ws.send.drop', {
      type: message.type,
      requestId: 'requestId' in message ? message.requestId : undefined,
      readyState: socket.readyState,
    });
  }
}

function notifySocketStatusChange() {
  socketStatusListener?.(getDesktopConnectionStatus());
}

function rememberExtensionVersion(socket: WebSocket, extensionVersion: string | undefined) {
  if (!extensionVersion) return;
  const state = socketStates.get(socket);
  if (!state?.authenticated) return;
  socketStates.set(socket, { ...state, extensionVersion });
  lastExtensionVersion = extensionVersion;
  notifySocketStatusChange();
}

function toPublicAgents(agents: Agent[]): PublicAgent[] {
  return agents.map((agent) => {
    const personality = agentPersonalities.find(
      (item) => item.id === agent.presetId || item.soul === agent.soul,
    );
    return {
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
      pinyin: personality?.pinyin,
      temperature: agent.temperature,
    };
  });
}

function findAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return (
    agents.find((agent) => agent.id === agentId) ||
    agents.find((agent) => agent.username === username)
  );
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

function taskProvider(store: DesktopStore, task: ProviderTask): LlmProvider {
  const providerId = store.settings[providerTaskSettings[task]] || store.settings.defaultProviderId;
  const provider = store.providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`请先在任务路由选择${providerTaskLabels[task]}供应商`);
  return provider;
}

function toPublicUser(user: UserProfile): UserProfile {
  return user;
}

function findStoreArticle(
  store: DesktopStore,
  identity: Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>,
) {
  return (
    store.articles.find((item) => item.id === identity.id) ||
    store.articles.find(
      (item) =>
        item.canonicalUrl === identity.canonicalUrl ||
        item.url === identity.url ||
        item.url === identity.canonicalUrl ||
        item.canonicalUrl === identity.url,
    ) ||
    null
  );
}

function articleSyncSignature(article: ArticleRecord) {
  return JSON.stringify({
    id: article.id,
    url: article.url,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    byline: article.byline,
    excerpt: article.excerpt,
    siteName: article.siteName,
    siteIconUrl: article.siteIconUrl,
    leadImageUrl: article.leadImageUrl,
    themeColor: article.themeColor,
    contentHtmlHash: hashText(article.contentHtml || ''),
    contentHash: article.contentHash,
    annotations: article.annotations.map((annotation) => ({
      id: annotation.id,
      anchor: annotation.anchor,
      author: annotation.author,
      annotationType: annotation.annotationType,
      readingIntent: annotation.readingIntent,
      questionStatus: annotation.questionStatus,
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
      comments: annotation.comments.map((comment) => ({
        id: comment.id,
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
        pending: comment.pending || undefined,
      })),
    })),
  });
}
