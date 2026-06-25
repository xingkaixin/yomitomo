type Env = {
  TELEMETRY_ANALYTICS?: AnalyticsEngineDataset;
};

type TelemetryRequestOptions = {
  now?: Date;
};

type TelemetryHeartbeat = {
  installId: string;
  appVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
  osVersion: string;
  osVersionMajor: string;
  arch: string;
  clientDay: string;
  timezone?: string;
};

const heartbeatPath = '/v1/heartbeat';
const heartbeatEventType = 'desktop_daily_heartbeat';
const maxHeartbeatBodyBytes = 2048;
const acceptedPastClientDays = 2;
const acceptedFutureClientDays = 1;
const dayMs = 24 * 60 * 60 * 1000;
const methodNotAllowed = () =>
  new Response('Method not allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  });
const notFound = () => new Response('Not found', { status: 404 });
const badRequest = () => new Response('Bad request', { status: 400 });

export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<Env>;

export async function handleRequest(
  request: Request,
  env: Env = {},
  options: TelemetryRequestOptions = {},
) {
  const url = new URL(request.url);
  if (url.pathname !== heartbeatPath) return notFound();
  if (request.method !== 'POST') return methodNotAllowed();

  const heartbeat = await readHeartbeat(request, options.now ?? new Date());
  if (!heartbeat) return badRequest();

  recordHeartbeat(env, heartbeat);
  return new Response(null, { status: 204 });
}

async function readHeartbeat(request: Request, now: Date) {
  if (!isJsonRequest(request)) return null;
  if (!isContentLengthAllowed(request.headers)) return null;

  try {
    const body = await readLimitedRequestText(request);
    if (body === null) return null;
    return parseHeartbeat(JSON.parse(body), now);
  } catch {
    return null;
  }
}

export function parseHeartbeat(input: unknown, now = new Date()): TelemetryHeartbeat | null {
  if (!isRecord(input)) return null;
  const installId = boundedText(input.installId, 8, 128);
  const appVersion = boundedText(input.appVersion, 1, 80);
  const platform = parsePlatform(input.platform);
  const osVersion = boundedText(input.osVersion, 1, 120);
  const osVersionMajor = boundedText(input.osVersionMajor, 1, 40);
  const arch = boundedText(input.arch, 1, 40);
  const clientDay = parseClientDay(input.clientDay);
  const timezone = optionalBoundedText(input.timezone, 1, 80);
  if (!installId || !appVersion || !platform || !osVersion || !osVersionMajor || !arch) {
    return null;
  }
  if (!clientDay || timezone === null) return null;
  if (!isClientDayInWindow(clientDay, now)) return null;

  return {
    installId,
    appVersion,
    platform,
    osVersion,
    osVersionMajor,
    arch,
    clientDay,
    timezone,
  };
}

function recordHeartbeat(env: Env, heartbeat: TelemetryHeartbeat) {
  env.TELEMETRY_ANALYTICS?.writeDataPoint({
    blobs: [
      heartbeatEventType,
      heartbeat.installId,
      heartbeat.appVersion,
      heartbeat.platform,
      heartbeat.osVersion,
      heartbeat.osVersionMajor,
      heartbeat.arch,
      heartbeat.clientDay,
      heartbeat.timezone || 'unknown',
    ],
    doubles: [1],
    indexes: [`${heartbeat.platform}:${heartbeat.arch}`],
  });
}

function parsePlatform(value: unknown): TelemetryHeartbeat['platform'] | null {
  return value === 'darwin' || value === 'win32' || value === 'linux' ? value : null;
}

function parseClientDay(value: unknown) {
  const text = boundedText(value, 10, 10);
  return text && clientDayToUtcMs(text) !== null ? text : '';
}

function optionalBoundedText(value: unknown, minLength: number, maxLength: number) {
  if (value === undefined) return undefined;
  return boundedText(value, minLength, maxLength) || null;
}

function boundedText(value: unknown, minLength: number, maxLength: number) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text.length >= minLength && text.length <= maxLength ? text : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonRequest(request: Request) {
  const contentType = request.headers.get('content-type');
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

function isContentLengthAllowed(headers: Headers) {
  const contentLength = headers.get('content-length');
  if (!contentLength) return true;

  const length = Number(contentLength);
  return Number.isInteger(length) && length >= 0 && length <= maxHeartbeatBodyBytes;
}

async function readLimitedRequestText(request: Request) {
  const body = request.body;
  if (!body) return '';

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxHeartbeatBodyBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isClientDayInWindow(clientDay: string, now: Date) {
  const clientDayMs = clientDayToUtcMs(clientDay);
  if (clientDayMs === null) return false;

  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (
    clientDayMs >= todayMs - acceptedPastClientDays * dayMs &&
    clientDayMs <= todayMs + acceptedFutureClientDays * dayMs
  );
}

function clientDayToUtcMs(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timeMs = Date.UTC(year, month - 1, day);
  const date = new Date(timeMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timeMs;
}
