import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { powerMonitor } from 'electron';
import type { AppSettings } from '@yomitomo/shared';
import { getDatabase } from '../store/store-db';
import {
  readTelemetryEnabled,
  readTelemetryState,
  type StoredTelemetryState,
  upsertTelemetryState,
} from './telemetry-repository';

const telemetryEndpoint = 'https://telemetry.yomitomo.app/v1/heartbeat';
const startupDelayMs = 30_000;
const checkIntervalMs = 60 * 60 * 1000;
const requestTimeoutMs = 2_000;

type TelemetryReason = 'startup' | 'interval' | 'resume' | 'focus' | 'manual';

export type TelemetryHeartbeatPayload = {
  installId: string;
  appVersion: string;
  platform: 'darwin' | 'win32' | 'linux';
  osVersion: string;
  osVersionMajor: string;
  arch: string;
  clientDay: string;
  timezone?: string;
};

type DesktopTelemetryClientDependencies = {
  endpoint?: string;
  fetch: typeof fetch;
  getAppVersion: () => string;
  getSettings: () => Pick<AppSettings, 'telemetryEnabled'>;
  getState: () => StoredTelemetryState;
  now: () => Date;
  osRelease: () => string;
  platform: NodeJS.Platform;
  arch: string;
  randomId: () => string;
  saveState: (state: StoredTelemetryState) => void;
  timezone: () => string | undefined;
  timeoutMs?: number;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

type DesktopTelemetryControllerDependencies = {
  getAppVersion: () => string;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export type DesktopTelemetryController = {
  check: (reason: TelemetryReason) => void;
  dispose: () => void;
};

export function createDesktopTelemetryController(
  dependencies: DesktopTelemetryControllerDependencies,
): DesktopTelemetryController {
  const clientDependencies: DesktopTelemetryClientDependencies = {
    fetch: globalThis.fetch.bind(globalThis),
    getAppVersion: dependencies.getAppVersion,
    getSettings: () => ({ telemetryEnabled: readTelemetryEnabled(getDatabase()) }),
    getState: () => readTelemetryState(getDatabase()),
    now: () => new Date(),
    osRelease: () => os.release(),
    platform: process.platform,
    arch: process.arch,
    randomId: randomUUID,
    saveState: (state) => upsertTelemetryState(getDatabase(), state),
    timezone: currentTimezone,
    logInfo: dependencies.logInfo,
    logError: dependencies.logError,
  };
  let running: Promise<void> | null = null;
  const run = (reason: TelemetryReason) => {
    if (running) return;
    running = runDesktopTelemetryHeartbeat(reason, clientDependencies)
      .then((result) => {
        if (result.status === 'sent')
          dependencies.logInfo?.('telemetry.heartbeat_sent', { reason });
      })
      .catch((error) => {
        dependencies.logError?.('telemetry.heartbeat_failed', error, { reason });
      })
      .finally(() => {
        running = null;
      });
  };

  const startupTimer = setTimeout(() => run('startup'), startupDelayMs);
  startupTimer.unref?.();
  const intervalTimer = setInterval(() => run('interval'), checkIntervalMs);
  intervalTimer.unref?.();
  const resumeListener = () => run('resume');
  powerMonitor.on('resume', resumeListener);

  return {
    check: run,
    dispose: () => {
      clearTimeout(startupTimer);
      clearInterval(intervalTimer);
      powerMonitor.off('resume', resumeListener);
    },
  };
}

export async function runDesktopTelemetryHeartbeat(
  reason: TelemetryReason,
  dependencies: DesktopTelemetryClientDependencies,
) {
  if (dependencies.getSettings().telemetryEnabled === false) {
    return { status: 'disabled' as const };
  }

  const now = dependencies.now();
  const today = clientDay(now);
  const state = dependencies.getState();
  if (state.lastHeartbeatDay === today) return { status: 'already-sent' as const };

  const installId = state.installId || dependencies.randomId();
  if (!state.installId) dependencies.saveState({ ...state, installId });

  const payload = buildTelemetryHeartbeatPayload({
    installId,
    appVersion: dependencies.getAppVersion(),
    now,
    osVersion: dependencies.osRelease(),
    platform: dependencies.platform,
    arch: dependencies.arch,
    timezone: dependencies.timezone(),
  });
  if (!payload) return { status: 'unsupported-platform' as const };

  const response = await postTelemetryHeartbeat(payload, dependencies);
  if (!response.ok) {
    dependencies.logInfo?.('telemetry.heartbeat_rejected', {
      reason,
      status: response.status,
    });
    return { status: 'failed' as const };
  }

  dependencies.saveState({ installId, lastHeartbeatDay: today });
  return { status: 'sent' as const };
}

export function buildTelemetryHeartbeatPayload(input: {
  installId: string;
  appVersion: string;
  now: Date;
  osVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  timezone?: string;
}): TelemetryHeartbeatPayload | null {
  const platform = telemetryPlatform(input.platform);
  if (!platform) return null;
  const osVersion = input.osVersion || 'unknown';
  return {
    installId: input.installId,
    appVersion: input.appVersion || 'unknown',
    platform,
    osVersion,
    osVersionMajor: osVersion.split('.')[0] || osVersion,
    arch: input.arch || 'unknown',
    clientDay: clientDay(input.now),
    timezone: input.timezone,
  };
}

async function postTelemetryHeartbeat(
  payload: TelemetryHeartbeatPayload,
  dependencies: DesktopTelemetryClientDependencies,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? requestTimeoutMs);
  timeout.unref?.();
  try {
    return await dependencies.fetch(dependencies.endpoint ?? telemetryEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function telemetryPlatform(platform: NodeJS.Platform) {
  return platform === 'darwin' || platform === 'win32' || platform === 'linux' ? platform : null;
}

function clientDay(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
