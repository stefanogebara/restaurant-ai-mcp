import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '../../contexts/SidebarContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'owner@test.com' }, role: 'owner' }),
}));
vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true, role: 'owner' }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
// DashboardLayout → useRestaurantCurrency → useRestaurantSettings fires an
// axios GET /restaurant-settings on mount; unmocked it leaks a jsdom XHR
// that fails the file with an unhandled rejection (UND_ERR_INVALID_ARG).
vi.mock('../../services/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { success: true, settings: {} } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put: vi.fn().mockResolvedValue({ data: { success: true } }),
    patch: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
  // Delegate to global fetch — the stub below provides the members payload.
  authFetch: vi.fn((...args: Parameters<typeof fetch>) => fetch(...args)),
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ success: true, members: [
    { id: '1', email: 'host@test.com', role: 'host', status: 'active' },
  ]}),
}));

import TeamPage from '../TeamPage';

function renderTeamPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <MemoryRouter><TeamPage /></MemoryRouter>
      </SidebarProvider>
    </QueryClientProvider>,
  );
}

describe('TeamPage', () => {
  it('renders team member', async () => {
    renderTeamPage();
    await waitFor(() => expect(screen.getByText('host@test.com')).toBeInTheDocument());
  });

  it('shows invite form for owner', async () => {
    renderTeamPage();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });
});
