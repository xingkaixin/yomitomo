import type { Frame, Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTinyEpubFixture } from '../../helpers/e2e-data';
import {
  launchDesktopE2eApp,
  resizeDesktopContent,
  type DesktopE2eApp,
} from '../helpers/electron-app';
import {
  importEbookFileThroughLibraryUi,
  libraryDocumentButton,
  openLibraryHome,
  waitForLibraryDocument,
} from '../helpers/library';

const ebookTitle = 'RD-813 EPUB Translation';
const ebookChapterText =
  'RD-813 keeps the original EPUB paragraph stable while a chapter translation is displayed.';
const fakeProviderBaseUrl = 'https://e2e.invalid/yomitomo-ai';
const translatedTextPrefix = 'RD-813 translation:';

type DesktopApiForEbookTranslationE2e = {
  saveProvider: (provider: Record<string, unknown>) => Promise<{
    providers: Array<{ id: string; name: string }>;
    settings: Record<string, unknown>;
  }>;
  saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
};

describe('ebook bilingual translation', () => {
  it('translates the current EPUB chapter and restores it after restart', async () => {
    const runData = await createE2eRunData('ebook-translation');
    let firstApp: DesktopE2eApp | undefined;
    let restartedApp: DesktopE2eApp | undefined;

    try {
      const fixture = await createTinyEpubFixture(runData.fixtureDir, {
        chapterText: ebookChapterText,
        creator: 'Yomitomo E2E',
        fileName: 'rd-813-epub-translation.epub',
        title: ebookTitle,
      });
      firstApp = await launchDesktopE2eApp('ebook-translation-first-run', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(firstApp.page);
      await configureTranslationProvider(firstApp.page);
      await setResponsiveReaderSettings(firstApp.page);
      await importEbookFileThroughLibraryUi(firstApp.page, fixture.path);
      await waitForLibraryDocument(firstApp.page, ebookTitle, 'Ebook');
      await openEbookReader(firstApp.page);

      await firstApp.page.getByRole('button', { name: 'Translate current chapter' }).click();
      const confirmation = firstApp.page.locator('.reader-translation-confirm');
      await confirmation.getByText('Translate this chapter?', { exact: true }).waitFor();
      await confirmation.getByRole('button', { name: 'Start translation' }).click();
      await waitForTranslatedChapter(firstApp.page);
      await assertSourceAndTranslationSelection(firstApp.page);

      await resizeDesktopContent(firstApp, { height: 860, width: 1_640 }, { settleMs: 220 });
      await waitForSpreadLayout(firstApp.page, true);
      await waitForTranslatedChapter(firstApp.page);
      await resizeDesktopContent(firstApp, { height: 700, width: 1_000 }, { settleMs: 220 });
      await waitForSpreadLayout(firstApp.page, false);
      await waitForTranslatedChapter(firstApp.page);

      await firstApp.close();
      firstApp = undefined;

      restartedApp = await launchDesktopE2eApp('ebook-translation-restart', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(restartedApp.page);
      await openEbookReader(restartedApp.page);
      await waitForTranslatedChapter(restartedApp.page);
      await restartedApp.page
        .getByRole('button', { name: 'Hide chapter translation' })
        .waitFor({ timeout: 15_000 });
    } catch (error) {
      await firstApp?.captureFailure('failure').catch(() => undefined);
      await restartedApp?.captureFailure('failure').catch(() => undefined);
      throw error;
    } finally {
      await restartedApp?.close().catch(() => undefined);
      await firstApp?.close().catch(() => undefined);
      await cleanupE2eData(runData);
    }
  });
});

async function configureTranslationProvider(page: Page) {
  await page.evaluate(
    async ({ baseUrl }) => {
      const desktop = (window as Window & { yomitomoDesktop?: DesktopApiForEbookTranslationE2e })
        .yomitomoDesktop;
      if (!desktop) throw new Error('YOMITOMO_DESKTOP_API_UNAVAILABLE');
      const store = await desktop.saveProvider({
        apiKey: 'rd-813-e2e-key',
        baseUrl,
        modelInputMode: 'custom',
        modelName: 'rd-813-fake-model',
        name: 'RD-813 Fake Translation Provider',
        type: 'openai-chat',
      });
      const provider = store.providers.find(
        (item) => item.name === 'RD-813 Fake Translation Provider',
      );
      if (!provider) throw new Error('RD_813_FAKE_PROVIDER_NOT_SAVED');
      await desktop.saveSettings({
        ...store.settings,
        bilingualTranslationProviderId: provider.id,
        bilingualTranslationTargetLanguage: 'zh-CN',
      });
    },
    { baseUrl: fakeProviderBaseUrl },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add content' }).waitFor({ timeout: 15_000 });
}

async function setResponsiveReaderSettings(page: Page) {
  await page.evaluate(() => {
    window.localStorage.setItem(
      'yomitomo.desktop.readerSettings',
      JSON.stringify({ backgroundColor: '#fffdf8', contentWidth: 600, fontSize: 18 }),
    );
  });
}

async function openEbookReader(page: Page) {
  await libraryDocumentButton(page, ebookTitle, 'Ebook').click();
  await page.getByRole('button', { name: 'Back to library' }).waitFor({ timeout: 15_000 });
  await page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor({
    timeout: 15_000,
  });
  await page
    .getByRole('button', { name: 'Translate current chapter' })
    .waitFor({
      timeout: 15_000,
    })
    .catch(async () => {
      await page.getByRole('button', { name: 'Hide chapter translation' }).waitFor({
        timeout: 15_000,
      });
    });
}

async function waitForTranslatedChapter(page: Page) {
  const frame = await currentEbookFrame(page);
  await frame
    .locator('.reader-bilingual-translation')
    .filter({ hasText: translatedTextPrefix })
    .first()
    .waitFor({ timeout: 15_000 });
}

async function assertSourceAndTranslationSelection(page: Page) {
  const frame = await currentEbookFrame(page);
  const snapshot = await frame.evaluate((sourceText) => {
    const source = Array.from(document.querySelectorAll('p')).find((element) =>
      element.textContent?.includes(sourceText),
    );
    const translation = document.querySelector<HTMLElement>('[data-reader-translation]');
    if (!source || !translation) throw new Error('RD_813_TRANSLATION_DOM_UNAVAILABLE');
    return {
      sourceText: source.textContent,
      sourceUserSelect: getComputedStyle(source).userSelect,
      translationUserSelect: getComputedStyle(translation).userSelect,
    };
  }, ebookChapterText);
  expect(snapshot.sourceText).toBe(ebookChapterText);
  expect(snapshot.sourceUserSelect).not.toBe('none');
  expect(snapshot.translationUserSelect).toBe('none');
}

async function waitForSpreadLayout(page: Page, spread: boolean) {
  await page.waitForFunction(
    (expectedSpread) =>
      document
        .querySelector('.source-ebook-reader-shell')
        ?.classList.contains('is-ebook-spread') === expectedSpread,
    spread,
    { timeout: 15_000 },
  );
}

async function currentEbookFrame(page: Page): Promise<Frame> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames().slice(1)) {
      const snapshot = await frame
        .evaluate(() => {
          const frameElement = window.frameElement;
          const rect = frameElement?.getBoundingClientRect();
          return {
            text: document.body?.innerText ?? '',
            visible: Boolean(rect && rect.width > 0 && rect.height > 0),
          };
        })
        .catch(() => null);
      if (snapshot?.visible && snapshot.text.includes(ebookChapterText)) return frame;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('RD_813_EPUB_FRAME_UNAVAILABLE');
}
