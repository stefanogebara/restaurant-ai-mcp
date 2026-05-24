import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { ToastProvider } from '../contexts/ToastContext';

/**
 * Test render helper that wraps the component in the minimum providers most
 * components in this codebase expect to find at runtime: ToastProvider (for
 * useToast) and a fresh QueryClientProvider per render (so each test starts
 * with an empty cache and no retries).
 *
 * Use this instead of `render(...)` directly whenever the rendered tree
 * touches `useToast`, `useQuery`, `useMutation`, or any hook that depends on
 * them.
 */
function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface ProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

function AllProviders({ children, queryClient }: ProvidersProps) {
  const client = queryClient ?? makeTestQueryClient();
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient, ...options }: RenderWithProvidersOptions = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => <AllProviders queryClient={queryClient}>{children}</AllProviders>,
    ...options,
  });
}
