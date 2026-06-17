import { beforeEach, describe, expect, it, vi } from 'vitest';

type AppLockSecretsModule = typeof import('./app-lock-secrets');

type EntryCall = {
  account: string;
  service: string;
};

type KeyringState = {
  deletePasswordError?: Error;
  entryCalls: EntryCall[];
  getPasswordError?: Error;
  keychainService: string;
  moduleLoads: number;
  passwords: Map<string, string>;
};

const state: KeyringState = {
  entryCalls: [],
  keychainService: 'app.yomitomo.desktop.test',
  moduleLoads: 0,
  passwords: new Map(),
};

describe('app lock pin keyring', () => {
  beforeEach(() => {
    state.deletePasswordError = undefined;
    state.entryCalls = [];
    state.getPasswordError = undefined;
    state.keychainService = 'app.yomitomo.desktop.test';
    state.moduleLoads = 0;
    state.passwords = new Map();
    vi.resetModules();
    vi.doMock('../app/app-environment', () => ({
      getDesktopAppProfile: () => ({
        environment: 'development',
        keychainService: state.keychainService,
        userDataDirectory: '@yomitomo/desktop-test',
      }),
    }));
    vi.doMock('@napi-rs/keyring', () => {
      state.moduleLoads += 1;
      return { Entry: FakeEntry };
    });
  });

  it('generates a stable app lock pin ref', async () => {
    const secrets = await loadAppLockSecrets();

    expect(secrets.appLockPinRef()).toBe('app-lock:default:pin');
    expect(secrets.appLockPinRef('profile_1')).toBe('app-lock:profile_1:pin');
  });

  it('validates four digit pins only', async () => {
    const secrets = await loadAppLockSecrets();

    expect(secrets.isValidAppLockPin('1234')).toBe(true);
    expect(secrets.isValidAppLockPin('123')).toBe(false);
    expect(secrets.isValidAppLockPin('abcd')).toBe(false);
    expect(secrets.isValidAppLockPin('12345')).toBe(false);
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

  it('treats missing and malformed entries as unconfigured', async () => {
    const secrets = await loadAppLockSecrets();

    await expect(secrets.hasAppLockPin()).resolves.toBe(false);
    await expect(secrets.verifyAppLockPin('1234')).resolves.toBe(false);

    state.passwords.set('app-lock:default:pin', '{"version":1,"salt":"","hash":"","keyLength":8}');

    await expect(secrets.hasAppLockPin()).resolves.toBe(false);
    await expect(secrets.verifyAppLockPin('1234')).resolves.toBe(false);
  });

  it('ignores missing deletes when keyring returns noentry', async () => {
    const secrets = await loadAppLockSecrets();
    state.deletePasswordError = new Error('keyring noentry');

    await expect(secrets.deleteAppLockPin()).resolves.toBeUndefined();
  });

  it('loads the keyring module only once per app-lock module instance', async () => {
    const secrets = await loadAppLockSecrets();

    await secrets.saveAppLockPin('1234');
    await secrets.verifyAppLockPin('1234');
    await secrets.deleteAppLockPin();

    expect(state.moduleLoads).toBe(1);
  });
});

class FakeEntry {
  private readonly account: string;

  constructor(service: string, account: string) {
    this.account = account;
    state.entryCalls.push({ service, account });
  }

  setPassword(password: string) {
    state.passwords.set(this.account, password);
  }

  getPassword() {
    if (state.getPasswordError) throw state.getPasswordError;
    return state.passwords.get(this.account);
  }

  deletePassword() {
    if (state.deletePasswordError) throw state.deletePasswordError;
    state.passwords.delete(this.account);
  }
}

async function loadAppLockSecrets(): Promise<AppLockSecretsModule> {
  return import('./app-lock-secrets');
}
