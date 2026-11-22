import { generateKeyPairSync, sign } from 'node:crypto';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureAdditiveSchemaColumns, migrations } from '../db/migrations';
import * as schema from '../db/schema';
import * as storeDb from '../store/store-db';
import {
  authorizeChatGpt,
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
  signInChatGptAccount,
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
        return jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: grantedScope,
          id_token: signJwt({
            iss: 'https://auth.openai.com',
            aud: 'oaiapp_issued',
            sub: 'sub-reader',
            nonce: capturedNonce,
            email: 'reader@example.com',
            name: 'Reader',
            exp: now + 300,
            iat: now - 5,
          }),
        });
      }
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

    // Missing chatgpt.tokens.use.direct scope must fail explicitly.
    grantedScope = 'openid profile email offline_access';
    await expect(
      authorizeChatGpt({
        hostId: 'urn:uuid:00000000-0000-4000-8000-000000000001',
        openBrowser: async (authUrlString) => {
          const authUrl = new URL(authUrlString);
          capturedNonce = authUrl.searchParams.get('nonce') || '';
          const redirectUri = authUrl.searchParams.get('redirect_uri')!;
          const oauthState = authUrl.searchParams.get('state')!;
          await originalFetch(
            `${redirectUri}?code=code-2&client_id=oaiapp_issued&state=${encodeURIComponent(oauthState)}`,
          );
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ChatGptOAuthError && error.code === 'plan_sharing_unavailable',
    );
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
});
