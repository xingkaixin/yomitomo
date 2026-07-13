import { request } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createArticleImportNetworkProxy,
  type ArticleImportNetworkProxy,
} from './article-import-network-proxy';

describe('article import network proxy', () => {
  let proxy: ArticleImportNetworkProxy | undefined;

  afterEach(async () => {
    await proxy?.close();
    proxy = undefined;
  });

  it('rejects HTTP requests to blocked targets', async () => {
    proxy = await createArticleImportNetworkProxy({});

    await expect(requestThroughProxy(proxy.url, 'http://127.0.0.1/private')).resolves.toBe(403);
  });

  it('rejects CONNECT tunnels to blocked targets', async () => {
    proxy = await createArticleImportNetworkProxy({});

    await expect(connectThroughProxy(proxy.url, '127.0.0.1:443')).resolves.toContain(
      '403 Forbidden',
    );
  });
});

function requestThroughProxy(proxyUrl: string, targetUrl: string) {
  const proxy = new URL(proxyUrl);
  return new Promise<number>((resolve, reject) => {
    const outgoing = request({
      host: proxy.hostname,
      method: 'GET',
      path: targetUrl,
      port: proxy.port,
    });
    outgoing.once('response', (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode || 0));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}

function connectThroughProxy(proxyUrl: string, authority: string) {
  const proxy = new URL(proxyUrl);
  return new Promise<string>((resolve, reject) => {
    const socket = connect(Number(proxy.port), proxy.hostname);
    let response = '';
    socket.setEncoding('utf8');
    socket.once('connect', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      response += chunk;
    });
    socket.once('end', () => resolve(response));
    socket.once('error', reject);
  });
}
