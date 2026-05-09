import type { DesktopClientMessage } from '@yomitomo/shared';

export const UNAUTHENTICATED_MESSAGE = '请先在扩展端输入桌面端配对码';

export type DesktopSocketAuthState = {
  authenticated: boolean;
  originAllowed: boolean;
  extensionVersion?: string;
};

export function authorizeDesktopClientMessage(
  state: DesktopSocketAuthState | undefined,
  message: DesktopClientMessage,
): { ok: true } | { ok: false; requestId?: string; message: string } {
  if (message.type === 'auth' || state?.authenticated) return { ok: true };

  return {
    ok: false,
    requestId: 'requestId' in message ? message.requestId : undefined,
    message: UNAUTHENTICATED_MESSAGE,
  };
}

export function resolveSocketAuthResult(
  state: DesktopSocketAuthState | undefined,
  tokenMatches: boolean,
): { ok: true; state: DesktopSocketAuthState } | { ok: false; message: string } {
  if (!state?.originAllowed) return { ok: false, message: 'WebSocket Origin 未被允许' };
  if (!tokenMatches) return { ok: false, message: '配对码无效' };
  return { ok: true, state: { ...state, authenticated: true } };
}
