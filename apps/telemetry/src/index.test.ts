import { describe, expect, it, vi } from 'vitest';
import { handleRequest, parseHeartbeat } from './index';

const heartbeat = {
  installId: '2e3f6878-1dcc-4d4f-a4b8-cc24d8f1a7ea',
  appVersion: '0.9.0',
  platform: 'darwin',
  osVersion: '25.0.0',
  osVersionMajor: '25',
  arch: 'arm64',
  clientDay: '2026-06-22',
  timezone: 'Asia/Shanghai',
};
const requestOptions = { now: new Date('2026-06-22T12:00:00.000Z') };

describe('telemetry worker', () => {
  it('accepts valid desktop heartbeat payloads', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(heartbeat),
      }),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
      requestOptions,
    );

    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: [
        'desktop_daily_heartbeat',
        heartbeat.installId,
        heartbeat.appVersion,
        heartbeat.platform,
        heartbeat.osVersion,
        heartbeat.osVersionMajor,
        heartbeat.arch,
        heartbeat.clientDay,
        heartbeat.timezone,
      ],
      doubles: [1],
      indexes: ['darwin:arm64'],
    });
  });

  it('allows missing timezone as unknown without rejecting the heartbeat', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...heartbeat, timezone: undefined }),
      }),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
      requestOptions,
    );

    expect(response.status).toBe(204);
    expect(writeDataPoint.mock.calls[0]?.[0].blobs[8]).toBe('unknown');
  });

  it('rejects invalid payloads before writing analytics', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...heartbeat, installId: '', platform: 'freebsd' }),
      }),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
      requestOptions,
    );

    expect(response.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('rejects unsupported paths and methods', async () => {
    await expect(
      handleRequest(new Request('https://telemetry.yomitomo.app/analytics.json')),
    ).resolves.toHaveProperty('status', 404);
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/heartbeat'),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('parses only the allowed heartbeat shape', () => {
    expect(parseHeartbeat(heartbeat, requestOptions.now)).toEqual(heartbeat);
    expect(parseHeartbeat({ ...heartbeat, clientDay: '2026-6-22' }, requestOptions.now)).toBeNull();
    expect(parseHeartbeat({ ...heartbeat, osVersion: '' }, requestOptions.now)).toBeNull();
  });

  it('rejects non-json heartbeat requests before reading analytics', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(heartbeat),
      }),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
      requestOptions,
    );

    expect(response.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('rejects oversized heartbeat requests before writing analytics', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...heartbeat, padding: 'x'.repeat(5000) }),
      }),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
      requestOptions,
    );

    expect(response.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('rejects heartbeat days outside the accepted reporting window', async () => {
    const writeDataPoint = vi.fn();
    for (const clientDay of ['2026-06-18', '2026-06-25']) {
      const response = await handleRequest(
        new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...heartbeat, clientDay }),
        }),
        { TELEMETRY_ANALYTICS: { writeDataPoint } },
        requestOptions,
      );

      expect(response.status).toBe(400);
    }
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('rejects non-calendar heartbeat days', () => {
    expect(
      parseHeartbeat({ ...heartbeat, clientDay: '2026-02-30' }, requestOptions.now),
    ).toBeNull();
  });
});
