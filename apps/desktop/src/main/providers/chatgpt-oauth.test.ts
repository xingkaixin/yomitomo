import { clearChatGptModelThinkingLevels, providerThinkingCapabilities } from '@yomitomo/ai';
import { generateKeyPairSync, sign } from 'node:crypto';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureAdditiveSchemaColumns, migrations } from '../db/migrations';
import * as schema from '../db/schema';
import * as storeDb from '../store/store-db';
import {
  ChatGptOAuthError,
  resetChatGptOAuthCachesForTest,
  verifyChatGptIdToken,
} from './chatgpt-oauth';
import {
  ChatGptAuthRequiredError,
  ChatGptReauthRequiredError,
  disconnectChatGptAccount,
  getValidChatGptAccessToken,
  readChatGptAccountState,
  resetChatGptOAuthRepositoryStateForTest,
  saveChatGptModelCapabilities,
  signInChatGptAccount,
  syncChatGptModelCapabilitiesFromStore,
} from './chatgpt-oauth-repository';
import * as providerSecrets from './provider-secrets';

vi.mock('../app/logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

const DISCOVERY_URL = 'https://auth.openai.com/.well-known/openid-configuration';
const AUTH_URL = 'https://auth.openai.com/api/accounts/authorize';
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
const JWKS_URL = 'https://auth.openai.com/.well-known/jwks.json';
const REVOKE_URL = 'https://auth.openai.com/api/accounts/oauth/revoke';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
  kid: 'test-key-1',
  alg: 'RS256',
  use: 'sig',
};

