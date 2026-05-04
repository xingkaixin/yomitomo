import { describe, expect, it } from 'vitest';
import { desktopMessageFromData } from '../background-bridge';

describe('desktopMessageFromData', () => {
  it('wraps valid desktop messages for content scripts', () => {
    expect(desktopMessageFromData(JSON.stringify({ type: 'auth:result', ok: true }))).toEqual({
      type: 'desktop:message',
      message: { type: 'auth:result', ok: true },
    });
  });

  it('returns a structured bridge error for malformed desktop messages', () => {
    expect(desktopMessageFromData('{')).toEqual({
      type: 'desktop:error',
      message: '桌面端消息格式错误',
    });
  });
});
