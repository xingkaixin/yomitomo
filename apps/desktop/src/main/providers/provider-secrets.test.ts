import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProviderSecretsModule = typeof import('./provider-secrets');

type EntryCall = {
  service: string;
  account: string;
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

describe('provider secrets keyring', () => {
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

  it('saves provider and WeRead api keys with the current profile keychain service', async () => {
    const secrets = await loadProviderSecrets();
    state.keychainService = 'app.yomitomo.desktop.custom';

    await expect(secrets.saveProviderApiKey('anthropic', 'provider-secret')).resolves.toBe(
      'provider:anthropic:apiKey',
    );
    await expect(secrets.saveWeReadApiKey('weread-secret', 'weread_1')).resolves.toBe(
      'weread:weread_1:apiKey',
    );

    expect(state.entryCalls).toEqual([
      { service: 'app.yomitomo.desktop.custom', account: 'provider:anthropic:apiKey' },
      { service: 'app.yomitomo.desktop.custom', account: 'weread:weread_1:apiKey' },
    ]);
    expect(state.passwords.get('provider:anthropic:apiKey')).toBe('provider-secret');
    expect(state.passwords.get('weread:weread_1:apiKey')).toBe('weread-secret');
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
}

async function loadProviderSecrets(): Promise<ProviderSecretsModule> {
  return import('./provider-secrets');
}
