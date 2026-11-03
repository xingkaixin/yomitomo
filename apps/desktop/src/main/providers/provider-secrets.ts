import { getDesktopAppProfile } from '../app/app-environment';

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
  await saveStoredSecret(ref, apiKey);
  return ref;
}

export async function saveWeReadApiKey(apiKey: string, accountId = 'default') {
  const ref = wereadApiKeyRef(accountId);
  await saveStoredSecret(ref, apiKey);
  return ref;
}

export async function saveStoredSecret(ref: string, secret: string) {
  const entry = await createEntry(ref);
  await entry.setPassword(secret);
}

export function readProviderApiKey(apiKeyRef?: string | null) {
  return readStoredSecret(apiKeyRef);
}

export function readWeReadApiKey(apiKeyRef?: string | null) {
  return readStoredSecret(apiKeyRef);
}

async function readStoredSecret(ref?: string | null) {
  if (!ref) return '';
  const entry = await createEntry(ref);
  try {
    return (await entry.getPassword()) || '';
  } catch (error) {
    if (isNoEntryError(error)) return '';
    throw error;
  }
}

export async function deleteStoredSecret(secretRef: string) {
  const entry = await createEntry(secretRef);
  try {
    await entry.deletePassword();
  } catch (error) {
    if (!isNoEntryError(error)) throw error;
  }
}

async function createEntry(account: string) {
  const { AsyncEntry } = await loadKeyring();
  return new AsyncEntry(getDesktopAppProfile().keychainService, account);
}

function loadKeyring() {
  keyringModule ||= import('@napi-rs/keyring');
  return keyringModule;
}

function isNoEntryError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes('noentry');
}
