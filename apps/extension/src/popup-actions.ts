import { browser } from 'wxt/browser';

type ToggleResponse = { ok: true } | { ok: false; error: string } | undefined;

export async function toggleReaderInTab(tabId: number) {
  const response = await sendToggleMessage(tabId).catch(async (error: unknown) => {
    if (!isMissingContentScript(error)) throw error;

    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js'],
    });
    return sendToggleMessage(tabId);
  });

  if (response?.ok === false) throw new Error(response.error);
}

function sendToggleMessage(tabId: number) {
  return browser.tabs.sendMessage(tabId, { type: 'yomitomo:toggle' }) as Promise<ToggleResponse>;
}

function isMissingContentScript(error: unknown) {
  return errorMessage(error).includes('Receiving end does not exist');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
