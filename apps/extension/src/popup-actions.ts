import { browser } from 'wxt/browser';

export async function toggleReaderInTab(tabId: number) {
  await browser.tabs.sendMessage(tabId, { type: 'yomitomo:toggle' });
}
