import { getOptionalDesktopApi } from './app-desktop-api';

export function rendererPerformanceElapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

export function recordRendererPerformanceTiming(event: string, data: Record<string, unknown>) {
  void getOptionalDesktopApi()?.diagnostics?.recordPerformanceTiming?.({ event, data });
}

export function recordStartupTiming(event: string, data: Record<string, unknown> = {}) {
  void getOptionalDesktopApi()
    ?.diagnostics?.recordPerformanceTiming?.({
      event: `startup.${event}`,
      data: {
        rendererElapsedMs: rendererPerformanceElapsedMs(0),
        ...data,
      },
    })
    .catch(() => undefined);
}

export function recordStatsTiming(event: string, data: Record<string, unknown>) {
  void getOptionalDesktopApi()
    ?.diagnostics?.recordPerformanceTiming?.({ event: `stats.${event}`, data })
    .catch(() => undefined);
}
