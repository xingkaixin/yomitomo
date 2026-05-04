import { browser } from 'wxt/browser';
import type { DesktopClientMessage, DesktopServerMessage } from '@yomitomo/shared';
import {
  DESKTOP_BRIDGE_PORT_NAME,
  type DesktopBridgeContentMessage,
  type DesktopBridgePortMessage,
} from '../src/desktop-bridge';

const DESKTOP_WS_URL = 'ws://127.0.0.1:43891';

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

    function connect(token: string) {
      closeSocket();

      const nextSocket = new WebSocket(DESKTOP_WS_URL);
      socket = nextSocket;

      nextSocket.addEventListener('open', () => {
        post({ type: 'desktop:open' });
        nextSocket.send(JSON.stringify({ type: 'auth', token } satisfies DesktopClientMessage));
      });

      nextSocket.addEventListener('message', (event) => {
        post({
          type: 'desktop:message',
          message: JSON.parse(String(event.data)) as DesktopServerMessage,
        });
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
        connect(message.token);
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
