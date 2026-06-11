import { describe, expect, it } from 'vitest';
import { secureRendererWebPreferences } from './renderer-window-security';

describe('renderer window security', () => {
  it('keeps app renderer windows sandboxed behind the preload bridge', () => {
    const preferences = secureRendererWebPreferences();

    expect(preferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    expect(preferences.preload).toMatch(/preload[/\\]index\.cjs$/);
  });
});
