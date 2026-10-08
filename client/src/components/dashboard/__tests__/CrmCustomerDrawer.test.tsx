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
    expect(screen.getByRole('button', { name: 'Delete note' })).not.toBeVisible();
    await userEvent.click(screen.getByLabelText('Note actions'));
    expect(screen.getByRole('button', { name: 'Delete note' })).toBeVisible();
    expect(screen.getByText('Sep 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('19:30')).toBeInTheDocument();
    expect(screen.getByLabelText('Risk of not returning: 18/100')).toBeInTheDocument();
    expect(screen.queryByText('18%')).not.toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('promotes a confirmed future reservation without counting it as a past visit', async () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    respondWithDetail({
      customer,
      reservations: [
        { id: 'next', date: future, time: '20:00', party_size: 3, status: 'confirmed' },
        { id: 'past', date: '2026-09-05', time: '19:30', party_size: 2, status: 'completed' },
      ],
      notes: [],
    });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    const next = await screen.findByRole('heading', { name: 'Next reservation' });
    expect(next.closest('section')).toHaveTextContent('20:00');
    expect(screen.getByText('A future reservation already exists.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other reservations' })).toBeInTheDocument();
    expect(screen.getByText('Sep 5, 2026')).toBeInTheDocument();
    expect(screen.getAllByText('20:00')).toHaveLength(1);
  });

  it('distinguishes imported aggregate visits from absent visit details', async () => {
    respondWithDetail({ customer, reservations: [], notes: [] });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    expect(await screen.findByText('Visits are recorded, but dated reservation details are not available.')).toBeInTheDocument();
    expect(screen.queryByText('No reservations recorded')).not.toBeInTheDocument();
  });

  it('shows a valid zero revenue as zero rather than missing data', async () => {
    respondWithDetail({
      customer: { ...customer, avg_revenue_per_visit: 0, total_revenue: 0, churn_risk_score: 0 },
      reservations: [],
      notes: [],
    });
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Beatriz Costa' })).toBeInTheDocument();
    expect(screen.getAllByText('$0')).toHaveLength(1);
    expect(screen.getByText('Estimated value')).toBeInTheDocument();
    expect(screen.getByText('$840')).toBeInTheDocument();
    expect(screen.getByLabelText('Risk of not returning: 0/100')).toBeInTheDocument();
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

  it('keeps editing controls collapsed, exposes note entry beside notes, and closes with Escape', async () => {
    respondWithDetail({ customer, reservations: [], notes: [] });
    const onClose = vi.fn();
    renderWithProviders(<CrmCustomerDrawer customerId={customer.customer_id} onClose={onClose} />);

    expect(await screen.findByRole('dialog', { name: 'Beatriz Costa' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add a note...')).not.toBeVisible();
    await userEvent.click(screen.getByText('Add note', { selector: 'summary' }));
    expect(screen.getByPlaceholderText('Add a note...')).toBeVisible();
    expect(screen.getByText('Edit profile')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
