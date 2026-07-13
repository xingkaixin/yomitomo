import type { LookupAddress } from 'node:dns';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
}));

vi.mock('node:dns/promises', () => ({
  lookup: dnsMocks.lookup,
}));

import {
  ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET,
  assertAllowedArticleImportUrl,
  createFixedArticleImportLookup,
  resolveAllowedArticleImportTarget,
} from './article-import-network-policy';

describe('article import network policy', () => {
  afterEach(() => {
    dnsMocks.lookup.mockReset();
    dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it.each([
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:c0a8:101]/',
    'http://[64:ff9b::7f00:1]/',
    'http://192.0.2.1/',
    'http://[2001:db8::1]/',
  ])('blocks private or reserved target %s', async (url) => {
    await expect(assertAllowedArticleImportUrl(url, {})).rejects.toThrow(
      ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET,
    );
  });

  it('canonicalizes and allows a public IPv4-mapped IPv6 address', async () => {
    await expect(
      resolveAllowedArticleImportTarget('http://[::ffff:5db8:d822]/', {}),
    ).resolves.toMatchObject({
      addresses: [{ address: '::ffff:93.184.216.34', family: 6 }],
    });
  });

  it('rejects a hostname when any resolved address is private', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ]);

    await expect(assertAllowedArticleImportUrl('https://example.com/', {})).rejects.toThrow(
      ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET,
    );
  });

  it('pins the lookup to the addresses returned by policy validation', async () => {
    const target = await resolveAllowedArticleImportTarget('https://example.com/', {});
    dnsMocks.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    await expect(runLookup(createFixedArticleImportLookup(target.addresses))).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(dnsMocks.lookup).toHaveBeenCalledOnce();
  });
});

function runLookup(lookup: ReturnType<typeof createFixedArticleImportLookup>) {
  return new Promise<LookupAddress[]>((resolve, reject) => {
    lookup('example.com', { all: true }, (error, addresses) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(addresses as LookupAddress[]);
    });
  });
}
