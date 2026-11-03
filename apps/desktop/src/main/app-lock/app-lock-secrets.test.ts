import { beforeEach, describe, expect, it, vi } from 'vitest';

type AppLockSecretsModule = typeof import('./app-lock-secrets');

type EntryCall = {
  account: string;
  service: string;
};

type KeyringState = {
  entryCalls: EntryCall[];
  keychainService: string;
  passwords: Map<string, string>;
};

const state: KeyringState = {
  entryCalls: [],
  keychainService: 'app.yomitomo.desktop.test',
  passwords: new Map(),
};

describe('app lock pin keyring', () => {
  beforeEach(() => {
    state.entryCalls = [];
    state.keychainService = 'app.yomitomo.desktop.test';
    state.passwords = new Map();
    vi.resetModules();
    vi.doMock('../app/app-environment', () => ({
      getDesktopAppProfile: () => ({
        environment: 'development',
        keychainService: state.keychainService,
        userDataDirectory: '@yomitomo/desktop-test',
      }),
    }));
    vi.doMock('@napi-rs/keyring', () => ({ AsyncEntry: FakeAsyncEntry }));
  });

  it('saves a salted pin hash instead of the raw pin', async () => {
    const secrets = await loadAppLockSecrets();
    state.keychainService = 'app.yomitomo.desktop.custom';

    await expect(secrets.saveAppLockPin('1234')).resolves.toBe('app-lock:default:pin');

    const stored = state.passwords.get('app-lock:default:pin') || '';
    expect(state.entryCalls).toEqual([
      { service: 'app.yomitomo.desktop.custom', account: 'app-lock:default:pin' },
    ]);
    expect(stored).not.toContain('1234');
    expect(JSON.parse(stored)).toMatchObject({
      version: 1,
      keyLength: 32,
    });
  });

  it('verifies correct pins and rejects wrong pins', async () => {
    const secrets = await loadAppLockSecrets();

    await secrets.saveAppLockPin('1234');

    await expect(secrets.hasAppLockPin()).resolves.toBe(true);
    await expect(secrets.verifyAppLockPin('1234')).resolves.toBe(true);
    await expect(secrets.verifyAppLockPin('4321')).resolves.toBe(false);
    await expect(secrets.verifyAppLockPin('bad')).resolves.toBe(false);
  });
});

class FakeAsyncEntry {
  private readonly account: string;

  constructor(service: string, account: string) {
    this.account = account;
    state.entryCalls.push({ service, account });
  }

  async setPassword(password: string) {
    state.passwords.set(this.account, password);
  }

  async getPassword() {
    return state.passwords.get(this.account);
  }

  async deletePassword() {
    state.passwords.delete(this.account);
  }
}

async function loadAppLockSecrets(): Promise<AppLockSecretsModule> {
  return import('./app-lock-secrets');
}
