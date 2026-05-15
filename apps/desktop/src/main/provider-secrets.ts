const SERVICE_NAME = 'app.yomitomo.desktop';

type KeyringModule = typeof import('@napi-rs/keyring');

let keyringModule: Promise<KeyringModule> | undefined;

export function providerApiKeyRef(providerId: string) {
  return `provider:${providerId}:apiKey`;
}

export async function saveProviderApiKey(providerId: string, apiKey: string) {
  const ref = providerApiKeyRef(providerId);
  const entry = await createEntry(ref);
  entry.setPassword(apiKey);
  return ref;
}

export async function readProviderApiKey(providerId: string, apiKeyRef?: string | null) {
  const entry = await createEntry(apiKeyRef || providerApiKeyRef(providerId));
  try {
    return entry.getPassword() || '';
  } catch (error) {
    if (isNoEntryError(error)) return '';
    throw error;
  }
}

export async function deleteProviderApiKey(providerId: string, apiKeyRef?: string | null) {
  const entry = await createEntry(apiKeyRef || providerApiKeyRef(providerId));
  try {
    entry.deletePassword();
  } catch (error) {
    if (!isNoEntryError(error)) throw error;
  }
}

async function createEntry(account: string) {
  const { Entry } = await loadKeyring();
  return new Entry(SERVICE_NAME, account);
}

function loadKeyring() {
  keyringModule ||= import('@napi-rs/keyring');
  return keyringModule;
}

function isNoEntryError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes('noentry');
}
