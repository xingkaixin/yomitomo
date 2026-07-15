import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const builderConfig = require('../../../electron-builder.config.cjs') as {
  npmRebuild?: boolean;
  publish?: Array<{ provider?: string; url?: string }>;
};

describe('electron builder config', () => {
  it('uses the Cloudflare generic feed for auto updates', () => {
    expect(builderConfig.publish?.[0]).toMatchObject({
      provider: 'generic',
      url: 'https://download.yomitomo.app/updates/',
    });
  });

  it('does not rebuild dependencies after the verified native build step', () => {
    expect(builderConfig.npmRebuild).toBe(false);
  });
});
