import { describe, expect, it } from 'vitest';
import { resizeDesktopContent, withDesktopE2eApp } from '../helpers/electron-app';
import { assertNoOverlap, assertVisibleBox } from '../helpers/layout';
import { openLibraryHome } from '../helpers/library';

describe('desktop window layout helpers', () => {
  it('resizes the real Electron content area and reads stable layout boxes', async () => {
    await withDesktopE2eApp('desktop-window-layout', async (desktopApp) => {
      await openLibraryHome(desktopApp.page);

      const compactSize = await resizeDesktopContent(desktopApp, { height: 700, width: 1_000 });
      expectSizeNear(compactSize.viewportSize, { height: 700, width: 1_000 });

      const masthead = desktopApp.page.locator('.app-masthead');
      const libraryHome = desktopApp.page.locator('.library-home');
      await assertVisibleBox(libraryHome, { minHeight: 300, minWidth: 600 });
      await assertNoOverlap(masthead, libraryHome, { tolerance: 1 });

      const wideSize = await resizeDesktopContent(desktopApp, { height: 760, width: 1_180 });
      expectSizeNear(wideSize.viewportSize, { height: 760, width: 1_180 });
      await assertVisibleBox(desktopApp.page.getByRole('button', { name: 'Add content' }), {
        minHeight: 32,
        minWidth: 32,
      });
    });
  });
});

function expectSizeNear(
  actual: { height: number; width: number },
  expected: { height: number; width: number },
) {
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(2);
}
