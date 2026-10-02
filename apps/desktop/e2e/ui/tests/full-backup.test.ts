import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'vitest';
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

describe('complete backup migration', () => {
  it('backs up through settings and opens the restored EPUB in a fresh profile', async () => {
    const source = await createE2eRunData('full-backup-source');
    const recipient = await createE2eRunData('full-backup-recipient');
    let first: DesktopE2eApp | undefined;
    let second: DesktopE2eApp | undefined;
    try {
      const fixture = await createTinyEpubFixture(source.fixtureDir, {
        title: 'Migrated book',
        chapterText: 'This original survives a complete backup and migration.',
      });
      first = await launchDesktopE2eApp('full-backup-source', {
        runData: source,
        cleanupOnClose: false,
      });
      await openLibraryHome(first.page);
      await importEbookFileThroughLibraryUi(first.page, fixture.path);
      await openDataSettings(first);
      await resizeDesktopContent(first, { width: 1024, height: 720 });
      await first.page.screenshot({ path: join(first.artifactsDir, 'full-backup-settings.png') });
      await first.app.evaluate(({ dialog }, directory) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
      }, source.fixtureDir);
      await first.page.getByRole('button', { name: 'Create complete backup', exact: true }).click();
      await first.page.getByText('Complete backup created', { exact: true }).waitFor();
      const backupName = (await readdir(source.fixtureDir)).find((name) =>
        name.startsWith('yomitomo-backup-'),
      );
      if (!backupName) throw new Error('Complete backup not found');
      await first.close();
      first = undefined;
      second = await launchDesktopE2eApp('full-backup-recipient', {
        runData: recipient,
        cleanupOnClose: false,
      });
      await openLibraryHome(second.page);
      await openDataSettings(second);
      await second.app.evaluate(
        ({ dialog }, directory) => {
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
        },
        join(source.fixtureDir, backupName),
      );
      await second.page
        .getByRole('button', { name: 'Restore complete backup', exact: true })
        .click();
      await second.page
        .getByRole('dialog', { name: 'Restore a complete backup?' })
        .getByRole('button', { name: 'Choose backup and restore' })
        .click();
      await second.page.getByText('Complete backup restored', { exact: true }).waitFor();
      await openLibraryHome(second.page);
      await waitForLibraryDocument(second.page, 'Migrated book', 'Ebook');
      await libraryDocumentButton(second.page, 'Migrated book', 'Ebook').click();
      await second.page.locator('.source-ebook-reader-shell .ebook-page-stage.is-ready').waitFor();
    } catch (error) {
      await first?.captureFailure('failure').catch(() => undefined);
      await second?.captureFailure('failure').catch(() => undefined);
      throw error;
    } finally {
      await first?.close().catch(() => undefined);
      await second?.close().catch(() => undefined);
      await cleanupE2eData(source);
      await cleanupE2eData(recipient);
    }
  });
});

async function openDataSettings(desktop: DesktopE2eApp) {
  await desktop.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await desktop.page.getByRole('button', { name: 'Data management', exact: true }).click();
}
