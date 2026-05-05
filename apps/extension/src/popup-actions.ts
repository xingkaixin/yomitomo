import { browser } from 'wxt/browser';
import type { ArticlePreview } from './article-extraction';

type ToggleResponse = { ok: true } | { ok: false; error: string } | undefined;
type PreviewResponse =
  | { ok: true; article: ArticlePreview }
  | { ok: false; error: string }
  | undefined;

export async function toggleReaderInTab(tabId: number) {
  const response = await sendMessageWithContentScript(tabId, { type: 'yomitomo:toggle' });

  if (response?.ok === false) throw new Error(response.error);
}

export async function getArticlePreviewInTab(tabId: number) {
  const response = await sendMessageWithContentScript(tabId, {
    type: 'yomitomo:article-preview',
  });

  if (response?.ok === false) throw new Error(response.error);
  if (!response || !('article' in response)) throw new Error('未检测到正文');
  return response.article;
}

async function sendMessageWithContentScript(
  tabId: number,
  message: { type: 'yomitomo:toggle' },
): Promise<ToggleResponse>;
async function sendMessageWithContentScript(
  tabId: number,
  message: { type: 'yomitomo:article-preview' },
): Promise<PreviewResponse>;
async function sendMessageWithContentScript(
  tabId: number,
  message: { type: 'yomitomo:toggle' } | { type: 'yomitomo:article-preview' },
) {
  return sendRuntimeMessage(tabId, message).catch(async (error: unknown) => {
    if (!isMissingContentScript(error)) throw error;

    await browser.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/content.js'],
    });
    return sendRuntimeMessage(tabId, message);
  });
}

function sendRuntimeMessage(
  tabId: number,
  message: { type: 'yomitomo:toggle' } | { type: 'yomitomo:article-preview' },
) {
  return browser.tabs.sendMessage(tabId, message) as Promise<ToggleResponse | PreviewResponse>;
}

function isMissingContentScript(error: unknown) {
  return errorMessage(error).includes('Receiving end does not exist');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
