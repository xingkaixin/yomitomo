import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { createServer, type RequestListener } from 'node:http';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const DIRECT_TOKEN_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${DIRECT_TOKEN_SCOPE}`;
const DYNAMIC_CLIENT_ID = 'dynamic_agent_client';
const CALLBACK_PATH = '/auth/callback';
const APP_NAME_HINT = 'Yomitomo';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
const CLOCK_TOLERANCE_SECONDS = 60;
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,200}$/;

const REAUTH_ERROR_CODES = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);

export type ChatGptOAuthErrorCode =
  | 'cancelled'
  | 'disconnect_in_progress'
  | 'timeout'
  | 'discovery_failed'
  | 'callback_failed'
  | 'registration_incomplete'
  | 'invalid_id_token'
  | 'account_mismatch'
  | 'invalid_token_response'
  | 'plan_sharing_unavailable'
  | 'reauth_required'
  | 'network_error'
  | 'oauth_error';

export class ChatGptOAuthError extends Error {
  readonly code: ChatGptOAuthErrorCode;
  readonly oauthCode?: string;

  constructor(code: ChatGptOAuthErrorCode, message: string, oauthCode?: string) {
    super(message);
    this.name = 'ChatGptOAuthError';
    this.code = code;
    this.oauthCode = oauthCode;
  }
}

export type ChatGptOAuthCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
};

export type ChatGptVerifiedIdentity = {
  subject: string;
  email?: string;
  name?: string;
};

export type ChatGptSignInResult = {
  clientId: string;
  identity: ChatGptVerifiedIdentity;
  credentials: ChatGptOAuthCredentials;
};

export type ChatGptRefreshResult = {
  credentials: ChatGptOAuthCredentials;
  identity?: ChatGptVerifiedIdentity;
};

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
};

type JwkKey = Record<string, unknown> & {
  kid?: string;
  kty?: string;
  use?: string;
  alg?: string;
};

let discoveryCache: Promise<OidcDiscovery> | undefined;
const jwksCache = new Map<string, JwkKey[]>();

export function resetChatGptOAuthCachesForTest() {
  discoveryCache = undefined;
  jwksCache.clear();
}

export async function authorizeChatGpt(options: {
  hostId: string;
  savedClientId?: string;
  savedSubject?: string;
  loginHint?: string;
  reconsent?: boolean;
  openBrowser: (url: string) => Promise<void>;
  onClientRegistered?: (clientId: string) => void | Promise<void>;
  signal: AbortSignal;
}): Promise<ChatGptSignInResult> {
  const discovery = await loadDiscovery(options.signal);
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(32);
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const signInSignal = AbortSignal.any([options.signal, AbortSignal.timeout(SIGN_IN_TIMEOUT_MS)]);
  const listener = await startLoopbackCallback(state, options.savedClientId, signInSignal);

  try {
    const authUrl = new URL(discovery.authorization_endpoint);
    const params = new URLSearchParams({
      client_id: options.savedClientId || DYNAMIC_CLIENT_ID,
      response_type: 'code',
      redirect_uri: listener.redirectUri,
      scope: SCOPES,
      resource: RESOURCE,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      ext_agent_host_id: options.hostId,
    });
    if (!options.savedClientId) params.set('agent_name_hint', APP_NAME_HINT);
    if (options.loginHint) params.set('login_hint', options.loginHint);
    if (options.reconsent) params.set('prompt', 'consent');
    authUrl.search = params.toString();

    await options.openBrowser(authUrl.toString());
    const callback = await listener.result;
    // Persist the issued client_id before the one-time code exchange so a failed exchange does
    // not register a duplicate OAuth client on retry.
    await options.onClientRegistered?.(callback.clientId);

    const tokenBody = await postTokenRequest(
      discovery.token_endpoint,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: callback.clientId,
        code: callback.code,
        code_verifier: codeVerifier,
        redirect_uri: listener.redirectUri,
        resource: RESOURCE,
      }),
      signInSignal,
    );

    if (typeof tokenBody.id_token !== 'string' || !tokenBody.id_token) {
      throw new ChatGptOAuthError(
        'invalid_id_token',
        'ChatGPT did not return an identity token. Sign in again.',
      );
    }
    const identity = await verifyChatGptIdToken(tokenBody.id_token, {
      clientId: callback.clientId,
      jwksUri: discovery.jwks_uri,
      nonce,
      signal: signInSignal,
    });
    if (options.savedSubject && identity.subject !== options.savedSubject) {
      throw new ChatGptOAuthError(
        'account_mismatch',
        'Signed in with a different ChatGPT account. Disconnect first to switch accounts.',
      );
    }
    const credentials = parseTokenCredentials(tokenBody);
    return {
      clientId: callback.clientId,
      identity,
      credentials,
    };
  } catch (error) {
    if (error instanceof ChatGptOAuthError) throw error;
    if (options.signal.aborted) {
      throw new ChatGptOAuthError('cancelled', 'ChatGPT sign-in was cancelled.');
    }
    if (isTimeoutError(error)) {
      throw new ChatGptOAuthError('timeout', 'ChatGPT sign-in timed out. Try again.');
    }
    throw new ChatGptOAuthError(
      'network_error',
      error instanceof Error ? error.message : 'ChatGPT sign-in failed.',
    );
  } finally {
    listener.close();
  }
}

export async function refreshChatGptTokens(options: {
  clientId: string;
  refreshToken: string;
  previousScopes: string[];
  expectedSubject?: string;
  signal?: AbortSignal;
}): Promise<ChatGptRefreshResult> {
  const signal = options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const discovery = await loadDiscovery(signal);
  let tokenBody: Record<string, unknown>;
  try {
    tokenBody = await postTokenRequest(
      discovery.token_endpoint,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: options.clientId,
        refresh_token: options.refreshToken,
        resource: RESOURCE,
      }),
      signal,
    );
  } catch (error) {
    if (
      error instanceof ChatGptOAuthError &&
      error.oauthCode &&
      REAUTH_ERROR_CODES.has(error.oauthCode)
    ) {
      throw new ChatGptOAuthError(
        'reauth_required',
        'Your ChatGPT session expired. Sign in again.',
        error.oauthCode,
      );
    }
    throw error;
  }

  let identity: ChatGptVerifiedIdentity | undefined;
  if (tokenBody.id_token !== undefined) {
    if (typeof tokenBody.id_token !== 'string' || !tokenBody.id_token) {
      throw new ChatGptOAuthError(
        'invalid_id_token',
        'ChatGPT returned an invalid identity token during refresh.',
      );
    }
    identity = await verifyChatGptIdToken(tokenBody.id_token, {
      clientId: options.clientId,
      jwksUri: discovery.jwks_uri,
      signal,
    });
    if (options.expectedSubject && identity.subject !== options.expectedSubject) {
      throw new ChatGptOAuthError(
        'reauth_required',
        'The refreshed ChatGPT account does not match. Sign in again.',
      );
    }
  }

  const credentials = parseTokenCredentials(tokenBody, {
    fallbackRefreshToken: options.refreshToken,
    fallbackScopes: options.previousScopes,
  });
  return { credentials, identity };
}

export async function revokeChatGptRefreshToken(options: {
  clientId: string;
  refreshToken: string;
}): Promise<void> {
  const signal = AbortSignal.timeout(10_000);
  const discovery = await loadDiscovery(signal);
  if (!discovery.revocation_endpoint) {
    throw new ChatGptOAuthError('oauth_error', 'ChatGPT revocation endpoint is unavailable.');
  }
  const response = await fetchStrict(
    discovery.revocation_endpoint,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: options.refreshToken,
        token_type_hint: 'refresh_token',
        client_id: options.clientId,
      }),
    },
    signal,
  );
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) {
    throw new ChatGptOAuthError(
      'oauth_error',
      `ChatGPT token revocation failed with HTTP ${response.status}.`,
    );
  }
}

export async function verifyChatGptIdToken(
  idToken: string,
  options: {
    clientId: string;
    jwksUri: string;
    nonce?: string;
    signal?: AbortSignal;
    nowSeconds?: number;
  },
): Promise<ChatGptVerifiedIdentity> {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new ChatGptOAuthError('invalid_id_token', 'Invalid ChatGPT ID token format.');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeBase64UrlJson(encodedHeader);
  const payload = decodeBase64UrlJson(encodedPayload);
  if (!header || !payload || header.alg !== 'RS256') {
    throw new ChatGptOAuthError('invalid_id_token', 'Unsupported ChatGPT ID token algorithm.');
  }

  const kid = typeof header.kid === 'string' ? header.kid : undefined;
  const signature = Buffer.from(encodedSignature, 'base64url');
  const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8');
  const verified = await verifyWithJwks(
    options.jwksUri,
    kid,
    signingInput,
    signature,
    options.signal,
  );
  if (!verified) {
    throw new ChatGptOAuthError(
      'invalid_id_token',
      'ChatGPT ID token signature could not be verified.',
    );
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const audMatches =
    payload.aud === options.clientId ||
    (Array.isArray(payload.aud) &&
      payload.aud.includes(options.clientId) &&
      (payload.aud.length === 1 || payload.azp === options.clientId));
  const azpValid = payload.azp === undefined || payload.azp === options.clientId;
  const expValid = typeof payload.exp === 'number' && payload.exp > now - CLOCK_TOLERANCE_SECONDS;
  const iatValid = typeof payload.iat === 'number' && payload.iat <= now + CLOCK_TOLERANCE_SECONDS;
  const nonceValid = options.nonce === undefined || payload.nonce === options.nonce;
  if (
    payload.iss !== ISSUER ||
    !audMatches ||
    !azpValid ||
    !expValid ||
    !iatValid ||
    !nonceValid ||
    typeof payload.sub !== 'string' ||
    !payload.sub
  ) {
    throw new ChatGptOAuthError('invalid_id_token', 'ChatGPT ID token claims are invalid.');
  }

  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' && payload.email ? payload.email : undefined,
    name: typeof payload.name === 'string' && payload.name ? payload.name : undefined,
  };
}

async function verifyWithJwks(
  jwksUri: string,
  kid: string | undefined,
  signingInput: Buffer,
  signature: Buffer,
  signal?: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const keys = await loadJwks(jwksUri, attempt === 1, signal);
    const candidates = kid ? keys.filter((key) => key.kid === kid) : keys;
    for (const jwk of candidates) {
      if (jwk.kty !== 'RSA') continue;
      try {
        const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
        if (verify('RSA-SHA256', signingInput, publicKey, signature)) return true;
      } catch {
        continue;
      }
    }
    if (candidates.length > 0 && attempt === 0) break;
  }
  return false;
}

async function loadJwks(
  jwksUri: string,
  forceRefresh: boolean,
  signal?: AbortSignal,
): Promise<JwkKey[]> {
  if (!forceRefresh) {
    const cached = jwksCache.get(jwksUri);
    if (cached) return cached;
  }
  const response = await fetchStrict(jwksUri, { headers: { accept: 'application/json' } }, signal);
  const body = await readJsonObject(response);
  if (!response.ok || !Array.isArray(body?.keys)) {
    throw new ChatGptOAuthError(
      'discovery_failed',
      'Unable to load ChatGPT signing keys. Try again shortly.',
    );
  }
  const keys = body.keys.filter(isPlainObject) as JwkKey[];
  jwksCache.set(jwksUri, keys);
  return keys;
}

async function loadDiscovery(signal?: AbortSignal): Promise<OidcDiscovery> {
  discoveryCache ??= (async () => {
    const response = await fetchStrict(
      `${ISSUER}/.well-known/openid-configuration`,
      { headers: { accept: 'application/json' } },
      signal,
    );
    const data = await readJsonObject(response);
    if (!response.ok || !data || data.issuer !== ISSUER) {
      throw new ChatGptOAuthError(
        'discovery_failed',
        'Unable to verify ChatGPT sign-in configuration.',
      );
    }
    for (const field of [
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'revocation_endpoint',
    ] as const) {
      const value = data[field];
      if (field === 'revocation_endpoint' && value === undefined) continue;
      if (typeof value !== 'string' || !hasOrigin(value, ISSUER)) {
        throw new ChatGptOAuthError(
          'discovery_failed',
          'ChatGPT sign-in endpoints did not match the expected OpenAI issuer.',
        );
      }
    }
    return data as unknown as OidcDiscovery;
  })().catch((error: unknown) => {
    discoveryCache = undefined;
    throw error;
  });
  return discoveryCache;
}

async function postTokenRequest(
  tokenEndpoint: string,
  body: URLSearchParams,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetchStrict(
    tokenEndpoint,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
    },
    signal,
  );
  const data = await readJsonObject(response);
  if (!response.ok) {
    const oauthCode = typeof data?.error === 'string' ? data.error : undefined;
    const description =
      typeof data?.error_description === 'string' && data.error_description
        ? data.error_description
        : oauthCode || `HTTP ${response.status}`;
    throw new ChatGptOAuthError(
      'oauth_error',
      `ChatGPT authorization failed: ${description}`,
      oauthCode,
    );
  }
  if (!data) {
    throw new ChatGptOAuthError(
      'invalid_token_response',
      'ChatGPT returned an invalid token response.',
    );
  }
  return data;
}

function parseTokenCredentials(
  data: Record<string, unknown>,
  options: { fallbackRefreshToken?: string; fallbackScopes?: string[] } = {},
): ChatGptOAuthCredentials {
  const scopeText =
    typeof data.scope === 'string' ? data.scope : (options.fallbackScopes?.join(' ') ?? '');
  const scopes = scopeText.split(/\s+/).filter(Boolean);
  if (!scopes.includes(DIRECT_TOKEN_SCOPE)) {
    throw new ChatGptOAuthError(
      'plan_sharing_unavailable',
      'This ChatGPT account did not grant ChatGPT plan usage permission.',
    );
  }
  const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
  const tokenType = typeof data.token_type === 'string' ? data.token_type.toLowerCase() : '';
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 0;
  const refreshToken =
    typeof data.refresh_token === 'string' && data.refresh_token
      ? data.refresh_token
      : options.fallbackRefreshToken || '';
  if (
    !accessToken ||
    tokenType !== 'bearer' ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0 ||
    !refreshToken
  ) {
    throw new ChatGptOAuthError(
      'invalid_token_response',
      'ChatGPT returned incomplete OAuth credentials. Sign in again.',
    );
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes,
  };
}

type CallbackResult = {
  code: string;
  clientId: string;
};

async function startLoopbackCallback(
  expectedState: string,
  savedClientId: string | undefined,
  signal: AbortSignal,
): Promise<{
  redirectUri: string;
  result: Promise<CallbackResult>;
  close: () => void;
}> {
  let resolveCallback!: (value: CallbackResult) => void;
  let rejectCallback!: (error: Error) => void;
  let settled = false;
  const result = new Promise<CallbackResult>((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  void result.catch(() => undefined);

  let port = 0;
  const finish = (outcome: CallbackResult | ChatGptOAuthError) => {
    if (settled) return;
    settled = true;
    if (outcome instanceof ChatGptOAuthError) rejectCallback(outcome);
    else resolveCallback(outcome);
  };

  const script = 'history.replaceState(null, "", "/auth/complete");';
  const scriptHash = createHash('sha256').update(script).digest('base64');
  const handler: RequestListener = (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'`,
    );

    let url: URL;
    try {
      url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
    } catch {
      response.writeHead(400).end('Invalid request');
      return;
    }
    if (
      request.method !== 'GET' ||
      request.headers.host !== `127.0.0.1:${port}` ||
      url.pathname !== CALLBACK_PATH ||
      settled
    ) {
      response.writeHead(404).end('Not found');
      return;
    }

    const returnedState = Buffer.from(url.searchParams.get('state') ?? '');
    const expected = Buffer.from(expectedState);
    if (
      url.searchParams.getAll('state').length !== 1 ||
      returnedState.length !== expected.length ||
      !timingSafeEqual(returnedState, expected)
    ) {
      response.writeHead(400).end('Invalid sign-in state.');
      return;
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Return to Yomitomo</title><style>body{font:16px system-ui,-apple-system,sans-serif;max-width:30rem;margin:18vh auto;padding:24px;color:#1f2328}h1{font-size:22px;margin:0 0 8px}</style><h1>Return to Yomitomo</h1><p>Sign-in finished. You can close this browser tab.</p><script>${script}</script></html>`,
    );

    const oauthError = url.searchParams.get('error');
    if (oauthError) {
      finish(
        new ChatGptOAuthError(
          oauthError === 'access_denied' ? 'cancelled' : 'oauth_error',
          oauthError === 'access_denied'
            ? 'ChatGPT sign-in was cancelled.'
            : `ChatGPT sign-in failed: ${oauthError}`,
          oauthError,
        ),
      );
      return;
    }

    const code = url.searchParams.get('code');
    const returnedClientId = url.searchParams.get('client_id');
    const clientId = returnedClientId ?? savedClientId;
    if (
      !code ||
      url.searchParams.getAll('code').length !== 1 ||
      url.searchParams.getAll('client_id').length > 1 ||
      !clientId ||
      clientId === DYNAMIC_CLIENT_ID ||
      !CLIENT_ID_PATTERN.test(clientId) ||
      (savedClientId && returnedClientId && savedClientId !== returnedClientId)
    ) {
      finish(
        new ChatGptOAuthError(
          'registration_incomplete',
          'ChatGPT did not complete app registration. Try signing in again.',
        ),
      );
      return;
    }
    finish({ code, clientId });
  };

  const server = createServer(handler);
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  const close = () => {
    signal.removeEventListener('abort', onAbort);
    server.close();
    server.closeAllConnections();
  };
  const onAbort = () => {
    finish(
      isTimeoutError(signal.reason)
        ? new ChatGptOAuthError('timeout', 'ChatGPT sign-in timed out. Try again.')
        : new ChatGptOAuthError('cancelled', 'ChatGPT sign-in was cancelled.'),
    );
    close();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ host: '127.0.0.1', port: 0 }, () => {
        server.removeListener('error', reject);
        server.on('error', () =>
          finish(
            new ChatGptOAuthError('callback_failed', 'Local sign-in callback listener failed.'),
          ),
        );
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Loopback server address unavailable'));
          return;
        }
        port = address.port;
        resolve();
      });
    });
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    return {
      redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
      result,
      close,
    };
  } catch (error) {
    close();
    throw new ChatGptOAuthError(
      'callback_failed',
      error instanceof Error ? error.message : 'Unable to start local sign-in callback server.',
    );
  }
}

async function fetchStrict(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await fetch(url, { ...init, signal: combined, redirect: 'error' });
  } catch (error) {
    if (signal?.aborted) {
      throw isTimeoutError(signal.reason)
        ? new ChatGptOAuthError('timeout', 'ChatGPT request timed out.')
        : new ChatGptOAuthError('cancelled', 'ChatGPT request was cancelled.');
    }
    throw new ChatGptOAuthError(
      'network_error',
      error instanceof Error ? error.message : 'Unable to reach ChatGPT.',
    );
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = (await response.json()) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasOrigin(urlValue: string, expectedOrigin: string) {
  try {
    return new URL(urlValue).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === 'TimeoutError';
}

function randomBase64Url(bytes: number) {
  return randomBytes(bytes).toString('base64url');
}
