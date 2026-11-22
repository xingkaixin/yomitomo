import { randomUUID } from 'node:crypto';
import { clearChatGptModelThinkingLevels, replaceChatGptModelThinkingLevels } from '@yomitomo/ai';
import { eq } from 'drizzle-orm';
import type {
  ChatGptAccountState,
  ChatGptAuthStatus,
  ProviderModel,
  ThinkingEffortOption,
} from '@yomitomo/shared';
import { logError, logInfo } from '../app/logger';
import * as schema from '../db/schema';
import { getDatabase } from '../store/store-db';
import {
  authorizeChatGpt,
  ChatGptOAuthError,
  refreshChatGptTokens,
  revokeChatGptRefreshToken,
  type ChatGptOAuthCredentials,
} from './chatgpt-oauth';
import {
  chatgptOAuthCredentialRef,
  deleteStoredSecret,
  readStoredSecret,
  saveStoredSecret,
} from './provider-secrets';

const DEFAULT_ACCOUNT_ID = 'default';
const ACCESS_TOKEN_REFRESH_MARGIN_MS = 3 * 60 * 1000;
const VALID_THINKING_EFFORTS = new Set<ThinkingEffortOption>([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export class ChatGptAuthRequiredError extends Error {
  constructor() {
    super('ChatGPT sign-in is required');
    this.name = 'ChatGptAuthRequiredError';
  }
}

export class ChatGptReauthRequiredError extends Error {
  constructor(message = 'ChatGPT session expired; sign in again') {
    super(message);
    this.name = 'ChatGptReauthRequiredError';
  }
}

type ChatGptOAuthRow = typeof schema.chatgptOAuthAccounts.$inferSelect;

let activeSignInController: AbortController | null = null;
let activeRefreshController: AbortController | null = null;
let inFlightRefresh: { epoch: number; promise: Promise<string> } | null = null;
let activeDisconnectPromise: Promise<ChatGptAccountState> | null = null;
let connectionEpoch = 0;

function invalidateActiveRefresh() {
  connectionEpoch += 1;
  activeRefreshController?.abort();
  activeRefreshController = null;
  inFlightRefresh = null;
}

export function resetChatGptOAuthRepositoryStateForTest() {
  cancelChatGptSignIn();
  invalidateActiveRefresh();
  activeDisconnectPromise = null;
  clearChatGptModelThinkingLevels();
}

export function readChatGptAccountState(): ChatGptAccountState {
  const row = readAccountRow();
  if (!row) return { status: 'disconnected' };
  const status = normalizeStatus(row.status);
  const hasSavedRegistration = Boolean(row.clientId || row.credentialRef);
  if (status === 'connected' && !row.credentialRef) {
    return {
      status: 'disconnected',
      ...(hasSavedRegistration ? { hasSavedRegistration: true } : {}),
    };
  }
  return {
    status,
    email: row.accountEmail || undefined,
    name: row.accountName || undefined,
    updatedAt: row.updatedAt,
    ...(status !== 'connected' && hasSavedRegistration ? { hasSavedRegistration: true } : {}),
  };
}

export function syncChatGptModelCapabilitiesFromStore(): void {
  const row = readAccountRow();
  if (!row || normalizeStatus(row.status) !== 'connected' || !row.credentialRef) {
    clearChatGptModelThinkingLevels();
    return;
  }
  replaceChatGptModelThinkingLevels(parseStoredModelCapabilities(row.modelCapabilitiesJson));
}

export function saveChatGptModelCapabilities(
  models: readonly ProviderModel[],
  expectedCredentialRef?: string | null,
): boolean {
  const row = readAccountRow();
  if (!row || normalizeStatus(row.status) !== 'connected' || !row.credentialRef) {
    clearChatGptModelThinkingLevels();
    return false;
  }
  if (expectedCredentialRef && row.credentialRef !== expectedCredentialRef) {
    return false;
  }
  const capabilities: Record<string, ThinkingEffortOption[]> = {};
  for (const model of models) {
    if (!model.id.trim() || !model.supportedReasoningEfforts?.length) continue;
    capabilities[model.id.trim()] = [...model.supportedReasoningEfforts];
  }
  replaceChatGptModelThinkingLevels(capabilities);
  updateAccountRow({
    modelCapabilitiesJson:
      Object.keys(capabilities).length > 0 ? JSON.stringify(capabilities) : null,
  });
  return true;
}

export function cancelChatGptSignIn(): void {
  activeSignInController?.abort();
  activeSignInController = null;
}

export async function signInChatGptAccount(options: {
  openBrowser: (url: string) => Promise<void>;
}): Promise<ChatGptAccountState> {
  if (activeDisconnectPromise) {
    throw new ChatGptOAuthError(
      'disconnect_in_progress',
      'ChatGPT disconnect is still in progress. Please wait a moment and try again.',
    );
  }
  cancelChatGptSignIn();
  invalidateActiveRefresh();
  const epoch = connectionEpoch;
  const controller = new AbortController();
  activeSignInController = controller;

  const existing = ensureAccountRow();
  const isInitialConnection = existing.status === 'disconnected';
  const previousCredentialRef = existing.credentialRef;
  try {
    const result = await authorizeChatGpt({
      hostId: existing.hostId,
      savedClientId: existing.clientId || undefined,
      savedSubject: isInitialConnection ? undefined : existing.accountSubject || undefined,
      loginHint: isInitialConnection ? undefined : existing.accountEmail || undefined,
      reconsent: existing.status === 'reauth_required',
      openBrowser: options.openBrowser,
      onClientRegistered: (clientId) => {
        if (epoch !== connectionEpoch) return;
        updateAccountRow({ clientId });
      },
      signal: controller.signal,
    });

    if (epoch !== connectionEpoch) {
      throw new ChatGptOAuthError('cancelled', 'ChatGPT sign-in was superseded.');
    }

    // Use a fresh keyring entry per sign-in so an aborted refresh from an older account cannot overwrite it.
    const credentialRef = chatgptOAuthCredentialRef(`${DEFAULT_ACCOUNT_ID}:${randomUUID()}`);
    await saveStoredSecret(credentialRef, JSON.stringify(result.credentials));
    if (epoch !== connectionEpoch) {
      await deleteStoredSecret(credentialRef).catch(() => undefined);
      throw new ChatGptOAuthError('cancelled', 'ChatGPT sign-in was superseded.');
    }

    const switchingAccount =
      Boolean(existing.accountSubject) && existing.accountSubject !== result.identity.subject;
    const now = new Date().toISOString();
    updateAccountRow({
      clientId: result.clientId,
      credentialRef,
      accountEmail: result.identity.email || null,
      accountName: result.identity.name || null,
      accountSubject: result.identity.subject,
      ...(switchingAccount || isInitialConnection ? { modelCapabilitiesJson: null } : {}),
      status: 'connected',
      updatedAt: now,
    });
    if (switchingAccount || isInitialConnection) {
      clearChatGptModelThinkingLevels();
    } else {
      syncChatGptModelCapabilitiesFromStore();
    }
    if (previousCredentialRef && previousCredentialRef !== credentialRef) {
      await deleteStoredSecret(previousCredentialRef).catch(() => undefined);
    }

    logInfo('chatgpt_oauth.sign_in_succeeded', {
      hasEmail: Boolean(result.identity.email),
    });
    return {
      status: 'connected',
      email: result.identity.email,
      name: result.identity.name,
      updatedAt: now,
    };
  } catch (error) {
    // Keep an issued client_id across retryable token-exchange errors (e.g. invalid_grant),
    // but clear it when the account is ineligible or mismatched during initial sign-in.
    if (
      isInitialConnection &&
      epoch === connectionEpoch &&
      error instanceof ChatGptOAuthError &&
      (error.code === 'plan_sharing_unavailable' || error.code === 'account_mismatch')
    ) {
      updateAccountRow({ clientId: null });
    }
    throw error;
  } finally {
    if (activeSignInController === controller) {
      activeSignInController = null;
    }
  }
}

export function disconnectChatGptAccount(): Promise<ChatGptAccountState> {
  if (activeDisconnectPromise) {
    return activeDisconnectPromise;
  }
  const disconnectPromise = runDisconnectChatGptAccount().finally(() => {
    if (activeDisconnectPromise === disconnectPromise) {
      activeDisconnectPromise = null;
    }
  });
  activeDisconnectPromise = disconnectPromise;
  return disconnectPromise;
}

async function runDisconnectChatGptAccount(): Promise<ChatGptAccountState> {
  cancelChatGptSignIn();
  invalidateActiveRefresh();
  clearChatGptModelThinkingLevels();
  const disconnectEpoch = connectionEpoch;
  const row = readAccountRow();
  const credentialRef = row?.credentialRef || chatgptOAuthCredentialRef(DEFAULT_ACCOUNT_ID);
  const previousClientId = row?.clientId || null;

  // Mark disconnected synchronously so concurrent/new token readers reject immediately,
  // while retaining credentialRef/clientId until keyring cleanup completes so transient
  // keyring errors can be retried cleanly.
  if (row) {
    updateAccountRow({
      accountEmail: null,
      accountName: null,
      accountSubject: null,
      modelCapabilitiesJson: null,
      status: 'disconnected',
    });
  }

  let stored: ChatGptOAuthCredentials | null = null;
  let readFailed = false;
  if (row?.credentialRef) {
    try {
      stored = await readStoredCredentials(row.credentialRef);
    } catch (error) {
      readFailed = true;
      logError('chatgpt_oauth.read_secret_failed', error);
    }
  }

  let deleteFailed = false;
  try {
    await deleteStoredSecret(credentialRef);
  } catch (error) {
    deleteFailed = true;
    logError('chatgpt_oauth.delete_secret_failed', error);
  }

  if (row && !deleteFailed && disconnectEpoch === connectionEpoch) {
    updateAccountRow({
      clientId: null,
      credentialRef: null,
      accountEmail: null,
      accountName: null,
      accountSubject: null,
      modelCapabilitiesJson: null,
      status: 'disconnected',
    });
  }

  let remoteRevocationFailed = readFailed && Boolean(previousClientId && row?.credentialRef);
  if (previousClientId && stored?.refreshToken) {
    try {
      await revokeChatGptRefreshToken({
        clientId: previousClientId,
        refreshToken: stored.refreshToken,
      });
    } catch (error) {
      remoteRevocationFailed = true;
      logError('chatgpt_oauth.revoke_failed', error);
    }
  }

  if (deleteFailed) {
    throw new Error('Failed to remove ChatGPT credentials from the system keyring.');
  }

  return remoteRevocationFailed
    ? { status: 'disconnected', remoteRevocationFailed: true }
    : { status: 'disconnected' };
}

export async function getValidChatGptAccessToken(): Promise<string> {
  const { accessToken } = await getValidChatGptAccessTokenWithSession();
  return accessToken;
}

export async function getValidChatGptAccessTokenWithSession(): Promise<{
  accessToken: string;
  credentialRef: string;
}> {
  if (activeDisconnectPromise) {
    throw new ChatGptAuthRequiredError();
  }
  const row = readAccountRow();
  if (!row || row.status === 'reauth_required') {
    clearChatGptModelThinkingLevels();
    if (row?.status === 'reauth_required') throw new ChatGptReauthRequiredError();
    throw new ChatGptAuthRequiredError();
  }
  if (row.status !== 'connected' || !row.credentialRef || !row.clientId) {
    clearChatGptModelThinkingLevels();
    throw new ChatGptAuthRequiredError();
  }

  syncChatGptModelCapabilitiesFromStore();

  const epoch = connectionEpoch;
  const credentialRef = row.credentialRef;
  const credentials = await readStoredCredentials(credentialRef);
  if (activeDisconnectPromise || epoch !== connectionEpoch || !isSameSession(row)) {
    throw new ChatGptAuthRequiredError();
  }
  if (!credentials) {
    markReauthRequired();
    throw new ChatGptReauthRequiredError();
  }

  if (credentials.expiresAt - Date.now() > ACCESS_TOKEN_REFRESH_MARGIN_MS) {
    return { accessToken: credentials.accessToken, credentialRef };
  }

  // Share one in-flight refresh per session epoch so rotating refresh tokens are not reused,
  // while never letting an older session's refresh overwrite a newer sign-in.
  if (inFlightRefresh && inFlightRefresh.epoch === epoch) {
    return { accessToken: await inFlightRefresh.promise, credentialRef };
  }

  const controller = new AbortController();
  activeRefreshController = controller;
  const promise = refreshStoredCredentials(row, credentials, epoch, controller.signal).finally(
    () => {
      if (inFlightRefresh?.promise === promise) inFlightRefresh = null;
      if (activeRefreshController === controller) activeRefreshController = null;
    },
  );
  inFlightRefresh = { epoch, promise };
  return { accessToken: await promise, credentialRef };
}

async function refreshStoredCredentials(
  row: ChatGptOAuthRow,
  credentials: ChatGptOAuthCredentials,
  epoch: number,
  signal: AbortSignal,
): Promise<string> {
  if (!row.clientId || !row.credentialRef) {
    if (epoch === connectionEpoch && isSameSession(row)) markReauthRequired();
    throw new ChatGptReauthRequiredError();
  }
  try {
    const refreshed = await refreshChatGptTokens({
      clientId: row.clientId,
      refreshToken: credentials.refreshToken,
      previousScopes: credentials.scopes,
      expectedSubject: row.accountSubject || undefined,
      signal,
    });
    if (epoch !== connectionEpoch || !isSameSession(row)) {
      throw new ChatGptAuthRequiredError();
    }
    await saveStoredSecret(row.credentialRef, JSON.stringify(refreshed.credentials));
    if (epoch !== connectionEpoch || !isSameSession(row)) {
      await deleteStoredSecret(row.credentialRef).catch(() => undefined);
      throw new ChatGptAuthRequiredError();
    }
    const now = new Date().toISOString();
    updateAccountRow({
      status: 'connected',
      ...(refreshed.identity
        ? {
            accountEmail: refreshed.identity.email || row.accountEmail,
            accountName: refreshed.identity.name || row.accountName,
            accountSubject: refreshed.identity.subject,
          }
        : {}),
      updatedAt: now,
    });
    return refreshed.credentials.accessToken;
  } catch (error) {
    if (epoch !== connectionEpoch || !isSameSession(row)) {
      throw new ChatGptAuthRequiredError();
    }
    if (error instanceof ChatGptOAuthError && error.code === 'reauth_required') {
      markReauthRequired();
      await deleteStoredSecret(row.credentialRef).catch(() => undefined);
      throw new ChatGptReauthRequiredError(error.message);
    }
    throw error;
  }
}

function isSameSession(expected: ChatGptOAuthRow) {
  const current = readAccountRow();
  return Boolean(
    current &&
    current.status === 'connected' &&
    current.credentialRef &&
    current.credentialRef === expected.credentialRef &&
    current.clientId === expected.clientId &&
    current.accountSubject === expected.accountSubject,
  );
}

function markReauthRequired() {
  const row = readAccountRow();
  if (!row) return;
  clearChatGptModelThinkingLevels();
  updateAccountRow({
    credentialRef: null,
    status: 'reauth_required',
    updatedAt: new Date().toISOString(),
  });
}

async function readStoredCredentials(
  credentialRef?: string | null,
): Promise<ChatGptOAuthCredentials | null> {
  if (!credentialRef) return null;
  const raw = await readStoredSecret(credentialRef);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatGptOAuthCredentials>;
    if (
      typeof parsed.accessToken !== 'string' ||
      !parsed.accessToken ||
      typeof parsed.refreshToken !== 'string' ||
      !parsed.refreshToken ||
      typeof parsed.expiresAt !== 'number' ||
      !Number.isFinite(parsed.expiresAt) ||
      !Array.isArray(parsed.scopes)
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      scopes: parsed.scopes.filter((scope): scope is string => typeof scope === 'string'),
    };
  } catch {
    return null;
  }
}

function parseStoredModelCapabilities(
  raw: string | null | undefined,
): Record<string, ThinkingEffortOption[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, ThinkingEffortOption[]> = {};
    for (const [modelId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(value)) continue;
      const efforts = value.filter(
        (item): item is ThinkingEffortOption =>
          typeof item === 'string' && VALID_THINKING_EFFORTS.has(item as ThinkingEffortOption),
      );
      if (efforts.length > 0) result[modelId] = efforts;
    }
    return result;
  } catch {
    return {};
  }
}

