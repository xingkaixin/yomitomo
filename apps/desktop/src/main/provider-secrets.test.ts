import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProviderSecretsModule = typeof import('./provider-secrets');

type EntryCall = {
  service: string;
  account: string;
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

describe('provider secrets keyring', () => {
  beforeEach(() => {
    state.deletePasswordError = undefined;
    state.entryCalls = [];
    state.getPasswordError = undefined;
    state.keychainService = 'app.yomitomo.desktop.test';
    state.moduleLoads = 0;
    state.passwords = new Map();
    vi.resetModules();
    vi.doMock('./app-environment', () => ({
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

  it('generates provider and WeRead api key refs', async () => {
    const secrets = await loadProviderSecrets();

    expect(secrets.providerApiKeyRef('openai')).toBe('provider:openai:apiKey');
    expect(secrets.wereadApiKeyRef()).toBe('weread:default:apiKey');
    expect(secrets.wereadApiKeyRef('account_1')).toBe('weread:account_1:apiKey');
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

  it('reads missing provider and WeRead entries as empty strings when keyring returns noentry', async () => {
    const secrets = await loadProviderSecrets();
    state.getPasswordError = new Error('NoEntry');

    await expect(secrets.readProviderApiKey('openai')).resolves.toBe('');
    await expect(secrets.readWeReadApiKey(null, 'weread_1')).resolves.toBe('');
  });

  it('ignores missing provider and WeRead deletes when keyring returns noentry', async () => {
    const secrets = await loadProviderSecrets();
    state.deletePasswordError = new Error('keyring noentry');

    await expect(secrets.deleteProviderApiKey('openai')).resolves.toBeUndefined();
    await expect(secrets.deleteWeReadApiKey(null, 'weread_1')).resolves.toBeUndefined();
  });

  it('propagates non-noentry keyring errors', async () => {
    const secrets = await loadProviderSecrets();
    const readError = new Error('keyring locked');
    const deleteError = new Error('permission denied');
    state.getPasswordError = readError;

    await expect(secrets.readProviderApiKey('openai')).rejects.toThrow(readError);

    state.getPasswordError = undefined;
    state.deletePasswordError = deleteError;

    await expect(secrets.deleteWeReadApiKey()).rejects.toThrow(deleteError);
  });

  it('loads the keyring module only once per provider-secrets module instance', async () => {
    const secrets = await loadProviderSecrets();

    await secrets.saveProviderApiKey('openai', 'provider-secret');
    await secrets.readProviderApiKey('openai');
    await secrets.deleteProviderApiKey('openai');

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

async function loadProviderSecrets(): Promise<ProviderSecretsModule> {
  return import('./provider-secrets');
}
