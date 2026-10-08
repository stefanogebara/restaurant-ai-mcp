import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch }));

import CrmCustomerDrawer from '../CrmCustomerDrawer';

const customer = {
  customer_id: '+5511999990001',
  customer_phone: '+5511999990001',
  customer_name: 'Beatriz Costa',
  customer_email: 'beatriz@example.com',
  total_visits: 6,
  first_visit_date: '2026-01-05',
  last_visit_date: '2026-09-05',
  customer_tier: 'regular',
  lifetime_value: 840,
  avg_revenue_per_visit: 140,
  total_revenue: 840,
  churn_risk_score: 18,
  tags: ['terrace'],
  allergies: ['Nuts'],
  dietary_restrictions: [],
  seating_preferences: [],
  special_occasions: {},
};

function respondWithDetail(data: unknown) {
  authFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data }) });
}

describe('CrmCustomerDrawer customer detail contract', () => {
  beforeEach(() => authFetch.mockReset());

  it('renders the actual API envelope, including reservation and note rows', async () => {
    respondWithDetail({
      customer,
      reservations: [{ id: 'r1', date: '2026-09-05', time: '19:30', party_size: 2, status: 'completed' }],
      notes: [{ id: 'n1', content: 'Prefers the terrace', created_by: null, created_at: '2026-09-01T12:00:00Z' }],
    });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Beatriz Costa' })).toBeInTheDocument();
    expect(authFetch).toHaveBeenCalledWith(expect.stringContaining('action=detail'));
    expect(screen.getByText('Prefers the terrace')).toBeInTheDocument();
    expect(screen.getByText('2026-09-05')).toBeInTheDocument();
    expect(screen.getByText('19:30')).toBeInTheDocument();
    expect(screen.getByText('18%')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('distinguishes imported aggregate visits from absent visit details', async () => {
    respondWithDetail({ customer, reservations: [], notes: [] });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    expect(await screen.findByText('Visits are recorded, but visit details are not available.')).toBeInTheDocument();
    expect(screen.queryByText('No visits recorded')).not.toBeInTheDocument();
  });

  it('shows a valid zero revenue as zero rather than missing data', async () => {
    respondWithDetail({
      customer: { ...customer, avg_revenue_per_visit: 0, total_revenue: 0, churn_risk_score: 0 },
      reservations: [],
      notes: [],
    });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Beatriz Costa' })).toBeInTheDocument();
    expect(screen.getAllByText('$0')).toHaveLength(2);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText('--')).not.toBeInTheDocument();
  });

  it('shows a recoverable error for a malformed customer instead of an endless spinner', async () => {
    respondWithDetail({ customer: { customer_name: 'Beatriz Costa' }, reservations: [], notes: [] });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not load this customer profile.')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Beatriz Costa' })).not.toBeInTheDocument();
  });

  it('retries after a malformed response', async () => {
    authFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { customer: null, reservations: [], notes: [] } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { customer, reservations: [], notes: [] } }) });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('heading', { name: 'Beatriz Costa' })).toBeInTheDocument();
    expect(authFetch).toHaveBeenCalledTimes(2);
  });
});
