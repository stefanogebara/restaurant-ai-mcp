import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import CrmCustomerDrawer from '../CrmCustomerDrawer';

vi.mock('../../../hooks/useCustomers', () => ({
  useCustomerDetail: () => ({
    data: {
      customer_id: 'crm-uuid',
      customer_name: 'Beatriz Costa',
      customer_phone: '+5511999888777',
      customer_email: null,
      customer_tier: 'regular',
      total_visits: 3,
      avg_revenue_per_visit: 80,
      total_revenue: 240,
      churn_risk_score: 52,
      tags: [],
      allergies: [],
      dietary_restrictions: [],
      seating_preferences: [],
      special_occasions: {},
      recent_reservations: [{ id: 'reservation-1', date: '2026-10-11', time: '19:00:00', party_size: 2, status: 'completed' }],
      notes: [{ id: 'note-1', content: 'Window table', created_by: null, created_at: '2026-10-11' }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateTags: () => ({ mutate: vi.fn() }),
  useAddNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useUpdateProfile: () => ({ mutate: vi.fn() }),
}));

describe('CrmCustomerDrawer', () => {
  it('shows the actual customer, visit history and estimated metrics without undefined fields', () => {
    renderWithProviders(<CrmCustomerDrawer customerId="crm-uuid" onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Beatriz Costa' })).toBeInTheDocument();
    expect(screen.getByText('+5511999888777')).toBeInTheDocument();
    expect(screen.getByText('Window table')).toBeInTheDocument();
    expect(screen.getByText('52/100')).toBeInTheDocument();
    expect(screen.getByText('Estimated total spend')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Oct 11, 2026')).toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
    expect(screen.queryByText('2026-10-11')).not.toBeInTheDocument();
    expect(screen.queryByText('19:00:00')).not.toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });
});
