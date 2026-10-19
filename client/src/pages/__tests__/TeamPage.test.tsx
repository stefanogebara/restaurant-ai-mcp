import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SidebarProvider } from '../../contexts/SidebarContext';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner-uid', email: 'owner@test.com' }, role: 'owner' }),
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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, members: [
      { id: '1', email: 'host@test.com', role: 'host', status: 'active' },
    ] }),
  });
});

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
    expect(screen.getByRole('textbox', { name: 'Email address' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Team role' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveClass('col-span-2');
  });

  it('explains manager access without falsely promising team management', async () => {
    renderTeamPage();
    await userEvent.click(screen.getByText('What can each role do?'));
    expect(screen.getByText(/Only the owner manages the team and billing/)).toBeInTheDocument();
  });

  it('shows a retryable loading error rather than an empty team', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    renderTeamPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('We could not load your team'));
    expect(screen.queryByText('No team members yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('does not say the invite was sent when email acceptance is unconfirmed', async () => {
    mockFetch.mockImplementation(async (_url: unknown, options?: RequestInit) => ({
      ok: true,
      json: async () => options?.method === 'POST'
        ? { success: true, email_accepted: false }
        : { success: true, members: [] },
    }));
    renderTeamPage();
    await userEvent.type(screen.getByRole('textbox', { name: 'Email address' }), 'host@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Invite' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('email acceptance was not confirmed'));
    expect(screen.queryByText(/Invitation sent to/)).not.toBeInTheDocument();
  });

  it('opens an accessible removal dialog and restores focus on Escape without deleting', async () => {
    renderTeamPage();
    await waitFor(() => expect(screen.getByText('host@test.com')).toBeInTheDocument());
    const removeButton = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(removeButton);
    expect(screen.getByRole('dialog', { name: 'Remove Team Member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(removeButton).toHaveFocus();
    expect(mockFetch).not.toHaveBeenCalledWith('/api/team-members', expect.objectContaining({ method: 'DELETE' }));
  });
});