function readAccountRow(): ChatGptOAuthRow | undefined {
  return getDatabase()
    .select()
    .from(schema.chatgptOAuthAccounts)
    .where(eq(schema.chatgptOAuthAccounts.id, DEFAULT_ACCOUNT_ID))
    .get();
}

function ensureAccountRow(): ChatGptOAuthRow {
  const existing = readAccountRow();
  if (existing) return existing;
  const now = new Date().toISOString();
  const row: ChatGptOAuthRow = {
    id: DEFAULT_ACCOUNT_ID,
    hostId: `urn:uuid:${randomUUID()}`,
    clientId: null,
    credentialRef: null,
    accountEmail: null,
    accountName: null,
    accountSubject: null,
    modelCapabilitiesJson: null,
    status: 'disconnected',
    updatedAt: now,
  };
  getDatabase().insert(schema.chatgptOAuthAccounts).values(row).run();
  return row;
}

function updateAccountRow(patch: Partial<Omit<ChatGptOAuthRow, 'id' | 'hostId'>>) {
  getDatabase()
    .update(schema.chatgptOAuthAccounts)
    .set({
      ...patch,
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    })
    .where(eq(schema.chatgptOAuthAccounts.id, DEFAULT_ACCOUNT_ID))
    .run();
}

function normalizeStatus(value: string): ChatGptAuthStatus {
  if (value === 'connected' || value === 'reauth_required') return value;
  return 'disconnected';
}
