import { QueryClient } from '@tanstack/react-query';

// IPC does not depend on navigator.onLine, window focus must not repeat IPC reads, and most
// IPC failures are not transient.
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { networkMode: 'always' },
      queries: { networkMode: 'always', refetchOnWindowFocus: false, retry: false },
    },
  });
}
