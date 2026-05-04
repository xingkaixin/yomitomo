import { describe, expect, it } from 'vitest';
import type { DesktopClientMessage } from '@yomitomo/shared';
import { authorizeDesktopClientMessage, resolveSocketAuthResult } from './server-auth';

describe('desktop websocket auth', () => {
  it('blocks business messages before auth', () => {
    const message: DesktopClientMessage = { type: 'agent:list', requestId: 'request-1' };

    expect(
      authorizeDesktopClientMessage({ authenticated: false, originAllowed: true }, message),
    ).toEqual({
      ok: false,
      requestId: 'request-1',
      message: '请先在扩展端输入桌面端配对码',
    });
  });

  it('allows auth and authenticated business messages', () => {
    expect(
      authorizeDesktopClientMessage(
        { authenticated: false, originAllowed: true },
        { type: 'auth', token: 'token' },
      ),
    ).toEqual({ ok: true });

    expect(
      authorizeDesktopClientMessage(
        { authenticated: true, originAllowed: true },
        { type: 'agent:list', requestId: 'request-1' },
      ),
    ).toEqual({ ok: true });
  });

  it('rejects invalid origins and tokens', () => {
    expect(resolveSocketAuthResult({ authenticated: false, originAllowed: false }, true)).toEqual({
      ok: false,
      message: 'WebSocket Origin 未被允许',
    });

    expect(resolveSocketAuthResult({ authenticated: false, originAllowed: true }, false)).toEqual({
      ok: false,
      message: '配对码无效',
    });
  });

  it('marks a socket authenticated after a valid token', () => {
    expect(resolveSocketAuthResult({ authenticated: false, originAllowed: true }, true)).toEqual({
      ok: true,
      state: { authenticated: true, originAllowed: true },
    });
  });
});
