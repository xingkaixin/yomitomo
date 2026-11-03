import { describe, expect, it, vi } from 'vitest';
import { handleRequest } from './index';

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
  it('accepts reading memory counts without identifiers or device metadata', async () => {
    const writeDataPoint = vi.fn();
    const counts = {
      feature_opened: 1,
      query_completed: 2,
      source_jump: 3,
      review_still_agree: 4,
      review_changed: 5,
      review_need_evidence: 6,
      fallback_keyword: 7,
      fallback_partial_index: 8,
      fallback_no_provider: 9,
      fallback_call_failure: 65535,
    };
    const response = await handleRequest(countsRequest(JSON.stringify({ counts })), {
      TELEMETRY_ANALYTICS: { writeDataPoint },
    });

    expect(response.status).toBe(204);
    expect(writeDataPoint.mock.calls).toEqual(
      Object.entries(counts).map(([key, count]) => [
        { blobs: ['desktop_reading_memory_count', key], doubles: [count] },
      ]),
    );
  });

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
});

describe('reading memory count boundaries', () => {
  it.each(['installId', 'question'])(
    'rejects the additional %s field before writing any count',
    async (field) => {
      const writeDataPoint = vi.fn();
      const response = await handleRequest(
        countsRequest(JSON.stringify({ counts: { feature_opened: 1 }, [field]: 'private-value' })),
        { TELEMETRY_ANALYTICS: { writeDataPoint } },
      );

      expect(response.status).toBe(400);
      expect(writeDataPoint).not.toHaveBeenCalled();
    },
  );

  it.each(['{"counts":{"feature_opened":1,"unknown":1}}', '{"counts":{"feature_opened":"1"}}'])(
    'rejects counts outside the closed integer payload: %s',
    async (body) => {
      const writeDataPoint = vi.fn();
      const response = await handleRequest(countsRequest(body), {
        TELEMETRY_ANALYTICS: { writeDataPoint },
      });

      expect(response.status).toBe(400);
      expect(writeDataPoint).not.toHaveBeenCalled();
    },
  );
});

function countsRequest(
  body: string | ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
    duplex: 'half',
  };
  return new Request('https://telemetry.yomitomo.app/v1/reading-memory-counts', init);
}
