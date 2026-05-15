export type PerformanceTimingLogger = (event: string, data?: Record<string, unknown>) => void;

export function performanceStart() {
  return performance.now();
}

export function performanceElapsedMs(start: number) {
  return Number((performance.now() - start).toFixed(2));
}
