import { createServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  Agent,
  DesktopServerMessage,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { isDesktopSocketOriginAllowed, makeId, parseDesktopClientMessage } from '@yomitomo/shared';
import { readStore, saveArticle } from './store';
import { runAgentAnnotateStream, runAgentStream } from './llm';
import { logError, logInfo } from './logger';
import { getPairingInfo, verifyPairingToken } from './pairing';
import {
  authorizeDesktopClientMessage,
  resolveSocketAuthResult,
  type DesktopSocketAuthState,
} from './server-auth';

const PORT = 43891;

let httpServer: Server | null = null;
let wsServer: WebSocketServer | null = null;
const socketStates = new WeakMap<WebSocket, DesktopSocketAuthState>();

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
    logInfo('ws.message', { type: message.type, requestId });

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
      await sendStatus(socket);
      return;
    }

    if (message.type === 'agent:list') {
      const store = await readStore();
      send(socket, {
        type: 'agent:list:result',
        requestId: message.requestId,
        user: toPublicUser(store.user),
        agents: toPublicAgents(store.agents.filter((agent) => agent.kind === 'annotation')),
      });
      return;
    }

    if (message.type === 'article:save') {
      await saveArticle(message.payload);
      logInfo('article.save', {
        requestId: message.requestId,
        articleId: message.payload.id,
        title: message.payload.title,
        annotations: message.payload.annotations.length,
      });
      return;
    }

    if (message.type === 'article:get') {
      const store = await readStore();
      const article =
        store.articles.find((item) => item.id === message.payload.id) ||
        store.articles.find(
          (item) =>
            item.canonicalUrl === message.payload.canonicalUrl ||
            item.url === message.payload.url ||
            item.url === message.payload.canonicalUrl ||
            item.canonicalUrl === message.payload.url,
        ) ||
        null;
      send(socket, { type: 'article:get:result', requestId: message.requestId, article });
      return;
    }

    if (message.type === 'agent:message') {
      const store = await readStore();
      const agent = findAgent(store.agents, message.payload.agentId, message.payload.agentUsername);
      if (!agent) throw new Error(`找不到 Agent：@${message.payload.agentUsername}`);

      const provider = store.providers.find((item) => item.id === agent.providerId);
      if (!provider) throw new Error(`Agent ${agent.nickname} 没有关联可用 provider`);

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
        pending: true,
      };

      send(socket, {
        type: 'agent:message:start',
        requestId: message.requestId,
        annotationId: message.payload.annotation.id,
        comment,
      });

      await runAgentStream(provider, agent, message.payload, (delta) => {
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
      const agent = findAgent(store.agents, message.payload.agentId, message.payload.agentUsername);
      if (!agent) throw new Error(`找不到 Agent：@${message.payload.agentUsername}`);

      const provider = store.providers.find((item) => item.id === agent.providerId);
      if (!provider) throw new Error(`Agent ${agent.nickname} 没有关联可用 provider`);

      logInfo('agent.annotate.start', {
        requestId: message.requestId,
        agent: agent.username,
        articleTitle: message.payload.article.title,
        articleChars: message.payload.article.text.length,
      });
      send(socket, {
        type: 'agent:annotate:start',
        requestId: message.requestId,
        agent: toPublicAgents([agent])[0],
      });

      await runAgentAnnotateStream(provider, agent, message.payload, (annotation) => {
        logInfo('agent.annotate.item', {
          requestId: message.requestId,
          agent: agent.username,
          annotationId: annotation.id,
          exactChars: annotation.anchor.exact.length,
          exactPreview: annotation.anchor.exact.slice(0, 80),
        });
        send(socket, { type: 'agent:annotate:item', requestId: message.requestId, annotation });
      });

      logInfo('agent.annotate.done', { requestId: message.requestId, agent: agent.username });
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
  const pairing = await getPairingInfo();
  const auth = resolveSocketAuthResult(state, verifyPairingToken(token, pairing.token));
  if (!auth.ok) {
    send(socket, { type: 'auth:result', ok: false, message: auth.message });
    socket.close(1008, auth.message);
    return;
  }

  socketStates.set(socket, auth.state);
  send(socket, { type: 'auth:result', ok: true });
  await sendStatus(socket);
}

async function sendStatus(socket: WebSocket) {
  const store = await readStore();
  send(socket, {
    type: 'status',
    ok: true,
    user: toPublicUser(store.user),
    agents: toPublicAgents(store.agents.filter((agent) => agent.kind === 'annotation')),
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

function toPublicAgents(agents: Agent[]): PublicAgent[] {
  return agents.map((agent) => ({
    id: agent.id,
    kind: agent.kind,
    nickname: agent.nickname,
    username: agent.username,
    avatar: agent.avatar,
    annotationColor: agent.annotationColor,
    annotationDensity: agent.annotationDensity,
  }));
}

function findAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return (
    agents.find((agent) => agent.id === agentId) ||
    agents.find((agent) => agent.username === username)
  );
}

function toPublicUser(user: UserProfile): UserProfile {
  return user;
}
