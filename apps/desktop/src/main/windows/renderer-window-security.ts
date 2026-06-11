import type { BrowserWindowConstructorOptions } from 'electron';
import { mainPath } from '../app/main-paths';

type RendererWindowWebPreferences = NonNullable<BrowserWindowConstructorOptions['webPreferences']>;

export function secureRendererWebPreferences(): RendererWindowWebPreferences {
  return {
    preload: mainPath('../preload/index.cjs'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  };
}
