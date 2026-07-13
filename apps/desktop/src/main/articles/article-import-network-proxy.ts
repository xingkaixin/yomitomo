import { createServer, request as requestHttp, type IncomingMessage } from 'node:http';
import { request as requestHttps } from 'node:https';
import { connect } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  createFixedArticleImportLookup,
  resolveAllowedArticleImportTarget,
  type ArticleImportNetworkPolicyOptions,
} from './article-import-network-policy';

export type ArticleImportNetworkProxy = {
  close: () => Promise<void>;
  url: string;
};

export async function createArticleImportNetworkProxy(
  options: ArticleImportNetworkPolicyOptions,
): Promise<ArticleImportNetworkProxy> {
  const sockets = new Set<Duplex>();
  const server = createServer((request, response) => {
    void forwardHttpRequest(request, response, options);
  });
  server.on('connect', (request, clientSocket, head) => {
    void forwardTunnel(request, clientSocket, head, options, sockets);
  });
  server.on('connection', (socket) => trackSocket(sockets, socket));
  server.on('clientError', (_error, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('ARTICLE_IMPORT_PROXY_START_FAILED');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function forwardHttpRequest(
  request: IncomingMessage,
  response: import('node:http').ServerResponse,
  options: ArticleImportNetworkPolicyOptions,
) {
  try {
    const url = proxyRequestUrl(request);
    const target = await resolveAllowedArticleImportTarget(url.href, options);
    const send = url.protocol === 'https:' ? requestHttps : requestHttp;
    const headers = { ...request.headers };
    delete headers['proxy-connection'];

    const upstream = send(url, {
      headers,
      lookup: createFixedArticleImportLookup(target.addresses),
      method: request.method,
    });
    upstream.once('error', () => sendProxyError(response, 502));
    upstream.once('response', (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    request.once('aborted', () => upstream.destroy());
    request.pipe(upstream);
  } catch {
    sendProxyError(response, 403);
  }
}

async function forwardTunnel(
  request: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  options: ArticleImportNetworkPolicyOptions,
  sockets: Set<Duplex>,
) {
  try {
    const url = new URL(`https://${request.url || ''}`);
    const target = await resolveAllowedArticleImportTarget(url.href, options);
    const upstream = connect({
      autoSelectFamily: true,
      host: url.hostname.replace(/^\[(.*)\]$/, '$1'),
      lookup: createFixedArticleImportLookup(target.addresses),
      port: Number(url.port) || 443,
    });
    trackSocket(sockets, upstream);
    upstream.once('connect', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.once('error', () => rejectTunnel(clientSocket, 502));
  } catch {
    rejectTunnel(clientSocket, 403);
  }
}

function proxyRequestUrl(request: IncomingMessage) {
  if (/^https?:\/\//i.test(request.url || '')) return new URL(request.url || '');
  const host = request.headers.host;
  if (!host) throw new Error('ARTICLE_IMPORT_PROXY_INVALID_REQUEST');
  return new URL(request.url || '/', `http://${host}`);
}

function sendProxyError(response: import('node:http').ServerResponse, status: number) {
  if (response.headersSent || response.destroyed) {
    response.destroy();
    return;
  }
  response.writeHead(status).end();
}

function rejectTunnel(socket: Duplex, status: number) {
  if (socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Bad Gateway'}\r\n\r\n`);
}

function trackSocket(sockets: Set<Duplex>, socket: Duplex) {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
}
