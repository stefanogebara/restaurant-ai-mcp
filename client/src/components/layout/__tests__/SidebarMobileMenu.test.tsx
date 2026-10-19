import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SidebarProvider } from '../../../contexts/SidebarContext';
import Sidebar from '../Sidebar';

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'owner@example.com' }, signOut: vi.fn() }),
}));
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true }),
}));
vi.mock('../../../hooks/useSubscription', () => ({
  useSubscription: () => ({ isLoading: false, data: { subscription: { plan: 'Growth' } } }),
}));
vi.mock('../../../hooks/useRestaurantSettings', () => ({
  useRestaurantSettings: () => ({ data: { restaurant_name: 'Cantina Bella Vista' } }),
}));

describe('mobile sidebar navigation', () => {
  it('opens only from the bottom bar and closes inside the drawer', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SidebarProvider>
        <MemoryRouter><Sidebar /></MemoryRouter>
      </SidebarProvider>,
    );
    const drawer = container.querySelector('aside');
    expect(drawer).toHaveClass('-translate-x-full');
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-missing-icon]')).not.toBeInTheDocument();

    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-controls', 'dashboard-sidebar');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(drawer).toHaveClass('translate-x-0');
    expect(more).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(drawer).toHaveClass('-translate-x-full');
    expect(more).toHaveAttribute('aria-expanded', 'false');
  });
});
