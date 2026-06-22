type Env = {
  TELEMETRY_ANALYTICS?: AnalyticsEngineDataset;
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

export async function handleRequest(request: Request, env: Env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== heartbeatPath) return notFound();
  if (request.method !== 'POST') return methodNotAllowed();

  const heartbeat = await readHeartbeat(request);
  if (!heartbeat) return badRequest();

  recordHeartbeat(env, heartbeat);
  return new Response(null, { status: 204 });
}

async function readHeartbeat(request: Request) {
  try {
    return parseHeartbeat(await request.json());
  } catch {
    return null;
  }
}

export function parseHeartbeat(input: unknown): TelemetryHeartbeat | null {
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
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
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
