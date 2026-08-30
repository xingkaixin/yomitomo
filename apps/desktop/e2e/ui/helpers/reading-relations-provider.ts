import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

type ProviderRequestBody = {
  model: string;
  messages: { role: string; content: string }[];
};

type ReadingInput = {
  kind?: string;
  evidence?: { id: string; kind: string }[];
};

export const controlledLibraryClaims = {
  judgments: 'Saved reading judgments require reviewable source context.',
  supporting: 'The cited notes connect reading judgments with their original evidence.',
  opposingOrLimiting: 'Similarity alone does not establish agreement between judgments.',
  gaps: 'These excerpts do not establish outcomes beyond the cited reading situations.',
};

export type ReadingRelationsProviderRequest = {
  body: ProviderRequestBody;
  canceled: boolean;
  fail: () => void;
  respond: (explanation?: string) => void;
  respondWith: (output: unknown) => void;
};

export type ReadingRelationsProvider = {
  baseUrl: string;
  requests: ReadingRelationsProviderRequest[];
};

export async function withReadingRelationsProvider<T>(
  run: (provider: ReadingRelationsProvider) => Promise<T>,
  options: { holdResponses?: boolean; offline?: boolean } = {},
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
  if (options.offline) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  try {
    return await run({ baseUrl: `http://127.0.0.1:${address.port}/v1`, requests });
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
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
    fail() {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Controlled E2E provider failure' } }));
    },
    respond(explanation) {
      const message = body.messages.find((item) => item.role === 'user');
      const input = JSON.parse(message?.content ?? '{}') as ReadingInput;
      pending.respondWith(controlledReadingOutput(input, explanation));
    },
    respondWith(output) {
      if (response.destroyed || response.writableEnded) return;
      const text = JSON.stringify(output);
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

function controlledReadingOutput(input: ReadingInput, explanation?: string) {
  if (input.kind === 'library-answer') {
    const evidenceIds = input.evidence?.slice(0, 2).map((item) => item.id) ?? [];
    const userEvidence = input.evidence?.filter((item) => item.kind === 'user_judgment') ?? [];
    const userIds = [
      ...new Set([userEvidence[0], userEvidence.at(-1)].flatMap((item) => (item ? [item.id] : []))),
    ];
    return {
      judgments: userIds.length
        ? [{ text: explanation ?? controlledLibraryClaims.judgments, evidenceIds: userIds }]
        : [],
      supporting: evidenceIds.length
        ? [{ text: controlledLibraryClaims.supporting, evidenceIds }]
        : [],
      opposingOrLimiting: evidenceIds.length
        ? [{ text: controlledLibraryClaims.opposingOrLimiting, evidenceIds }]
        : [],
      gaps: evidenceIds.length ? [{ text: controlledLibraryClaims.gaps, evidenceIds }] : [],
    };
  }
  const evidenceId = input.evidence?.[0]?.id;
  return {
    relations: evidenceId
      ? [
          {
            evidenceId,
            relation: 'complementary',
            explanation: explanation ?? 'Controlled reading relation.',
          },
        ]
      : [],
  };
}
