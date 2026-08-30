export function allowsFixtureHost(host: unknown): boolean {
  return host === undefined || host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

export function allowsFixtureUrl(value: string): boolean {
  const url = new URL(value);
  if (['file:', 'data:', 'blob:', 'devtools:', 'about:'].includes(url.protocol)) return true;
  return (
    ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
    allowsFixtureHost(url.hostname.replace(/^\[|\]$/g, ''))
  );
}

export function fixtureSocketHost(args: unknown[]): unknown {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first: unknown = normalized[0];
  if (typeof first === 'object' && first !== null && 'host' in first) return first.host;
  if (typeof first === 'number' && typeof normalized[1] === 'string') return normalized[1];
  return undefined;
}
