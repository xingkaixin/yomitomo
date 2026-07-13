import type { LookupAddress, LookupOptions } from 'node:dns';
import { lookup as lookupDns } from 'node:dns/promises';
import { BlockList, isIP, SocketAddress, type LookupFunction } from 'node:net';
import { Agent, type Dispatcher } from 'undici';

export const ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET = 'ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET';

export type ArticleImportNetworkPolicyOptions = {
  allowLocalNetworkArticleImport?: boolean;
};

export type ArticleImportNetworkTarget = {
  addresses: LookupAddress[];
};

const blockedIpv4Addresses = createBlockedIpv4Addresses();
const blockedIpv6Addresses = createBlockedIpv6Addresses();

export async function assertAllowedArticleImportUrl(
  url: string,
  options: ArticleImportNetworkPolicyOptions,
) {
  await resolveAllowedArticleImportTarget(url, options);
}

export async function fetchArticleImportUrl(
  input: string | URL,
  init: RequestInit,
  options: ArticleImportNetworkPolicyOptions,
) {
  const target = await resolveAllowedArticleImportTarget(input.toString(), options);
  if (options.allowLocalNetworkArticleImport) return globalThis.fetch(input, init);

  const dispatcher = new Agent({
    connect: {
      autoSelectFamily: true,
      lookup: createFixedArticleImportLookup(target.addresses),
    },
  });

  try {
    const response = await globalThis.fetch(input, {
      ...init,
      dispatcher,
    } as RequestInit & { dispatcher: Dispatcher });
    return responseWithDispatcherLifecycle(response, dispatcher);
  } catch (error) {
    await dispatcher.destroy();
    throw error;
  }
}

export async function resolveAllowedArticleImportTarget(
  url: string,
  options: ArticleImportNetworkPolicyOptions,
): Promise<ArticleImportNetworkTarget> {
  const parsed = parseArticleImportUrl(url);
  if (options.allowLocalNetworkArticleImport) return { addresses: [] };

  const hostname = normalizedHostname(parsed.hostname);
  if (!hostname || isLocalhostName(hostname)) {
    throw new Error(ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET);
  }

  const ipVersion = isIP(hostname);
  const addresses = ipVersion
    ? [{ address: canonicalIpAddress(hostname), family: ipVersion }]
    : await lookupDns(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isBlockedArticleImportAddress(address))
  ) {
    throw new Error(ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET);
  }

  return {
    addresses: addresses.map(({ address, family }) => ({
      address: canonicalIpAddress(address),
      family,
    })),
  };
}

export function createFixedArticleImportLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const matches = addressesMatchingFamily(addresses, options);
    if (!matches.length) {
      const error = new Error('ARTICLE_IMPORT_DNS_ADDRESS_UNAVAILABLE') as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '');
      return;
    }
    if (options.all) {
      callback(null, matches);
      return;
    }
    callback(null, matches[0].address, matches[0].family);
  };
}

export function isArticleImportRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

function parseArticleImportUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('ARTICLE_IMPORT_INVALID_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ARTICLE_IMPORT_UNSUPPORTED_PROTOCOL');
  }
  return parsed;
}

function normalizedHostname(hostname: string) {
  const unbracketed = hostname.replace(/^\[(.*)\]$/, '$1');
  return unbracketed.replace(/%.+$/, '').toLowerCase();
}

function canonicalIpAddress(address: string) {
  const normalized = normalizedHostname(address);
  const socketAddress = SocketAddress.parse(
    isIP(normalized) === 6 ? `[${normalized}]:0` : `${normalized}:0`,
  );
  return socketAddress?.address || normalized;
}

function isLocalhostName(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function isBlockedArticleImportAddress(address: string) {
  const normalized = canonicalIpAddress(address);
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mappedIpv4) return blockedIpv4Addresses.check(mappedIpv4, 'ipv4');
  if (isIP(normalized) === 4) return blockedIpv4Addresses.check(normalized, 'ipv4');
  if (isIP(normalized) === 6) return blockedIpv6Addresses.check(normalized, 'ipv6');
  return true;
}

function addressesMatchingFamily(addresses: LookupAddress[], options: LookupOptions) {
  const family = numericAddressFamily(options.family);
  return family ? addresses.filter((address) => address.family === family) : addresses;
}

function numericAddressFamily(family: LookupOptions['family']) {
  if (family === 4 || family === 'IPv4') return 4;
  if (family === 6 || family === 'IPv6') return 6;
  return 0;
}

function responseWithDispatcherLifecycle(response: Response, dispatcher: Agent) {
  if (!response.body) {
    void dispatcher.close();
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (!chunk.done) {
          controller.enqueue(chunk.value);
          return;
        }
        controller.close();
        await dispatcher.close();
      } catch (error) {
        controller.error(error);
        await dispatcher.destroy();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await dispatcher.destroy();
      }
    },
  });

  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function createBlockedIpv4Addresses() {
  const blockList = new BlockList();
  for (const [network, prefix] of [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ] as const) {
    blockList.addSubnet(network, prefix, 'ipv4');
  }
  return blockList;
}

function createBlockedIpv6Addresses() {
  const blockList = new BlockList();
  for (const [network, prefix] of [
    ['::', 128],
    ['::1', 128],
    ['64:ff9b::', 96],
    ['64:ff9b:1::', 48],
    ['100::', 64],
    ['2001::', 23],
    ['2001:db8::', 32],
    ['fc00::', 7],
    ['fe80::', 10],
    ['ff00::', 8],
  ] as const) {
    blockList.addSubnet(network, prefix, 'ipv6');
  }
  return blockList;
}
