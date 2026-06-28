import { performance } from 'node:perf_hooks';
import type { StoreReadProfileEntry } from './store-db';

export function measureStoreRead<T>(
  profile: StoreReadProfileEntry[] | undefined,
  name: string,
  read: () => T,
  data?: Record<string, number>,
): T {
  const startedAt = performance.now();
  try {
    return read();
  } finally {
    profile?.push({ name, durationMs: elapsedMs(startedAt), data });
  }
}

export async function measureStoreReadAsync<T>(
  profile: StoreReadProfileEntry[] | undefined,
  name: string,
  read: () => Promise<T>,
  data?: Record<string, number>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await read();
  } finally {
    profile?.push({ name, durationMs: elapsedMs(startedAt), data });
  }
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
