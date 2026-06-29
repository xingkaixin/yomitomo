import { describe, expect, it } from 'vitest';
import { probeDesktopPreload, withDesktopE2eApp } from '../helpers/electron-app';

describe('desktop UI launch', () => {
  it('starts the built Electron app with a mounted renderer', async () => {
    await withDesktopE2eApp('desktop-ui-launch', async ({ page }) => {
      const result = await probeDesktopPreload(page);

      expect(result).toMatchObject({
        hasPreloadApi: true,
        hasShowMainWindow: true,
        rootHasContent: true,
      });
      expect(result.appInfo?.desktopVersion).toEqual(expect.any(String));
    });
  });
});
