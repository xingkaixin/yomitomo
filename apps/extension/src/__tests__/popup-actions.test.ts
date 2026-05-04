import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toggleReaderInTab } from '../popup-actions';

const { sendMessage, executeScript } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  executeScript: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    scripting: {
      executeScript,
    },
    tabs: {
      sendMessage,
    },
  },
}));

beforeEach(() => {
  sendMessage.mockResolvedValue(undefined);
  executeScript.mockResolvedValue(undefined);
  vi.clearAllMocks();
});

describe('toggleReaderInTab', () => {
  it('uses the manifest content script lifecycle', async () => {
    await toggleReaderInTab(123);

    expect(sendMessage).toHaveBeenCalledWith(123, { type: 'yomitomo:toggle' });
    expect(executeScript).not.toHaveBeenCalled();
  });
});
