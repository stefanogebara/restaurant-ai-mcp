import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'owner@test.com' }, role: 'owner' }),
}));
vi.mock('../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true, role: 'owner' }),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ success: true, members: [
    { id: '1', email: 'host@test.com', role: 'host', status: 'active' },
  ]}),
}));

import TeamPage from '../TeamPage';

describe('TeamPage', () => {
  it('renders team member', async () => {
    render(<MemoryRouter><TeamPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('host@test.com')).toBeInTheDocument());
  });

  it('shows invite form for owner', async () => {
    render(<MemoryRouter><TeamPage /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
  });
});
