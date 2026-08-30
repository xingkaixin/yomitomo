import {
  maxReadingMemoryUsageCount,
  type ReadingMemoryUsageKey,
  type ReadingMemoryUsagePayload,
} from '@yomitomo/shared';

type ReadingMemoryTelemetryDependencies = {
  fetch: typeof fetch;
  isEnabled: () => boolean;
  endpoint: string;
  timeoutMs: number;
};

export function createReadingMemoryTelemetry(dependencies: ReadingMemoryTelemetryDependencies) {
  let counts: ReadingMemoryUsagePayload['counts'] = {};
  let inFlight: AbortController | null = null;
  let disposed = false;

  const clear = () => {
    counts = {};
    inFlight?.abort();
  };
  const canCollect = () => {
    if (!disposed) {
      try {
        if (dependencies.isEnabled()) return true;
      } catch {
        // Telemetry must not interrupt an action while the database is unavailable.
      }
    }
    clear();
    return false;
  };

  return {
    record: (key: ReadingMemoryUsageKey) => {
      if (!canCollect()) return;
      counts[key] = Math.min((counts[key] ?? 0) + 1, maxReadingMemoryUsageCount);
    },
    async flush() {
      if (!canCollect() || inFlight || Object.keys(counts).length === 0) return;
      const payload: ReadingMemoryUsagePayload = { counts };
      counts = {};
      const controller = new AbortController();
      inFlight = controller;
      const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);
      timeout.unref?.();
      try {
        const response = await dependencies.fetch(dependencies.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        await response.body?.cancel();
      } catch {
        // No retry: an interrupted request may already have been counted without an ID.
      } finally {
        clearTimeout(timeout);
        if (inFlight === controller) inFlight = null;
      }
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
