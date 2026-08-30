import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const builderConfig = require('../../../electron-builder.config.cjs') as {
  npmRebuild?: boolean;
  files?: string[];
  asarUnpack?: string[];
  mac?: { files?: string[] };
  win?: { files?: string[] };
  publish?: Array<{ provider?: string; url?: string; useMultipleRangeRequest?: boolean }>;
};

describe('electron builder config', () => {
  it('uses the Cloudflare generic feed for auto updates', () => {
    expect(builderConfig.publish?.[0]).toMatchObject({
      provider: 'generic',
      url: 'https://download.yomitomo.app/updates/',
      useMultipleRangeRequest: false,
    });
  });

  it('does not rebuild dependencies after the verified native build step', () => {
    expect(builderConfig.npmRebuild).toBe(false);
  });

  it('unpacks only the native embedding runtime directories', () => {
    expect(builderConfig.asarUnpack).toEqual(
      expect.arrayContaining([
        'node_modules/onnxruntime-node/bin/**',
        'node_modules/@img/sharp-*/lib/**',
        'node_modules/@img/sharp-libvips-*/lib/**',
      ]),
    );
    expect(builderConfig.asarUnpack).not.toContain('node_modules/**');
    expect(builderConfig.files).toContain('!node_modules/onnxruntime-web/**');
  });

  it('excludes non-target ONNX Runtime binaries before creating the archive', () => {
    expect(builderConfig.files).toEqual(
      expect.arrayContaining([
        '!node_modules/onnxruntime-node/bin/napi-v6/linux/**',
        '!node_modules/onnxruntime-node/bin/napi-v6/win32/arm64/**',
      ]),
    );
    expect(builderConfig.mac?.files).toContain(
      '!node_modules/onnxruntime-node/bin/napi-v6/win32/**',
    );
    expect(builderConfig.win?.files).toContain(
      '!node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
    );
  });
});
