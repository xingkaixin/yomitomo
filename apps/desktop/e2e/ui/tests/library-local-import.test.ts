import { describe, it } from 'vitest';
import { cleanupE2eData, createE2eRunData, createTextFixture } from '../../helpers/e2e-data';
import { launchDesktopE2eApp, type DesktopE2eApp } from '../helpers/electron-app';
import {
  importTextFileThroughLibraryUi,
  openLibraryHome,
  waitForLibraryArticle,
} from '../helpers/library';

const importedTitle = 'RD-790 Local Import';

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
      await importTextFileThroughLibraryUi(firstApp.page, fixture.path, {
        author: 'Yomitomo E2E',
        title: importedTitle,
      });
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
