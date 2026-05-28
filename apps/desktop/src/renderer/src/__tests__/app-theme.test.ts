import { describe, expect, it } from 'vitest';
import { readerThemeVariableNames } from '@yomitomo/reader-ui/reader-theme';
import {
  applyAppTheme,
  beigePaperTheme,
  beigePaperThemeId,
  defaultTheme,
  defaultThemeId,
  themeRegistry,
  themeToCssVariables,
} from '../app-theme';

describe('app theme contract', () => {
  it('registers the default and validation themes as complete AppThemes', () => {
    expect(themeRegistry[defaultThemeId]).toBe(defaultTheme);
    expect(themeRegistry[beigePaperThemeId]).toBe(beigePaperTheme);
    expect(defaultTheme.reader.paper).toBeTruthy();
    expect(beigePaperTheme.reader.paper).toBeTruthy();
    expect(defaultTheme.palette.background).toBeTruthy();
    expect(beigePaperTheme.palette.background).toBeTruthy();
    expect(defaultTheme.effect.shellBackground).toBeTruthy();
    expect(beigePaperTheme.effect.shellBackground).toBeTruthy();
  });

  it('exports app and reader css variables from each registered theme', () => {
    for (const theme of Object.values(themeRegistry)) {
      const variables = themeToCssVariables(theme);

      expect(variables['--background']).toBe(theme.palette.background);
      expect(variables['--app-shell-background']).toBe(theme.effect.shellBackground);
      expect(variables['--font-reader-serif']).toBe(theme.font.readerSerif);

      for (const name of readerThemeVariableNames) {
        expect(variables[name]).toBeTruthy();
      }
    }
  });

  it('applies the selected theme variables to a root element', () => {
    const styleValues = new Map<string, string>();
    const root = {
      dataset: {} as Record<string, string>,
      style: {
        setProperty: (name: string, value: string) => {
          styleValues.set(name, value);
        },
      },
    } as unknown as HTMLElement;

    applyAppTheme(beigePaperTheme, root);

    expect(root.dataset.theme).toBe(beigePaperThemeId);
    expect(styleValues.get('--background')).toBe(beigePaperTheme.palette.background);
    expect(styleValues.get('--app-reader-paper')).toBe(beigePaperTheme.reader.paper);
  });
});
