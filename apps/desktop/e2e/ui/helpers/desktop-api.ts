import type { YomitomoDesktopApi } from '../../../src/preload';

/**
 * The E2E suite drives the app through the same preload surface the renderer uses.
 * Deriving the type from production means an interface move fails the E2E typecheck
 * instead of breaking every scenario at runtime.
 */
export type DesktopApiForE2e = Pick<YomitomoDesktopApi, 'provider' | 'store'>;
