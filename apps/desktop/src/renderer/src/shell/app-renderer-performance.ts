import { getOptionalDesktopApi } from './app-desktop-api';

export function rendererPerformanceElapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

export function recordRendererPerformanceTiming(event: string, data: Record<string, unknown>) {
  void getOptionalDesktopApi()?.diagnostics?.recordPerformanceTiming?.({ event, data });
}
