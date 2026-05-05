import { browser } from 'wxt/browser';
import type { RuntimeMessage, RuntimeResponse } from './content-runtime';

export function isExtensionContextInvalidated(error: unknown) {
  return errorMessage(error).includes('Extension context invalidated');
}

export function extensionErrorMessage(error: unknown) {
  return errorMessage(error);
}

export async function readExtensionStorage(keys: string[]) {
  try {
    return await browser.storage.local.get(keys);
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return null;
    throw error;
  }
}

export async function writeExtensionStorage(values: Record<string, unknown>) {
  try {
    await browser.storage.local.set(values);
    return true;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return false;
    throw error;
  }
}

export async function removeExtensionStorage(keys: string[]) {
  try {
    await browser.storage.local.remove(keys);
    return true;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return false;
    throw error;
  }
}

export function connectExtensionPort(name: string) {
  try {
    return browser.runtime.connect({ name });
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return null;
    throw error;
  }
}

export function addExtensionMessageListener(
  listener: (message: RuntimeMessage) => Promise<RuntimeResponse> | undefined,
) {
  try {
    browser.runtime.onMessage.addListener(listener);
    return true;
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return false;
    throw error;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
