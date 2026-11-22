import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ChatGptAccountState, ChatGptAuthStatus } from '@yomitomo/shared';
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
let inFlightRefresh: Promise<string> | null = null;

export function readChatGptAccountState(): ChatGptAccountState {
  const row = readAccountRow();
  if (!row) return { status: 'disconnected' };
  const status = normalizeStatus(row.status);
  if (status === 'connected' && !row.credentialRef) {
    return { status: 'disconnected' };
  }
  return {
    status,
    email: row.accountEmail || undefined,
    name: row.accountName || undefined,
    updatedAt: row.updatedAt,
  };
}

export function cancelChatGptSignIn(): void {
  activeSignInController?.abort();
  activeSignInController = null;
}

export async function signInChatGptAccount(options: {
  openBrowser: (url: string) => Promise<void>;
}): Promise<ChatGptAccountState> {
  cancelChatGptSignIn();
  const controller = new AbortController();
  activeSignInController = controller;

  const existing = ensureAccountRow();
  try {
    const result = await authorizeChatGpt({
      hostId: existing.hostId,
      savedClientId: existing.clientId || undefined,
      savedSubject: existing.accountSubject || undefined,
      loginHint: existing.accountEmail || undefined,
      openBrowser: options.openBrowser,
      onClientRegistered: (clientId) => {
        updateAccountRow({ clientId });
      },
      signal: controller.signal,
    });

    const credentialRef = existing.credentialRef || chatgptOAuthCredentialRef(DEFAULT_ACCOUNT_ID);
    await saveStoredSecret(credentialRef, JSON.stringify(result.credentials));
    const now = new Date().toISOString();
    updateAccountRow({
      clientId: result.clientId,
      credentialRef,
      accountEmail: result.identity.email || null,
      accountName: result.identity.name || null,
      accountSubject: result.identity.subject,
      status: 'connected',
      updatedAt: now,
    });
    logInfo('chatgpt_oauth.sign_in_succeeded', {
      hasEmail: Boolean(result.identity.email),
    });
    return {
      status: 'connected',
      email: result.identity.email,
      name: result.identity.name,
      updatedAt: now,
    };
  } finally {
    if (activeSignInController === controller) {
      activeSignInController = null;
    }
  }
}

export async function disconnectChatGptAccount(): Promise<ChatGptAccountState> {
  cancelChatGptSignIn();
  const row = readAccountRow();
  const credentialRef = row?.credentialRef || chatgptOAuthCredentialRef(DEFAULT_ACCOUNT_ID);
  const stored = await readStoredCredentials(row?.credentialRef);

  // Clear local binding first so switching accounts works even if remote revocation fails.
  if (row) {
    const now = new Date().toISOString();
    updateAccountRow({
      clientId: null,
      credentialRef: null,
      accountEmail: null,
      accountName: null,
      accountSubject: null,
      status: 'disconnected',
      updatedAt: now,
    });
  }
  await deleteStoredSecret(credentialRef).catch((error) => {
    logError('chatgpt_oauth.delete_secret_failed', error);
  });

  if (row?.clientId && stored?.refreshToken) {
    await revokeChatGptRefreshToken({
      clientId: row.clientId,
      refreshToken: stored.refreshToken,
    }).catch((error) => {
      logError('chatgpt_oauth.revoke_failed', error);
    });
  }

  return { status: 'disconnected' };
}

export async function getValidChatGptAccessToken(): Promise<string> {
  const row = readAccountRow();
  if (!row || !row.credentialRef || !row.clientId) {
    if (row?.status === 'reauth_required') throw new ChatGptReauthRequiredError();
    throw new ChatGptAuthRequiredError();
  }
  if (row.status === 'reauth_required') {
    throw new ChatGptReauthRequiredError();
  }

  const credentials = await readStoredCredentials(row.credentialRef);
  if (!credentials) {
    markReauthRequired();
    throw new ChatGptReauthRequiredError();
  }

  if (credentials.expiresAt - Date.now() > ACCESS_TOKEN_REFRESH_MARGIN_MS) {
    return credentials.accessToken;
  }

  // Share one in-flight refresh across concurrent requests so rotating refresh tokens are not reused.
  if (!inFlightRefresh) {
    inFlightRefresh = refreshStoredCredentials(row, credentials).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

async function refreshStoredCredentials(
  row: ChatGptOAuthRow,
  credentials: ChatGptOAuthCredentials,
): Promise<string> {
  if (!row.clientId || !row.credentialRef) {
    markReauthRequired();
    throw new ChatGptReauthRequiredError();
  }
  try {
    const refreshed = await refreshChatGptTokens({
      clientId: row.clientId,
      refreshToken: credentials.refreshToken,
      previousScopes: credentials.scopes,
      expectedSubject: row.accountSubject || undefined,
    });
    await saveStoredSecret(row.credentialRef, JSON.stringify(refreshed.credentials));
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
    if (error instanceof ChatGptOAuthError && error.code === 'reauth_required') {
      markReauthRequired();
      await deleteStoredSecret(row.credentialRef).catch(() => undefined);
      throw new ChatGptReauthRequiredError(error.message);
    }
    throw error;
  }
}

function markReauthRequired() {
  const row = readAccountRow();
  if (!row) return;
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
