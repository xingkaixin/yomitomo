import { createServer, type Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { Agent, DesktopClientMessage, DesktopServerMessage, PublicAgent, UserProfile } from "@yomitomo/shared";
import { makeId } from "@yomitomo/shared";
import { readStore } from "./store";
import { runAgentAnnotateStream, runAgentStream } from "./llm";
import { logError, logInfo } from "./logger";

const PORT = 43891;

let httpServer: Server | null = null;
let wsServer: WebSocketServer | null = null;

export async function startLocalServer() {
  if (httpServer) return;

  httpServer = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  wsServer = new WebSocketServer({ server: httpServer });
  wsServer.on("connection", (socket) => {
    logInfo("ws.connection");
    void sendStatus(socket);

    socket.on("message", (raw) => {
      void handleMessage(socket, raw.toString());
    });

    socket.on("close", (code, reason) => {
      logInfo("ws.close", { code, reason: reason.toString() });
    });
  });

  httpServer.listen(PORT, "127.0.0.1");
  logInfo("server.listen", { port: PORT });
}

export function broadcastStatus() {
  wsServer?.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      void sendStatus(client);
    }
  });
}

async function handleMessage(socket: WebSocket, raw: string) {
  let requestId: string | undefined;
  try {
    const message = JSON.parse(raw) as DesktopClientMessage;
    requestId = "requestId" in message ? message.requestId : undefined;
    logInfo("ws.message", { type: message.type, requestId });

    if (message.type === "hello") {
      await sendStatus(socket);
      return;
    }

    if (message.type === "agent:list") {
      const store = await readStore();
      send(socket, { type: "agent:list:result", requestId: message.requestId, user: toPublicUser(store.user), agents: toPublicAgents(store.agents) });
      return;
    }

    if (message.type === "agent:message") {
      const store = await readStore();
      const agent = findAgent(store.agents, message.payload.agentId, message.payload.agentUsername);
      if (!agent) throw new Error(`找不到 Agent：@${message.payload.agentUsername}`);

      const provider = store.providers.find((item) => item.id === agent.providerId);
      if (!provider) throw new Error(`Agent ${agent.nickname} 没有关联可用 provider`);

      const comment = {
        id: makeId("comment"),
        author: "ai" as const,
        content: "",
        createdAt: new Date().toISOString(),
        agentId: agent.id,
        agentUsername: agent.username,
        agentNickname: agent.nickname,
        agentAvatar: agent.avatar,
        agentAnnotationColor: agent.annotationColor,
        pending: true
      };

      send(socket, {
        type: "agent:message:start",
        requestId: message.requestId,
        annotationId: message.payload.annotation.id,
        comment
      });

      await runAgentStream(provider, agent, message.payload, (delta) => {
        send(socket, {
          type: "agent:message:delta",
          requestId: message.requestId,
          annotationId: message.payload.annotation.id,
          commentId: comment.id,
          delta
        });
      });

      send(socket, {
        type: "agent:message:done",
        requestId: message.requestId,
        annotationId: message.payload.annotation.id,
        commentId: comment.id
      });
      return;
    }

    if (message.type === "agent:annotate") {
      const store = await readStore();
      const agent = findAgent(store.agents, message.payload.agentId, message.payload.agentUsername);
      if (!agent) throw new Error(`找不到 Agent：@${message.payload.agentUsername}`);

      const provider = store.providers.find((item) => item.id === agent.providerId);
      if (!provider) throw new Error(`Agent ${agent.nickname} 没有关联可用 provider`);

      logInfo("agent.annotate.start", {
        requestId: message.requestId,
        agent: agent.username,
        articleTitle: message.payload.article.title,
        articleChars: message.payload.article.text.length
      });
      send(socket, {
        type: "agent:annotate:start",
        requestId: message.requestId,
        agent: toPublicAgents([agent])[0]
      });

      await runAgentAnnotateStream(provider, agent, message.payload, (annotation) => {
        logInfo("agent.annotate.item", {
          requestId: message.requestId,
          agent: agent.username,
          annotationId: annotation.id,
          exactChars: annotation.anchor.exact.length,
          exactPreview: annotation.anchor.exact.slice(0, 80)
        });
        send(socket, { type: "agent:annotate:item", requestId: message.requestId, annotation });
      });

      logInfo("agent.annotate.done", { requestId: message.requestId, agent: agent.username });
      send(socket, { type: "agent:annotate:done", requestId: message.requestId });
      return;
    }
  } catch (error) {
    logError("ws.message.error", error, { requestId });
    send(socket, { type: "error", requestId, message: error instanceof Error ? error.message : "本地服务处理失败" });
  }
}

async function sendStatus(socket: WebSocket) {
  const store = await readStore();
  send(socket, { type: "status", ok: true, user: toPublicUser(store.user), agents: toPublicAgents(store.agents) });
}

function send(socket: WebSocket, message: DesktopServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    logInfo("ws.send.drop", { type: message.type, requestId: "requestId" in message ? message.requestId : undefined, readyState: socket.readyState });
  }
}

function toPublicAgents(agents: Agent[]): PublicAgent[] {
  return agents.map((agent) => ({
    id: agent.id,
    nickname: agent.nickname,
    username: agent.username,
    avatar: agent.avatar,
    annotationColor: agent.annotationColor
  }));
}

function findAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents.find((agent) => agent.id === agentId) || agents.find((agent) => agent.username === username);
}

function toPublicUser(user: UserProfile): UserProfile {
  return user;
}
