import { describe, expect, it, vi } from 'vitest';
import {
  buildTelemetryHeartbeatPayload,
  createDesktopTelemetryControllerForEnvironment,
  getDesktopTelemetryAutomationSuppression,
  runDesktopTelemetryHeartbeat,
} from './desktop-telemetry';
import type { StoredTelemetryState } from './telemetry-repository';

describe('desktop telemetry heartbeat', () => {
  it.each([['YOMITOMO_ELECTRON_SMOKE'], ['YOMITOMO_E2E'], ['YOMITOMO_DISABLE_TELEMETRY']] as const)(
    'suppresses telemetry controller creation when %s is enabled',
    (envVar) => {
      expect(getDesktopTelemetryAutomationSuppression({ [envVar]: '1' })).toEqual({ envVar });
    },
  );

  it('does not suppress production telemetry without automation env flags', () => {
    expect(
      getDesktopTelemetryAutomationSuppression({
        YOMITOMO_ELECTRON_SMOKE: '0',
        YOMITOMO_E2E: 'true',
        YOMITOMO_DISABLE_TELEMETRY: '',
      }),
    ).toBeNull();
  });

  it('does not create a telemetry controller in automation environments', () => {
    const createController = vi.fn();
    const logInfo = vi.fn();

    expect(
      createDesktopTelemetryControllerForEnvironment({
        env: { YOMITOMO_E2E: '1' },
        getAppVersion: () => '0.9.0',
        logInfo,
        createController,
      }),
    ).toBeNull();

    expect(createController).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('telemetry.disabled_for_automation', {
      envVar: 'YOMITOMO_E2E',
    });
  });

  it('creates a telemetry controller outside automation environments', () => {
    const controller = {
      check: vi.fn(),
      dispose: vi.fn(),
    };
    const createController = vi.fn().mockReturnValue(controller);

    expect(
      createDesktopTelemetryControllerForEnvironment({
        env: {},
        getAppVersion: () => '0.9.0',
        createController,
      }),
    ).toBe(controller);
    expect(createController).toHaveBeenCalledOnce();
  });

  it('sends one heartbeat and records the successful local day', async () => {
    const savedStates: StoredTelemetryState[] = [];
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      runDesktopTelemetryHeartbeat('startup', {
        fetch,
        getAppVersion: () => '0.9.0',
        getSettings: () => ({ telemetryEnabled: true }),
        getState: () => ({}),
        now: () => new Date(2026, 5, 22, 10),
        osRelease: () => '25.0.0',
        platform: 'darwin',
        arch: 'arm64',
        randomId: () => 'install-1',
        saveState: (state) => savedStates.push(state),
        timezone: () => 'Asia/Shanghai',
      }),
    ).resolves.toEqual({ status: 'sent' });

    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      installId: 'install-1',
      appVersion: '0.9.0',
      platform: 'darwin',
      osVersion: '25.0.0',
      osVersionMajor: '25',
      arch: 'arm64',
      clientDay: '2026-06-22',
      timezone: 'Asia/Shanghai',
    });
    expect(savedStates).toEqual([
      { installId: 'install-1' },
      { installId: 'install-1', lastHeartbeatDay: '2026-06-22' },
    ]);
  });

  it('skips disabled telemetry and same-day duplicates', async () => {
    const fetch = vi.fn();
    const baseDependencies = {
      fetch,
      getAppVersion: () => '0.9.0',
      now: () => new Date(2026, 5, 22, 10),
      osRelease: () => '25.0.0',
      platform: 'darwin' as NodeJS.Platform,
      arch: 'arm64',
      randomId: () => 'install-1',
      saveState: vi.fn(),
      timezone: () => 'Asia/Shanghai',
    };

    await expect(
      runDesktopTelemetryHeartbeat('startup', {
        ...baseDependencies,
        getSettings: () => ({ telemetryEnabled: false }),
        getState: () => ({}),
      }),
    ).resolves.toEqual({ status: 'disabled' });
    await expect(
      runDesktopTelemetryHeartbeat('focus', {
        ...baseDependencies,
        getSettings: () => ({ telemetryEnabled: true }),
        getState: () => ({ installId: 'install-1', lastHeartbeatDay: '2026-06-22' }),
      }),
    ).resolves.toEqual({ status: 'already-sent' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the install id but does not advance the day after failed requests', async () => {
    const savedStates: StoredTelemetryState[] = [];
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      runDesktopTelemetryHeartbeat('interval', {
        fetch,
        getAppVersion: () => '0.9.0',
        getSettings: () => ({ telemetryEnabled: true }),
        getState: () => ({}),
        now: () => new Date(2026, 5, 22, 10),
        osRelease: () => '25.0.0',
        platform: 'darwin',
        arch: 'arm64',
        randomId: () => 'install-1',
        saveState: (state) => savedStates.push(state),
        timezone: () => undefined,
      }),
    ).resolves.toEqual({ status: 'failed' });

    expect(savedStates).toEqual([{ installId: 'install-1' }]);
  });

  it('builds payloads only for supported desktop platforms', () => {
    expect(
      buildTelemetryHeartbeatPayload({
        installId: 'install-1',
        appVersion: '0.9.0',
        now: new Date(2026, 5, 22),
        osVersion: '10.0.22631',
        platform: 'win32',
        arch: 'x64',
      }),
    ).toMatchObject({
      platform: 'win32',
      osVersionMajor: '10',
      clientDay: '2026-06-22',
    });
    expect(
      buildTelemetryHeartbeatPayload({
        installId: 'install-1',
        appVersion: '0.9.0',
        now: new Date(2026, 5, 22),
        osVersion: '1',
        platform: 'freebsd',
        arch: 'x64',
      }),
    ).toBeNull();
  });
});
