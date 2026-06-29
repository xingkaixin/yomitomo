import type { Page } from 'playwright-core';

type DesktopApiForE2e = {
  getState: () => Promise<{ settings: Record<string, unknown> }>;
  saveSettings: (settings: Record<string, unknown>) => Promise<unknown>;
};

type TextImportOptions = {
  author?: string;
  title: string;
};

export async function openLibraryHome(page: Page) {
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

export async function importTextFileThroughLibraryUi(
  page: Page,
  fixturePath: string,
  options: TextImportOptions,
) {
  await page.getByRole('button', { name: 'Add content' }).click();
  await page.locator('.library-add-menu-popover').waitFor({ timeout: 5_000 });
  await page.getByText('Text file', { exact: true }).click();
  await page.getByRole('tab', { name: 'Upload files' }).click();
  await page.locator('#library-text-import-file').setInputFiles(fixturePath);
  await page.getByRole('button', { name: 'Next' }).click();

  const dialog = page.locator('.library-text-import');
  await dialog.getByLabel('Title').fill(options.title);
  if (options.author) await dialog.getByLabel('Author').fill(options.author);
  await dialog.getByRole('button', { name: 'Import' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 });
}

export async function importEbookFileThroughLibraryUi(page: Page, fixturePath: string) {
  await page.getByRole('button', { name: 'Add content' }).click();
  await page.locator('.library-add-menu-popover').waitFor({ timeout: 5_000 });
  await page.getByText('Ebook file', { exact: true }).click();

  const dialog = page.locator('.library-import-dialog');
  await dialog.getByText('Add ebook', { exact: true }).waitFor({ timeout: 5_000 });
  await page.locator('#library-ebook-file').setInputFiles(fixturePath);
  await dialog.getByText('Import complete', { exact: true }).waitFor({ timeout: 15_000 });
  await dialog.getByRole('button', { name: 'Close ebook import' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 });
}

export async function importPdfFileThroughLibraryUi(page: Page, fixturePath: string) {
  await page.getByRole('button', { name: 'Add content' }).click();
  await page.locator('.library-add-menu-popover').waitFor({ timeout: 5_000 });
  await page.getByText('PDF document', { exact: true }).click();

  const dialog = page.locator('.library-import-dialog');
  await dialog.getByText('Add PDF document', { exact: true }).waitFor({ timeout: 5_000 });
  await page.locator('#library-pdf-file').setInputFiles(fixturePath);
  await dialog.getByText('Import complete', { exact: true }).waitFor({ timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Close PDF import' }).click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 });
}

export async function waitForLibraryArticle(page: Page, title: string) {
  const openArticleButton = libraryArticleButton(page, title);
  await openArticleButton.waitFor({ timeout: 15_000 });
}

export async function waitForLibraryDocument(page: Page, title: string, type: string) {
  const openDocumentButton = libraryDocumentButton(page, title, type);
  await openDocumentButton.waitFor({ timeout: 15_000 });
}

export function libraryArticleButton(page: Page, title: string) {
  return page.getByRole('button', { name: `Open article: ${title}` });
}

export function libraryDocumentButton(page: Page, title: string, type: string) {
  return page.getByRole('button', { name: `Open ${type}: ${title}` });
}
