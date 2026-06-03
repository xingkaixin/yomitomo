import { getDesktopAppProfile } from './app/app-environment';

type KeyringModule = typeof import('@napi-rs/keyring');

let keyringModule: Promise<KeyringModule> | undefined;

export function providerApiKeyRef(providerId: string) {
  return `provider:${providerId}:apiKey`;
}

export function wereadApiKeyRef(accountId = 'default') {
  return `weread:${accountId}:apiKey`;
}

export async function saveProviderApiKey(providerId: string, apiKey: string) {
  const ref = providerApiKeyRef(providerId);
  const entry = await createEntry(ref);
  entry.setPassword(apiKey);
  return ref;
}

export async function saveWeReadApiKey(apiKey: string, accountId = 'default') {
  const ref = wereadApiKeyRef(accountId);
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

export async function readWeReadApiKey(apiKeyRef?: string | null, accountId = 'default') {
  const entry = await createEntry(apiKeyRef || wereadApiKeyRef(accountId));
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

export async function deleteWeReadApiKey(apiKeyRef?: string | null, accountId = 'default') {
  const entry = await createEntry(apiKeyRef || wereadApiKeyRef(accountId));
  try {
    entry.deletePassword();
  } catch (error) {
    if (!isNoEntryError(error)) throw error;
  }
}

async function createEntry(account: string) {
  const { Entry } = await loadKeyring();
  return new Entry(getDesktopAppProfile().keychainService, account);
}

function loadKeyring() {
  keyringModule ||= import('@napi-rs/keyring');
  return keyringModule;
}

function isNoEntryError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes('noentry');
}
