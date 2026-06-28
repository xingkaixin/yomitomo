const WEREAD_LINK_TARGETS = new Set(['bestbookmark', 'reading']);

export function normalizeExternalUrlForOpen(value: string) {
  const url = new URL(value);
  if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  if (url.protocol !== 'weread:') {
    throw new Error('Only HTTP, HTTPS, and WeRead links are supported');
  }
  assertAllowedWeReadUrl(url);
  return url.toString();
}

function assertAllowedWeReadUrl(url: URL) {
  const target = url.host.toLowerCase();
  if (!WEREAD_LINK_TARGETS.has(target) || url.username || url.password || url.pathname !== '') {
    throw new Error('Unsupported WeRead link target');
  }
}
