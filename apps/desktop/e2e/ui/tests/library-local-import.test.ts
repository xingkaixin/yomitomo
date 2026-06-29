import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTextFixture } from '../../helpers/e2e-data';
import { launchDesktopE2eApp, type DesktopE2eApp } from '../helpers/electron-app';

const importedTitle = 'RD-790 Local Import';

type DesktopApiForE2e = {
  getState: () => Promise<{ settings: Record<string, unknown> }>;
  saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
};

describe('library local import', () => {
  it('imports a text fixture through the UI and persists it after restart', async () => {
    const runData = await createE2eRunData('library-local-import');
    let firstApp: DesktopE2eApp | undefined;
    let restartedApp: DesktopE2eApp | undefined;

    try {
      const fixture = await createTextFixture(runData.fixtureDir, {
        content: `---
title: ${importedTitle}
author: Yomitomo E2E
---

# Fallback Heading

This fixture verifies the local text import UI persists through restart.
`,
        fileName: 'rd-790-local-import.md',
      });

      firstApp = await launchDesktopE2eApp('library-local-import-first-run', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(firstApp.page);
      await importTextFile(firstApp.page, fixture.path);
      await waitForLibraryArticle(firstApp.page, importedTitle);

      await firstApp.close();
      firstApp = undefined;

      restartedApp = await launchDesktopE2eApp('library-local-import-restart', {
        cleanupOnClose: false,
        runData,
      });
      await openLibraryHome(restartedApp.page);
      await waitForLibraryArticle(restartedApp.page, importedTitle);
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

async function openLibraryHome(page: Page) {
  await page.evaluate(async () => {
    const desktop = (window as Window & { yomitomoDesktop?: DesktopApiForE2e }).yomitomoDesktop;
    if (!desktop) throw new Error('YOMITOMO_DESKTOP_API_UNAVAILABLE');

    const store = await desktop.getState();
    await desktop.saveSettings({
      ...store.settings,
      onboardingCompletedAt: '2026-06-29T00:00:00.000Z',
      uiLanguage: 'en',
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Add content' }).waitFor({ timeout: 15_000 });
}

async function importTextFile(page: Page, fixturePath: string) {
  await page.getByRole('button', { name: 'Add content' }).click();
  await page.locator('.library-add-menu-popover').waitFor({ timeout: 5_000 });
  await page.getByText('Text file', { exact: true }).click();
  await page.getByRole('tab', { name: 'Upload files' }).click();
  await page.locator('#library-text-import-file').setInputFiles(fixturePath);
  await page.getByRole('button', { name: 'Next' }).click();

  const dialog = page.locator('.library-text-import');
  await dialog.getByLabel('Title').fill(importedTitle);
  await dialog.getByLabel('Author').fill('Yomitomo E2E');
  await dialog.getByRole('button', { name: 'Import' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 });
}

async function waitForLibraryArticle(page: Page, title: string) {
  const openArticleButton = page.getByRole('button', { name: `Open article: ${title}` });
  await openArticleButton.waitFor({ timeout: 15_000 });
  expect(await openArticleButton.count()).toBeGreaterThan(0);
}
