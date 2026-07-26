import { describe, expect, it } from 'vitest';
import { withDesktopE2eApp } from '../helpers/electron-app';
import { openLibraryHome } from '../helpers/library';

const singleLineSettingLabels = [
  'Interface language',
  'Bilingual translation target language',
  'Enable app sound effects',
  'Sound effect volume',
] as const;

describe('settings row alignment', () => {
  it('centers single-line general setting content', async () => {
    await withDesktopE2eApp('settings-row-alignment', async ({ page }) => {
      await openLibraryHome(page);
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.locator('.settings-shell').waitFor();

      const offsets = await Promise.all(
        singleLineSettingLabels.map(async (label) => {
          const control = page.getByLabel(label).first();
          const centers = await control.evaluate((element) => {
            const row = element.closest('.settings-row');
            const copy = row?.querySelector('.settings-row-copy');
            const rowControl = row?.querySelector('.settings-row-control');
            if (!copy || !rowControl) throw new Error('SETTINGS_ROW_LAYOUT_UNAVAILABLE');

            const copyBox = copy.getBoundingClientRect();
            const controlBox = rowControl.getBoundingClientRect();
            return {
              control: controlBox.top + controlBox.height / 2,
              copy: copyBox.top + copyBox.height / 2,
            };
          });
          return { label, offset: centers.copy - centers.control };
        }),
      );

      console.info('general settings row center offsets', offsets);
      for (const { offset } of offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(2);
    });
  });
});
