import type { Page } from 'playwright-core';
import { describe, it } from 'vitest';
import { createTextFixture } from '../../helpers/e2e-data';
import { withDesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  libraryArticleButton,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const fakeProviderBaseUrl = 'https://e2e.invalid/yomitomo-ai';
const fakeProviderName = 'RD-795 Fake AI Provider';
const fakeResponsePrefix = 'RD-795 fake AI response.';
const readerAiTitle = 'RD-795 Reader AI';
const readerAiAuthor = 'Yomitomo E2E';
const readerAiQuote = 'Reader AI E2E asks about this stable selected sentence.';
const readerAiQuestion = 'What is important about this selection?';

type DesktopApiForReaderAiE2e = {
  saveProvider: (provider: Record<string, unknown>) => Promise<{
    providers: Array<{ id: string; name: string }>;
    settings: Record<string, unknown>;
  }>;
  saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
};

describe('reader AI', () => {
  it('answers selected text through the desktop E2E fake provider', async () => {
    await withDesktopE2eApp('reader-ai', async ({ fixtureDir, page }) => {
      const fixture = await createTextFixture(fixtureDir, {
        content: `---
title: ${readerAiTitle}
author: ${readerAiAuthor}
---

# Reader AI Entry

${readerAiQuote}

This second sentence keeps the reader surface stable for selection and chat.
`,
        fileName: 'rd-795-reader-ai.md',
      });

      await openLibraryHome(page);
      await configureReaderAiFakeProvider(page);
      await importTextFileThroughLibraryUi(page, fixture.path, {
        author: readerAiAuthor,
        title: readerAiTitle,
      });
      await waitForLibraryArticle(page, readerAiTitle);

      await openReaderArticle(page, readerAiTitle);
      await selectReaderQuote(page, readerAiQuote);
      await page
        .locator('.reader-selection-menu')
        .getByRole('button', { name: /Ask/ })
        .waitFor({ timeout: 15_000 });
      await page.keyboard.press('q');

      const chatPanel = page.locator('.reader-chat-panel');
      await chatPanel.waitFor({ timeout: 15_000 });
      await chatPanel.getByText(readerAiQuote, { exact: true }).waitFor({ timeout: 15_000 });
      await chatPanel.getByLabel('Reader Q&A content').fill(readerAiQuestion);
      await chatPanel.getByRole('button', { name: 'Send' }).click();

      const assistantMessage = chatPanel
        .locator('.reader-chat-message.is-assistant')
        .filter({ hasText: fakeResponsePrefix });
      await assistantMessage.waitFor({ timeout: 15_000 });
      await assistantMessage.getByText(readerAiQuote).waitFor({ timeout: 15_000 });
      await assistantMessage.getByText(readerAiQuestion).waitFor({ timeout: 15_000 });
    });
  });
});

async function configureReaderAiFakeProvider(page: Page) {
  await page.evaluate(
    async ({ baseUrl, providerName }) => {
      const desktop = (window as Window & { yomitomoDesktop?: DesktopApiForReaderAiE2e })
        .yomitomoDesktop;
      if (!desktop) throw new Error('YOMITOMO_DESKTOP_API_UNAVAILABLE');

      const store = await desktop.saveProvider({
        baseUrl,
        modelInputMode: 'custom',
        modelName: 'rd-795-fake-model',
        name: providerName,
        type: 'openai-chat',
      });
      const provider = store.providers.find((item) => item.name === providerName);
      if (!provider) throw new Error('RD_795_FAKE_PROVIDER_NOT_SAVED');

      await desktop.saveSettings({
        ...store.settings,
        assistantExecutionMode: 'fast_response',
        defaultProviderId: provider.id,
        readingAssistantProviderId: provider.id,
      });
    },
    { baseUrl: fakeProviderBaseUrl, providerName: fakeProviderName },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add content' }).waitFor({ timeout: 15_000 });
}

async function openReaderArticle(page: Page, title: string) {
  await libraryArticleButton(page, title).click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.reader-toolbar').getByText(title, { exact: true }).waitFor({
    timeout: 15_000,
  });
}

async function selectReaderQuote(page: Page, quote: string) {
  await page.evaluate((selectedQuote) => {
    const article = document.querySelector<HTMLElement>('.reader-article');
    const surface = document.querySelector<HTMLElement>('.reader-surface');
    if (!article || !surface) throw new Error('READER_SELECTION_SURFACE_UNAVAILABLE');

    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    let startOffset = -1;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      startOffset = node.data.indexOf(selectedQuote);
      if (startOffset >= 0) {
        textNode = node;
        break;
      }
    }
    if (!textNode) throw new Error(`READER_SELECTION_TEXT_NOT_FOUND: ${selectedQuote}`);

    const range = document.createRange();
    range.setStart(textNode, startOffset);
    range.setEnd(textNode, startOffset + selectedQuote.length);
    const selection = window.getSelection();
    if (!selection) throw new Error('READER_SELECTION_UNAVAILABLE');
    selection.removeAllRanges();
    selection.addRange(range);

    const rects = range.getClientRects();
    const rect = rects[rects.length - 1] || range.getBoundingClientRect();
    surface.dispatchEvent(
      new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        clientX: Math.max(rect.left, rect.right - 1),
        clientY: Math.max(rect.top, rect.bottom - 1),
        view: window,
      }),
    );
  }, quote);

  await page.locator('.reader-selection-menu').waitFor({ timeout: 15_000 });
}
