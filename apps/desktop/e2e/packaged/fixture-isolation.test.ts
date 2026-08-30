import { describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'node:path';
import fixtureConfig from './electron.vite.config';
import { cleanupE2eData, createE2eRunData } from '../helpers/e2e-data';
import { Entry } from './fixture-keyring';
import { prepareFixtureProfile } from './fixture-profile';
import { allowsFixtureHost, allowsFixtureUrl, fixtureSocketHost } from './fixture-network-policy';

describe('reading memory fixture isolation', () => {
  it('rejects repository output directories including names beginning with two dots', () => {
    const repository = resolve(import.meta.dirname, '../../../..');
    try {
      for (const path of [repository, join(repository, 'dist'), join(repository, '..fixture')]) {
        vi.stubEnv('YOMITOMO_READING_MEMORY_FIXTURE_DIR', path);
        expect(() => fixtureConfig({ command: 'build', mode: 'production' })).toThrow(
          'Fixture build must not overwrite repository dist outputs',
        );
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('refuses an unconfigured profile and isolates both current and legacy app data', async () => {
    expect(() => prepareFixtureProfile(undefined)).toThrow('harness-created temporary profile');
    expect(() => prepareFixtureProfile('.')).toThrow('harness-created temporary profile');
    const data = await createE2eRunData('fixture-profile');
    try {
      const profile = prepareFixtureProfile(data.userDataDir);
      expect(profile.appData).toBe(join(profile.userData, '..', 'app-data'));
      expect(join(profile.appData, '@reader', 'desktop', 'reader-agent.log')).toContain(
        'yomitomo-e2e-fixture-profile-',
      );
      console.info('fixture-profile-isolation', profile);
    } finally {
      await cleanupE2eData(data, { keep: false });
    }
  });

  it('keeps credentials in memory and separates service/account identities', () => {
    const first = new Entry('fixture', 'account');
    const other = new Entry('fixture-other', 'account');
    first.setPassword('fixture-key');
    expect(new Entry('fixture', 'account').getPassword()).toBe('fixture-key');
    expect(other.getPassword()).toBeNull();
    expect(first.deletePassword()).toBe(true);
    expect(first.getPassword()).toBeNull();
  });

  it('allows local sockets and app resources, but not external hosts', () => {
    for (const args of [
      [{ host: '127.0.0.1', port: 1234 }],
      [[{ host: '::1', port: 1234 }, () => {}]],
      [1234, 'localhost'],
      ['/tmp/electron.sock'],
    ]) {
      expect(allowsFixtureHost(fixtureSocketHost(args))).toBe(true);
    }
    expect(allowsFixtureHost(fixtureSocketHost([443, 'example.com']))).toBe(false);
    expect(allowsFixtureHost(fixtureSocketHost([{ host: '192.0.2.1', port: 443 }]))).toBe(false);
    for (const url of [
      'file:///app/index.html',
      'data:text/plain,fixture',
      'http://127.0.0.1:1234',
      'http://[::1]:1234',
    ]) {
      expect(allowsFixtureUrl(url)).toBe(true);
    }
    expect(allowsFixtureUrl('https://example.com')).toBe(false);
    expect(allowsFixtureUrl('https://127.0.0.1.example.com')).toBe(false);
  });
});
