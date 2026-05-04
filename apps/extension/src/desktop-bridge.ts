import type { DesktopClientMessage, DesktopServerMessage } from '@yomitomo/shared';

export const DESKTOP_BRIDGE_PORT_NAME = 'yomitomo-desktop';

export type DesktopBridge = {
  readyState: number;
  send: (message: DesktopClientMessage) => void;
  close: () => void;
};

export type DesktopBridgePortMessage =
  | { type: 'desktop:connect'; token: string }
  | { type: 'desktop:send'; message: DesktopClientMessage }
  | { type: 'desktop:disconnect' };

export type DesktopBridgeContentMessage =
  | { type: 'desktop:open' }
  | { type: 'desktop:message'; message: DesktopServerMessage }
  | { type: 'desktop:close' }
  | { type: 'desktop:error'; message: string };
