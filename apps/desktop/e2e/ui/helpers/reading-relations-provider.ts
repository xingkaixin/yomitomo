import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

type ProviderRequestBody = {
  model: string;
  messages: { role: string; content: string }[];
};

export type ReadingRelationsProviderRequest = {
  body: ProviderRequestBody;
  canceled: boolean;
  respond: (explanation?: string) => void;
};

export type ReadingRelationsProvider = {
  baseUrl: string;
  requests: ReadingRelationsProviderRequest[];
};

export async function withReadingRelationsProvider<T>(
  run: (provider: ReadingRelationsProvider) => Promise<T>,
  options: { holdResponses?: boolean } = {},
): Promise<T> {
  const requests: ReadingRelationsProviderRequest[] = [];
  const server = createServer((request, response) => {
    void receiveRequest(request, response, requests, options.holdResponses ?? false).catch(() => {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Invalid E2E provider request' } }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    return await run({ baseUrl: `http://127.0.0.1:${address.port}/v1`, requests });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
}

async function receiveRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requests: ReadingRelationsProviderRequest[],
  holdResponses: boolean,
) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ProviderRequestBody;
  const pending: ReadingRelationsProviderRequest = {
    body,
    canceled: false,
    respond(explanation = 'Controlled reading relation.') {
      if (response.destroyed || response.writableEnded) return;
      const message = body.messages.find((item) => item.role === 'user');
      const input = JSON.parse(message?.content ?? '{}') as { evidence?: { id: string }[] };
      const evidenceId = input.evidence?.[0]?.id;
      const text = JSON.stringify({
        relations: evidenceId ? [{ evidenceId, relation: 'complementary', explanation }] : [],
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          choices: [
            { index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
    },
  };
  requests.push(pending);
  response.once('close', () => {
    pending.canceled = !response.writableEnded;
  });
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404);
    response.end();
    return;
  }
  if (!holdResponses) pending.respond();
}
