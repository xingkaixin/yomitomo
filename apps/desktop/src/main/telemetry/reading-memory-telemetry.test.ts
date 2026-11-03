import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createReadingMemoryTelemetry } from './reading-memory-telemetry';

const endpoint = 'http://127.0.0.1/unused';

describe('reading memory telemetry', () => {
  it('sends a real local HTTP request containing only the aggregated closed counts', async () => {
    const requests: { path: string | undefined; body: unknown }[] = [];
    const server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      requests.push({ path: request.url, body: JSON.parse(body) });
      response.writeHead(204).end();
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected local HTTP address');
    const telemetry = createReadingMemoryTelemetry({
      fetch,
      isEnabled: () => true,
      endpoint: `http://127.0.0.1:${address.port}/v1/reading-memory-counts`,
      timeoutMs: 2_000,
    });
    try {
      telemetry.record('feature_opened');
      telemetry.record('query_completed');
      telemetry.record('query_completed');
      telemetry.record('review_need_evidence');
      telemetry.record('fallback_no_provider');
      await telemetry.flush();
      await telemetry.flush();
      expect(requests).toEqual([
        {
          path: '/v1/reading-memory-counts',
          body: {
            counts: {
              feature_opened: 1,
              query_completed: 2,
              review_need_evidence: 1,
              fallback_no_provider: 1,
            },
          },
        },
      ]);
    } finally {
      telemetry.dispose();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('clears disabled or unavailable settings without reviving old counts after re-enabling', async () => {
    let enabled = true;
    let unavailable = false;
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const telemetry = createReadingMemoryTelemetry({
      fetch: send,
      isEnabled: () => {
        if (unavailable) throw new Error('Database is being restored');
        return enabled;
      },
      endpoint,
      timeoutMs: 2_000,
    });
    telemetry.record('feature_opened');
    enabled = false;
    await telemetry.flush();
    telemetry.record('source_jump');
    enabled = true;
    await telemetry.flush();
    expect(send).not.toHaveBeenCalled();

    telemetry.record('feature_opened');
    unavailable = true;
    expect(() => telemetry.record('source_jump')).not.toThrow();
    unavailable = false;
    telemetry.record('query_completed');
    await telemetry.flush();
    expect(send).toHaveBeenCalledOnce();
    expect(sentPayload(send.mock.calls[0]?.[1])).toEqual({
      counts: { query_completed: 1 },
    });
    telemetry.dispose();
  });
});

function sentPayload(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON request body');
  return JSON.parse(init.body);
}
