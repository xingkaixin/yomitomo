import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { getDesktopAppProfile } from '../app/app-environment';

type KeyringModule = typeof import('@napi-rs/keyring');

type AppLockPinRecord = {
  hash: string;
  keyLength: number;
  salt: string;
  version: 1;
};

let keyringModule: Promise<KeyringModule> | undefined;

const scrypt = promisify(scryptCallback);
const appLockPinKeyLength = 32;

export function appLockPinRef(accountId = 'default') {
  return `app-lock:${accountId}:pin`;
}

export function isValidAppLockPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

export async function hasAppLockPin(accountId = 'default') {
  return Boolean(await readAppLockPinRecord(accountId));
}

export async function saveAppLockPin(pin: string, accountId = 'default') {
  if (!isValidAppLockPin(pin)) throw new Error('APP_LOCK_PIN_INVALID');
  const salt = randomBytes(16).toString('base64url');
  const hash = await hashAppLockPin(pin, salt, appLockPinKeyLength);
  const record: AppLockPinRecord = {
    version: 1,
    salt,
    hash: hash.toString('base64url'),
    keyLength: appLockPinKeyLength,
  };
  const ref = appLockPinRef(accountId);
  const entry = await createEntry(ref);
  entry.setPassword(JSON.stringify(record));
  return ref;
}

export async function verifyAppLockPin(pin: string, accountId = 'default') {
  if (!isValidAppLockPin(pin)) return false;
  const record = await readAppLockPinRecord(accountId);
  if (!record) return false;
  const expected = Buffer.from(record.hash, 'base64url');
  const actual = await hashAppLockPin(pin, record.salt, record.keyLength);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function deleteAppLockPin(accountId = 'default') {
  const entry = await createEntry(appLockPinRef(accountId));
  try {
    entry.deletePassword();
  } catch (error) {
    if (!isNoEntryError(error)) throw error;
  }
}

async function readAppLockPinRecord(accountId: string) {
  const entry = await createEntry(appLockPinRef(accountId));
  try {
    return parseAppLockPinRecord(entry.getPassword());
  } catch (error) {
    if (isNoEntryError(error)) return null;
    throw error;
  }
}

async function hashAppLockPin(pin: string, salt: string, keyLength: number) {
  return (await scrypt(pin, salt, keyLength)) as Buffer;
}

function parseAppLockPinRecord(value: string | null | undefined) {
  if (!value) return null;
  try {
    const record = JSON.parse(value) as Partial<AppLockPinRecord>;
    if (
      record.version !== 1 ||
      typeof record.salt !== 'string' ||
      typeof record.hash !== 'string' ||
      record.keyLength !== appLockPinKeyLength
    ) {
      return null;
    }
    return record as AppLockPinRecord;
  } catch {
    return null;
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
