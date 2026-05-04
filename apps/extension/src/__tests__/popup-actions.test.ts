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
  it('uses the manifest content script listener when it is already available', async () => {
    await toggleReaderInTab(123);

    expect(sendMessage).toHaveBeenCalledWith(123, { type: 'yomitomo:toggle' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('injects the content script when the tab has no listener yet', async () => {
    sendMessage
      .mockRejectedValueOnce(
        new Error('Could not establish connection. Receiving end does not exist.'),
      )
      .mockResolvedValueOnce({ ok: true });

    await toggleReaderInTab(123);

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 123 },
      files: ['content-scripts/content.js'],
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('surfaces content script toggle errors', async () => {
    sendMessage.mockResolvedValueOnce({ ok: false, error: 'extract failed' });

    await expect(toggleReaderInTab(123)).rejects.toThrow('extract failed');
  });
});