function signJwt(payload: Record<string, unknown>, key = privateKey, kid = 'test-key-1') {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`, 'utf8'), key).toString(
    'base64url',
  );
  return `${header}.${body}.${signature}`;
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createTestDatabase() {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  ensureAdditiveSchemaColumns(sqlite);
  return { sqlite, database: drizzle(sqlite, { schema }) };
}

describe('ChatGPT OAuth', () => {
  let sqlite: SQLiteDatabase.Database;
  let secrets: Map<string, string>;

  beforeEach(() => {
    resetChatGptOAuthCachesForTest();
    resetChatGptOAuthRepositoryStateForTest();
    const created = createTestDatabase();
    sqlite = created.sqlite;
    secrets = new Map<string, string>();
    vi.spyOn(storeDb, 'getDatabase').mockReturnValue(created.database);
    vi.spyOn(providerSecrets, 'saveStoredSecret').mockImplementation(async (ref, value) => {
      secrets.set(ref, value);
    });
    vi.spyOn(providerSecrets, 'readStoredSecret').mockImplementation(async (ref) =>
      ref ? secrets.get(ref) || '' : '',
    );
    vi.spyOn(providerSecrets, 'deleteStoredSecret').mockImplementation(async (ref) => {
      secrets.delete(ref);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sqlite.close();
  });

  it('rejects ID tokens with wrong signature, audience, or nonce', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ keys: [publicJwk] }));
    const now = Math.floor(Date.now() / 1000);
    const validPayload = {
      iss: 'https://auth.openai.com',
      aud: 'oaiapp_123',
      sub: 'user-1',
      nonce: 'nonce-1',
      email: 'reader@example.com',
      exp: now + 300,
      iat: now - 10,
    };

    const verified = await verifyChatGptIdToken(signJwt(validPayload), {
      clientId: 'oaiapp_123',
      jwksUri: JWKS_URL,
      nonce: 'nonce-1',
      nowSeconds: now,
    });
    expect(verified).toEqual({ subject: 'user-1', email: 'reader@example.com', name: undefined });

    const { privateKey: wrongKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expect(
      verifyChatGptIdToken(signJwt(validPayload, wrongKey), {
        clientId: 'oaiapp_123',
        jwksUri: JWKS_URL,
        nonce: 'nonce-1',
        nowSeconds: now,
      }),
    ).rejects.toMatchObject({ code: 'invalid_id_token' });

    await expect(
      verifyChatGptIdToken(signJwt({ ...validPayload, aud: 'oaiapp_other' }), {
        clientId: 'oaiapp_123',
        jwksUri: JWKS_URL,
        nonce: 'nonce-1',
        nowSeconds: now,
      }),
    ).rejects.toMatchObject({ code: 'invalid_id_token' });

    await expect(
      verifyChatGptIdToken(signJwt({ ...validPayload, nonce: 'wrong' }), {
        clientId: 'oaiapp_123',
        jwksUri: JWKS_URL,
        nonce: 'nonce-1',
        nowSeconds: now,
      }),
    ).rejects.toMatchObject({ code: 'invalid_id_token' });
  });

  it('completes PKCE sign-in, ignores invalid callback state, and rejects missing plan-sharing scope', async () => {
    const now = Math.floor(Date.now() / 1000);
    const originalFetch = globalThis.fetch;
    let grantedScope =
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
    let capturedNonce = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: 'https://auth.openai.com',
          authorization_endpoint: AUTH_URL,
          token_endpoint: TOKEN_URL,
          jwks_uri: JWKS_URL,
          revocation_endpoint: REVOKE_URL,
        });
      }
      if (url === JWKS_URL) return jsonResponse({ keys: [publicJwk] });
      if (url === TOKEN_URL) {
        const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
        const issuedClientId = body.get('client_id') || 'oaiapp_issued';
        return jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: grantedScope,
          id_token: signJwt({
            iss: 'https://auth.openai.com',
            aud: issuedClientId,
            sub: 'sub-reader',
            nonce: capturedNonce,
            email: 'reader@example.com',
            name: 'Reader',
            exp: now + 300,
            iat: now - 5,
          }),
        });
      }
      if (url === REVOKE_URL) return new Response(null, { status: 200 });
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const state = await signInChatGptAccount({
      openBrowser: async (authUrlString) => {
        const authUrl = new URL(authUrlString);
        expect(authUrl.searchParams.get('client_id')).toBe('dynamic_agent_client');
        expect(authUrl.searchParams.get('ext_agent_host_id')).toMatch(/^urn:uuid:/);
        capturedNonce = authUrl.searchParams.get('nonce') || '';
        const redirectUri = authUrl.searchParams.get('redirect_uri')!;
        const oauthState = authUrl.searchParams.get('state')!;
        // Unrelated loopback request with bad state must not abort the pending sign-in.
        const badResponse = await originalFetch(`${redirectUri}?code=bad&state=wrong`);
        expect(badResponse.status).toBe(400);
        const okResponse = await originalFetch(
          `${redirectUri}?code=code-1&client_id=oaiapp_issued&state=${encodeURIComponent(oauthState)}`,
        );
        expect(okResponse.status).toBe(200);
      },
    });

    expect(state).toMatchObject({
      status: 'connected',
      email: 'reader@example.com',
      name: 'Reader',
    });
    expect(readChatGptAccountState()).toMatchObject({
      status: 'connected',
      email: 'reader@example.com',
    });
    expect(await getValidChatGptAccessToken()).toBe('access-1');

    // Missing chatgpt.tokens.use.direct scope on initial sign-in must fail and clear client_id so
    // the user is not stuck bound to an ineligible account.
    await disconnectChatGptAccount();
    grantedScope = 'openid profile email offline_access';
    await expect(
      signInChatGptAccount({
        openBrowser: async (authUrlString) => {
          const authUrl = new URL(authUrlString);
          expect(authUrl.searchParams.get('client_id')).toBe('dynamic_agent_client');
          capturedNonce = authUrl.searchParams.get('nonce') || '';
          const redirectUri = authUrl.searchParams.get('redirect_uri')!;
          const oauthState = authUrl.searchParams.get('state')!;
          await originalFetch(
            `${redirectUri}?code=code-2&client_id=oaiapp_ineligible&state=${encodeURIComponent(oauthState)}`,
          );
        },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ChatGptOAuthError && error.code === 'plan_sharing_unavailable',
    );
    const rowAfterFailedInitial = storeDb
      .getDatabase()
      .select()
      .from(schema.chatgptOAuthAccounts)
      .get();
    expect(rowAfterFailedInitial?.clientId).toBeNull();
    expect(readChatGptAccountState().status).toBe('disconnected');
  });

  it('deduplicates concurrent token refreshes and marks reauth_required on invalid_grant', async () => {
    const now = Date.now();
    const credentialRef = providerSecrets.chatgptOAuthCredentialRef();
    secrets.set(
      credentialRef,
      JSON.stringify({
        accessToken: 'stale-access',
        refreshToken: 'refresh-1',
        expiresAt: now + 30_000,
        scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
      }),
    );
    storeDb
      .getDatabase()
      .insert(schema.chatgptOAuthAccounts)
      .values({
        id: 'default',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000001',
        clientId: 'oaiapp_1',
        credentialRef,
        accountEmail: 'reader@example.com',
        accountName: 'Reader',
        accountSubject: 'sub-1',
        modelCapabilitiesJson: null,
        status: 'connected',
        updatedAt: new Date(now).toISOString(),
      })
      .run();

    let refreshCalls = 0;
    let shouldFailRefresh = false;
    let revokeCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: 'https://auth.openai.com',
          authorization_endpoint: AUTH_URL,
          token_endpoint: TOKEN_URL,
          jwks_uri: JWKS_URL,
          revocation_endpoint: REVOKE_URL,
        });
      }
      if (url === TOKEN_URL) {
        refreshCalls += 1;
        if (shouldFailRefresh) {
          return jsonResponse({ error: 'invalid_grant' }, 400);
        }
        return jsonResponse({
          access_token: 'fresh-access',
          refresh_token: 'refresh-2',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid offline_access chatgpt.tokens.use.direct',
        });
      }
      if (url === REVOKE_URL) {
        revokeCalls += 1;
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const [t1, t2, t3] = await Promise.all([
      getValidChatGptAccessToken(),
      getValidChatGptAccessToken(),
      getValidChatGptAccessToken(),
    ]);
    expect([t1, t2, t3]).toEqual(['fresh-access', 'fresh-access', 'fresh-access']);
    expect(refreshCalls).toBe(1);

    // Expire token again and simulate revoked refresh token.
    secrets.set(
      credentialRef,
      JSON.stringify({
        accessToken: 'fresh-access',
        refreshToken: 'refresh-2',
        expiresAt: Date.now() - 1000,
        scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
      }),
    );
    shouldFailRefresh = true;
    await expect(getValidChatGptAccessToken()).rejects.toBeInstanceOf(ChatGptReauthRequiredError);
    expect(readChatGptAccountState().status).toBe('reauth_required');

    // Reconnect credentials and verify disconnect revokes and clears state.
    secrets.set(
      credentialRef,
      JSON.stringify({
        accessToken: 'fresh-access',
        refreshToken: 'refresh-3',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
      }),
    );
    storeDb
      .getDatabase()
      .update(schema.chatgptOAuthAccounts)
      .set({ credentialRef, status: 'connected' })
      .run();
    const disconnected = await disconnectChatGptAccount();
    expect(disconnected).toEqual({ status: 'disconnected' });
    expect(revokeCalls).toBe(1);
    expect(secrets.has(credentialRef)).toBe(false);
    await expect(getValidChatGptAccessToken()).rejects.toBeInstanceOf(ChatGptAuthRequiredError);
  });

  it('prevents an in-flight refresh for account A from overwriting account B after switch', async () => {
    const now = Date.now();
    const originalFetch = globalThis.fetch;
    const refA = providerSecrets.chatgptOAuthCredentialRef('default:account-a');
    secrets.set(
      refA,
      JSON.stringify({
        accessToken: 'stale-a',
        refreshToken: 'refresh-a',
        expiresAt: now + 30_000,
        scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
      }),
    );
    storeDb
      .getDatabase()
      .insert(schema.chatgptOAuthAccounts)
      .values({
        id: 'default',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000002',
        clientId: 'oaiapp_a',
        credentialRef: refA,
        accountEmail: 'a@example.com',
        accountName: 'Account A',
        accountSubject: 'sub-a',
        modelCapabilitiesJson: null,
        status: 'connected',
        updatedAt: new Date(now).toISOString(),
      })
      .run();

    let releaseRefreshA!: () => void;
    const refreshAStarted = new Promise<void>((resolve) => {
      releaseRefreshA = resolve;
    });
    let resolveRefreshAResponse!: (response: Response) => void;
    const refreshAResponse = new Promise<Response>((resolve) => {
      resolveRefreshAResponse = resolve;
    });
    let capturedNonce = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: 'https://auth.openai.com',
          authorization_endpoint: AUTH_URL,
          token_endpoint: TOKEN_URL,
          jwks_uri: JWKS_URL,
          revocation_endpoint: REVOKE_URL,
        });
      }
      if (url === JWKS_URL) return jsonResponse({ keys: [publicJwk] });
      if (url === REVOKE_URL) return new Response(null, { status: 200 });
      if (url === TOKEN_URL) {
        const body = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();
        if (body.get('grant_type') === 'refresh_token') {
          releaseRefreshA();
          return refreshAResponse;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        return jsonResponse({
          access_token: 'access-b',
          refresh_token: 'refresh-b',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
          id_token: signJwt({
            iss: 'https://auth.openai.com',
            aud: 'oaiapp_b',
            sub: 'sub-b',
            nonce: capturedNonce,
            email: 'b@example.com',
            name: 'Account B',
            exp: nowSec + 300,
            iat: nowSec - 5,
          }),
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const staleRefreshPromise = getValidChatGptAccessToken();
    await refreshAStarted;

    await disconnectChatGptAccount();
    await signInChatGptAccount({
      openBrowser: async (authUrlString) => {
        const authUrl = new URL(authUrlString);
        capturedNonce = authUrl.searchParams.get('nonce') || '';
        const redirectUri = authUrl.searchParams.get('redirect_uri')!;
        const oauthState = authUrl.searchParams.get('state')!;
        await originalFetch(
          `${redirectUri}?code=code-b&client_id=oaiapp_b&state=${encodeURIComponent(oauthState)}`,
        );
      },
    });

    // Late response for account A must not overwrite account B's session or keyring entry.
    resolveRefreshAResponse(
      jsonResponse({
        access_token: 'late-access-a',
        refresh_token: 'late-refresh-a',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'openid offline_access chatgpt.tokens.use.direct',
      }),
    );

    await expect(staleRefreshPromise).rejects.toBeInstanceOf(ChatGptAuthRequiredError);
    expect(readChatGptAccountState()).toMatchObject({
      status: 'connected',
      email: 'b@example.com',
    });
    expect(await getValidChatGptAccessToken()).toBe('access-b');
  });

  it('persists model thinking capabilities across restart, clears them on disconnect, and flags failed revocation', async () => {
    const ref = providerSecrets.chatgptOAuthCredentialRef('default:cap-test');
    secrets.set(
      ref,
      JSON.stringify({
        accessToken: 'access-cap',
        refreshToken: 'refresh-cap',
        expiresAt: Date.now() + 3_600_000,
        scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
      }),
    );
    storeDb
      .getDatabase()
      .insert(schema.chatgptOAuthAccounts)
      .values({
        id: 'default',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000003',
        clientId: 'oaiapp_cap',
        credentialRef: ref,
        accountEmail: 'cap@example.com',
        accountName: 'Cap',
        accountSubject: 'sub-cap',
        modelCapabilitiesJson: null,
        status: 'connected',
        updatedAt: new Date().toISOString(),
      })
      .run();

    saveChatGptModelCapabilities([
      {
        id: 'gpt-custom-flex',
        name: 'GPT Custom Flex',
        supportedReasoningEfforts: ['none', 'medium', 'high'],
      },
    ]);

    // Simulate process restart by clearing in-memory cache and hydrating from SQLite.
    clearChatGptModelThinkingLevels();
    syncChatGptModelCapabilitiesFromStore();
    expect(
      providerThinkingCapabilities({
        presetId: 'chatgpt',
        type: 'openai-responses',
        modelName: 'gpt-custom-flex',
      }),
    ).toEqual({
      supportedEfforts: ['none', 'medium', 'high'],
      defaultEffort: 'none',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: 'https://auth.openai.com',
          authorization_endpoint: AUTH_URL,
          token_endpoint: TOKEN_URL,
          jwks_uri: JWKS_URL,
          revocation_endpoint: REVOKE_URL,
        });
      }
      if (url === REVOKE_URL) return new Response('unavailable', { status: 503 });
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const disconnected = await disconnectChatGptAccount();
    expect(disconnected).toEqual({ status: 'disconnected', remoteRevocationFailed: true });
    // After disconnect, stale account-specific model capabilities must be cleared.
    expect(
      providerThinkingCapabilities({
        presetId: 'chatgpt',
        type: 'openai-responses',
        modelName: 'gpt-custom-flex',
      }),
    ).toEqual({
      supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
    });
  });

  it('rejects a stale keyring read after disconnect and ignores stale-session model capability writes', async () => {
    const refA = providerSecrets.chatgptOAuthCredentialRef('default:race-read');
    const validCreds = JSON.stringify({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
    });
    secrets.set(refA, validCreds);
    storeDb
      .getDatabase()
      .insert(schema.chatgptOAuthAccounts)
      .values({
        id: 'default',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000004',
        clientId: 'oaiapp_race',
        credentialRef: refA,
        accountEmail: 'race@example.com',
        accountName: 'Race',
        accountSubject: 'sub-race',
        modelCapabilitiesJson: null,
        status: 'connected',
        updatedAt: new Date().toISOString(),
      })
      .run();

    let releaseFirstRead!: (value: string) => void;
    let readCount = 0;
    vi.spyOn(providerSecrets, 'readStoredSecret').mockImplementation(async (ref) => {
      readCount += 1;
      if (readCount === 1) {
        return new Promise<string>((resolve) => {
          releaseFirstRead = resolve;
        });
      }
      return ref ? secrets.get(ref) || '' : '';
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        issuer: 'https://auth.openai.com',
        authorization_endpoint: AUTH_URL,
        token_endpoint: TOKEN_URL,
        jwks_uri: JWKS_URL,
        revocation_endpoint: REVOKE_URL,
      }),
    );

    const tokenPromise = getValidChatGptAccessToken();
    const disconnectPromise = disconnectChatGptAccount();
    releaseFirstRead(validCreds);

    await expect(tokenPromise).rejects.toBeInstanceOf(ChatGptAuthRequiredError);
    await disconnectPromise;

    // Stale model capability write bound to refA must be ignored once refB is active.
    const refB = providerSecrets.chatgptOAuthCredentialRef('default:race-b');
    storeDb
      .getDatabase()
      .update(schema.chatgptOAuthAccounts)
      .set({ credentialRef: refB, clientId: 'oaiapp_b', status: 'connected' })
      .run();
    const saved = saveChatGptModelCapabilities(
      [{ id: 'stale-a-model', name: 'Stale A', supportedReasoningEfforts: ['none', 'low'] }],
      refA,
    );
    expect(saved).toBe(false);
    const row = storeDb.getDatabase().select().from(schema.chatgptOAuthAccounts).get();
    expect(row?.modelCapabilitiesJson).toBeNull();
  });

  it('retains issued client_id on retryable invalid_grant during initial sign-in', async () => {
    const originalFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = requestUrl(input);
      if (url.startsWith('http://127.0.0.1:')) return originalFetch(input, init);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: 'https://auth.openai.com',
          authorization_endpoint: AUTH_URL,
          token_endpoint: TOKEN_URL,
          jwks_uri: JWKS_URL,
          revocation_endpoint: REVOKE_URL,
        });
      }
      if (url === TOKEN_URL) {
        return jsonResponse({ error: 'invalid_grant' }, 400);
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    await expect(
      signInChatGptAccount({
        openBrowser: async (authUrlString) => {
          const authUrl = new URL(authUrlString);
          const redirectUri = authUrl.searchParams.get('redirect_uri')!;
          const oauthState = authUrl.searchParams.get('state')!;
          await originalFetch(
            `${redirectUri}?code=expired-code&client_id=oaiapp_retryable&state=${encodeURIComponent(oauthState)}`,
          );
        },
      }),
    ).rejects.toBeInstanceOf(ChatGptOAuthError);

    expect(readChatGptAccountState()).toMatchObject({
      status: 'disconnected',
      hasSavedRegistration: true,
    });
    const row = storeDb.getDatabase().select().from(schema.chatgptOAuthAccounts).get();
    expect(row?.clientId).toBe('oaiapp_retryable');
  });

  it('still deletes keyring credentials on transient read failure and retains ref if delete fails', async () => {
    const refA = providerSecrets.chatgptOAuthCredentialRef('default:cleanup-read-fail');
    secrets.set(
      refA,
      JSON.stringify({
        accessToken: 'at-cleanup-1',
        refreshToken: 'rt-cleanup-1',
        expiresAt: Date.now() + 3600_000,
        scopes: ['openid', 'offline_access'],
      }),
    );
    storeDb
      .getDatabase()
      .insert(schema.chatgptOAuthAccounts)
      .values({
        id: 'default',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000005',
        clientId: 'oaiapp_cleanup_1',
        credentialRef: refA,
        accountEmail: 'cleanup@example.com',
        accountName: 'Cleanup',
        accountSubject: 'sub-cleanup-1',
        modelCapabilitiesJson: null,
        status: 'connected',
        updatedAt: new Date().toISOString(),
      })
      .run();

    vi.spyOn(providerSecrets, 'readStoredSecret').mockRejectedValueOnce(
      new Error('Keyring read transient error'),
    );
    const first = await disconnectChatGptAccount();
    expect(first).toEqual({ status: 'disconnected', remoteRevocationFailed: true });
    expect(secrets.has(refA)).toBe(false);

    // When both read and delete fail temporarily, keep credentialRef while disconnected so a retry cleans up.
    const refB = providerSecrets.chatgptOAuthCredentialRef('default:cleanup-delete-fail');
    secrets.set(
      refB,
      JSON.stringify({
        accessToken: 'at-cleanup-2',
        refreshToken: 'rt-cleanup-2',
        expiresAt: Date.now() + 3600_000,
        scopes: ['openid', 'offline_access'],
      }),
    );
    storeDb
      .getDatabase()
      .update(schema.chatgptOAuthAccounts)
      .set({
        clientId: 'oaiapp_cleanup_2',
        credentialRef: refB,
        status: 'connected',
      })
      .run();
    const revokeSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input);
      if (url === DISCOVERY_URL) {
        return jsonResponse({
          issuer: 'https://auth.openai.com',
          authorization_endpoint: AUTH_URL,
          token_endpoint: TOKEN_URL,
          jwks_uri: JWKS_URL,
          revocation_endpoint: REVOKE_URL,
        });
      }
      if (url === REVOKE_URL) return new Response(null, { status: 200 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.spyOn(providerSecrets, 'readStoredSecret').mockRejectedValueOnce(
      new Error('Keyring locked'),
    );
    vi.spyOn(providerSecrets, 'deleteStoredSecret').mockRejectedValueOnce(
      new Error('Keyring locked'),
    );

    await expect(disconnectChatGptAccount()).rejects.toThrow('keyring');
    expect(readChatGptAccountState()).toMatchObject({
      status: 'disconnected',
      hasSavedRegistration: true,
    });
    await expect(getValidChatGptAccessToken()).rejects.toBeInstanceOf(ChatGptAuthRequiredError);

    const retry = await disconnectChatGptAccount();
    expect(retry).toEqual({ status: 'disconnected' });
    expect(secrets.has(refB)).toBe(false);
    expect(revokeSpy).toHaveBeenCalledWith(REVOKE_URL, expect.anything());
  });

  it('blocks starting a new sign-in while disconnect remote revocation is still in progress', async () => {
    const refA = providerSecrets.chatgptOAuthCredentialRef('default:revoke-in-flight');
    secrets.set(
      refA,
      JSON.stringify({
        accessToken: 'at-revoke',
        refreshToken: 'rt-revoke',
        expiresAt: Date.now() + 3600_000,
        scopes: ['openid', 'offline_access'],
      }),
    );
    storeDb
      .getDatabase()
      .insert(schema.chatgptOAuthAccounts)
      .values({
        id: 'default',
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000006',
        clientId: 'oaiapp_revoke_block',
        credentialRef: refA,
        accountEmail: 'revoke@example.com',
        accountName: 'Revoke',
        accountSubject: 'sub-revoke',
        modelCapabilitiesJson: null,
        status: 'connected',
        updatedAt: new Date().toISOString(),
      })
      .run();

    let releaseRevoke!: () => void;
    const revokeStarted = new Promise<void>((resolve) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url === DISCOVERY_URL) {
          return jsonResponse({
            issuer: 'https://auth.openai.com',
            authorization_endpoint: AUTH_URL,
            token_endpoint: TOKEN_URL,
            jwks_uri: JWKS_URL,
            revocation_endpoint: REVOKE_URL,
          });
        }
        if (url === REVOKE_URL) {
          resolve();
          await new Promise<void>((done) => {
            releaseRevoke = done;
          });
          return new Response(null, { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
    });

    const disconnectPromise = disconnectChatGptAccount();
    await revokeStarted;

    const openBrowser = vi.fn(async () => undefined);
    await expect(signInChatGptAccount({ openBrowser })).rejects.toMatchObject({
      code: 'disconnect_in_progress',
    });
    expect(openBrowser).not.toHaveBeenCalled();

    releaseRevoke();
    expect(await disconnectPromise).toEqual({ status: 'disconnected' });
  });

  it('rejects saving a ChatGPT provider without a selected model instead of falling back to gpt-5.4', async () => {
    const { buildProviderRecord } = await import('./provider-repository');
    expect(() =>
      buildProviderRecord(
        {
          presetId: 'chatgpt',
          name: 'ChatGPT',
          modelName: '',
          modelNames: [],
        },
        { now: '2026-11-22T00:00:00.000Z' },
      ),
    ).toThrow('ChatGPT model selection is required');
  });
});
