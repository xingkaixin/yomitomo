import type { DesktopServerMessage } from '@yomitomo/shared';
import type { DesktopBridgeContentMessage } from './desktop-bridge';

export function desktopMessageFromData(data: unknown): DesktopBridgeContentMessage {
  try {
    return {
      type: 'desktop:message',
      message: JSON.parse(String(data)) as DesktopServerMessage,
    };
  } catch {
    return { type: 'desktop:error', message: '桌面端消息格式错误' };
  }
}
