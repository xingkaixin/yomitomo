import { lookup as lookupDns } from 'node:dns/promises';
import { isIP } from 'node:net';

export const ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET = 'ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET';

export type ArticleImportNetworkPolicyOptions = {
  allowLocalNetworkArticleImport?: boolean;
};

export async function assertAllowedArticleImportUrl(
  url: string,
  options: ArticleImportNetworkPolicyOptions,
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('ARTICLE_IMPORT_INVALID_URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ARTICLE_IMPORT_UNSUPPORTED_PROTOCOL');
  }
  if (options.allowLocalNetworkArticleImport) return;

  const hostname = normalizedHostname(parsed.hostname);
  if (!hostname || isLocalhostName(hostname)) {
    throw new Error(ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET);
  }
  if (isIP(hostname)) {
    if (isBlockedArticleImportAddress(hostname)) {
      throw new Error(ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET);
    }
    return;
  }

  const addresses = await lookupDns(hostname, { all: true, verbatim: true });
  if (addresses.some((entry) => isBlockedArticleImportAddress(entry.address))) {
    throw new Error(ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET);
  }
}

export function isArticleImportRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

function normalizedHostname(hostname: string) {
  const unbracketed = hostname.replace(/^\[(.*)\]$/, '$1');
  return unbracketed.replace(/%.+$/, '').toLowerCase();
}

function isLocalhostName(hostname: string) {
  return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function isBlockedArticleImportAddress(address: string) {
  const normalized = normalizedHostname(address);
  const mappedIpv4 = ipv4MappedAddress(normalized);
  if (mappedIpv4) return isBlockedArticleImportIpv4(mappedIpv4);
  if (isIP(normalized) === 4) return isBlockedArticleImportIpv4(normalized);
  if (isIP(normalized) === 6) return isBlockedArticleImportIpv6(normalized);
  return false;
}

function ipv4MappedAddress(address: string) {
  return address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
}

function isBlockedArticleImportIpv4(address: string) {
  const octets = address.split('.').map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isBlockedArticleImportIpv6(address: string) {
  if (address === '::' || address === '::1') return true;
  const firstHextet = Number.parseInt(address.split(':')[0] || '0', 16);
  return (
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xff00) === 0xff00
  );
}
