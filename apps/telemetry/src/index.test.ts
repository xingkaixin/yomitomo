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

describe('reading memory count boundaries', () => {
  it.each([
    'installId',
    'requestId',
    'assetId',
    'question',
    'title',
    'quote',
    'citationId',
    'judgment',
    'answer',
    'clientDay',
    'appVersion',
    'platform',
  ])('rejects the additional %s field before writing any count', async (field) => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      countsRequest(JSON.stringify({ counts: { feature_opened: 1 }, [field]: 'private-value' })),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
    );

    expect(response.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it.each([
    '{}',
    '{"counts":{}}',
    '{"counts":[]}',
    '{"counts":null}',
    '{"counts":{"feature_opened":1,"unknown":1}}',
    '{"counts":{"__proto__":1}}',
    '{"counts":{"feature_opened":0}}',
    '{"counts":{"feature_opened":-1}}',
    '{"counts":{"feature_opened":1.5}}',
    '{"counts":{"feature_opened":65536}}',
    '{"counts":{"feature_opened":1e309}}',
    '{"counts":{"feature_opened":"1"}}',
    '{"counts":{"feature_opened":true}}',
    '{"counts":{"feature_opened":null}}',
    '{"counts":',
  ])('rejects counts outside the closed integer payload: %s', async (body) => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(countsRequest(body), {
      TELEMETRY_ANALYTICS: { writeDataPoint },
    });

    expect(response.status).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('requires POST and JSON for the count endpoint', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleRequest(
      new Request('https://telemetry.yomitomo.app/v1/reading-memory-counts'),
      { TELEMETRY_ANALYTICS: { writeDataPoint } },
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(
      (
        await handleRequest(
          countsRequest('{"counts":{"feature_opened":1}}', { 'content-type': 'text/plain' }),
          { TELEMETRY_ANALYTICS: { writeDataPoint } },
        )
      ).status,
    ).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it('does not acknowledge counts without analytics while preserving the old heartbeat response', async () => {
    expect((await handleRequest(countsRequest('{"counts":{"feature_opened":1}}'))).status).toBe(
      503,
    );
    expect(
      (
        await handleRequest(
          new Request('https://telemetry.yomitomo.app/v1/heartbeat', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(heartbeat),
          }),
          {},
          requestOptions,
        )
      ).status,
    ).toBe(204);
  });

  it('does not acknowledge a failed analytics write', async () => {
    const writeDataPoint = vi.fn(() => {
      throw new Error('unavailable');
    });
    const response = await handleRequest(countsRequest('{"counts":{"feature_opened":1}}'), {
      TELEMETRY_ANALYTICS: { writeDataPoint },
    });

    expect(response.status).toBe(503);
    expect(writeDataPoint).toHaveBeenCalledOnce();
  });

  it('accepts the 2048 byte boundary and rejects a larger declared body', async () => {
    const body = '{"counts":{"feature_opened":1}}';
    const writeDataPoint = vi.fn();
    const accepted = await handleRequest(countsRequest(body.padEnd(2048)), {
      TELEMETRY_ANALYTICS: { writeDataPoint },
    });
    const rejected = await handleRequest(countsRequest(body, { 'content-length': '2049' }), {
      TELEMETRY_ANALYTICS: { writeDataPoint },
    });

    expect(accepted.status).toBe(204);
    expect(rejected.status).toBe(400);
    expect(writeDataPoint).toHaveBeenCalledOnce();
  });

  it.each([undefined, '1'])(
    'cancels an oversized stream with content-length %s',
    async (contentLength) => {
      const bytes = new TextEncoder().encode('{"counts":{"feature_opened":1}}'.padEnd(2049));
      const cancel = vi.fn();
      let offset = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.length) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + 1024));
          offset += 1024;
        },
        cancel,
      });
      const writeDataPoint = vi.fn();
      const response = await handleRequest(
        countsRequest(body, contentLength ? { 'content-length': contentLength } : {}),
        { TELEMETRY_ANALYTICS: { writeDataPoint } },
      );

      expect(response.status).toBe(400);
      expect(cancel).toHaveBeenCalledOnce();
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
