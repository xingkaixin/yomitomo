import { describe, expect, it } from 'vitest';
import { probeDesktopPreload, withDesktopE2eApp } from '../helpers/electron-app';

describe('desktop UI launch', () => {
  it('starts the built Electron app with a mounted renderer', async () => {
    await withDesktopE2eApp('desktop-ui-launch', async ({ app, page, userDataDir }) => {
      const result = await probeDesktopPreload(page);
      const actualUserDataDir = await app.evaluate(({ app: electronApp }) =>
        electronApp.getPath('userData'),
      );

      expect(result).toMatchObject({
        hasPreloadApi: true,
        hasRendererSurface: true,
        hasShowMainWindow: true,
      });
      expect(result.appInfo?.desktopVersion).toEqual(expect.any(String));
      expect(actualUserDataDir).toBe(userDataDir);
    });
  });
});
