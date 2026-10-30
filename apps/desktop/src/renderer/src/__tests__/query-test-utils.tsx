import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { createAppQueryClient } from '../shell/app-query-client';

export function renderWithQueryClient(ui: ReactElement, options?: RenderOptions) {
  const queryClient = createAppQueryClient();
  const view = render(ui, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}
