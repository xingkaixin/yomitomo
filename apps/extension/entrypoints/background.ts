import { browser } from 'wxt/browser';
import type { DesktopClientMessage } from '@yomitomo/shared';
import {
  DESKTOP_BRIDGE_PORT_NAME,
  type DesktopBridgeContentMessage,
  type DesktopBridgePortMessage,
} from '../src/desktop-bridge';
import { desktopMessageFromData } from '../src/background-bridge';

const DESKTOP_WS_URL = 'ws://127.0.0.1:43891';
const DESKTOP_HEALTH_URL = 'http://127.0.0.1:43891/health';
const DESKTOP_HEALTH_TIMEOUT_MS = 800;

export default defineBackground(() => {
  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== DESKTOP_BRIDGE_PORT_NAME) return;

    let socket: WebSocket | null = null;
    let portAlive = true;

    function post(message: DesktopBridgeContentMessage) {
      if (!portAlive) return;
      port.postMessage(message);
    }

    function closeSocket() {
      socket?.close();
      socket = null;
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
      });

      nextSocket.addEventListener('message', (event) => {
        post(desktopMessageFromData(event.data));
      });

      nextSocket.addEventListener('close', () => {
        if (socket === nextSocket) socket = null;
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
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message.message));
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
