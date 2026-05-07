import { browser } from 'wxt/browser';
import type { DesktopClientMessage } from '@yomitomo/shared';
import {
  DESKTOP_BRIDGE_PORT_NAME,
  type DesktopBridgeContentMessage,
  type DesktopBridgePortMessage,
} from '../src/desktop-bridge';
import {
  ARTICLE_IMAGE_FETCH_MESSAGE_TYPE,
  type ArticleImageFetchMessage,
  articleImageFetchResponse,
  desktopMessageFromData,
} from '../src/background-bridge';

const DESKTOP_WS_URL = 'ws://127.0.0.1:43891';
const DESKTOP_HEALTH_URL = 'http://127.0.0.1:43891/health';
const DESKTOP_HEALTH_TIMEOUT_MS = 800;
const DESKTOP_KEEPALIVE_INTERVAL_MS = 20_000;

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isArticleImageFetchMessage(message)) return undefined;
    return articleImageFetchResponse(message.url);
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== DESKTOP_BRIDGE_PORT_NAME) return;

    let socket: WebSocket | null = null;
    let portAlive = true;
    let keepAliveTimer = 0;

    function post(message: DesktopBridgeContentMessage) {
      if (!portAlive) return;
      port.postMessage(message);
    }

    function closeSocket() {
      clearKeepAlive();
      socket?.close();
      socket = null;
    }

    function clearKeepAlive() {
      if (!keepAliveTimer) return;
      clearInterval(keepAliveTimer);
      keepAliveTimer = 0;
    }

    function keepAlive(nextSocket: WebSocket) {
      clearKeepAlive();
      keepAliveTimer = setInterval(() => {
        if (socket !== nextSocket || nextSocket.readyState !== WebSocket.OPEN) {
          clearKeepAlive();
          return;
        }

        try {
          nextSocket.send(JSON.stringify({ type: 'ping' } satisfies DesktopClientMessage));
        } catch {
          clearKeepAlive();
        }
      }, DESKTOP_KEEPALIVE_INTERVAL_MS);
    }

    async function connect(token: string) {
      closeSocket();
      if (!(await isDesktopAvailable())) {
        post({ type: 'desktop:close' });
        return;
      }
      if (!portAlive) return;

      const nextSocket = new WebSocket(DESKTOP_WS_URL);
      socket = nextSocket;

      nextSocket.addEventListener('open', () => {
        post({ type: 'desktop:open' });
        nextSocket.send(JSON.stringify({ type: 'auth', token } satisfies DesktopClientMessage));
        keepAlive(nextSocket);
      });

      nextSocket.addEventListener('message', (event) => {
        post(desktopMessageFromData(event.data));
      });

      nextSocket.addEventListener('close', () => {
        if (socket === nextSocket) socket = null;
        clearKeepAlive();
        post({ type: 'desktop:close' });
      });

      nextSocket.addEventListener('error', () => {
        post({ type: 'desktop:error', message: '桌面端连接失败' });
      });
    }

    port.onMessage.addListener((message: DesktopBridgePortMessage) => {
      if (message.type === 'desktop:connect') {
        void connect(message.token);
        return;
      }

      if (message.type === 'desktop:send') {
        if (socket?.readyState !== WebSocket.OPEN) {
          post({ type: 'desktop:send:failed', message: message.message });
          return;
        }

        try {
          socket.send(JSON.stringify(message.message));
        } catch {
          post({ type: 'desktop:send:failed', message: message.message });
        }
        return;
      }

      if (message.type === 'desktop:disconnect') closeSocket();
    });

    port.onDisconnect.addListener(() => {
      portAlive = false;
      closeSocket();
    });
  });
});

function isArticleImageFetchMessage(message: unknown): message is ArticleImageFetchMessage {
  return (
    !!message &&
    typeof message === 'object' &&
    (message as { type?: unknown }).type === ARTICLE_IMAGE_FETCH_MESSAGE_TYPE &&
    typeof (message as { url?: unknown }).url === 'string'
  );
}

async function isDesktopAvailable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DESKTOP_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(DESKTOP_HEALTH_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
