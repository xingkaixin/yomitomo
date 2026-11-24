import { lazy, Suspense, useRef } from 'react';
import { useIslandNotice } from './app-toast';

const LazyAppIsland = lazy(() =>
  import('./app-island').then((module) => ({ default: module.AppIsland })),
);

export function preloadAppIsland() {
  return import('./app-island');
}

export function AppIslandHost() {
  const notice = useIslandNotice();
  const mountedRef = useRef(false);
  if (notice) mountedRef.current = true;
  if (!mountedRef.current) return null;
  return (
    <Suspense fallback={null}>
      <LazyAppIsland />
    </Suspense>
  );
}
