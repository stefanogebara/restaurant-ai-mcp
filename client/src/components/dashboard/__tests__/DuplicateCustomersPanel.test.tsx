import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';

const { authFetch } = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock('../../../services/api', () => ({ authFetch }));

import DuplicateCustomersPanel from '../DuplicateCustomersPanel';

const customers = [
  { customer_id: 'c1', customer_name: 'Alice', customer_phone: '+5511999', customer_email: null, total_visits: 5, total_revenue: 500, last_visit_date: '2026-03-01', customer_tier: 'vip' },
  { customer_id: 'c2', customer_name: 'Alice B', customer_phone: '+5511999', customer_email: null, total_visits: 2, total_revenue: 200, last_visit_date: '2026-02-15', customer_tier: 'regular' },
  { customer_id: 'c3', customer_name: 'Alice C', customer_phone: '+5511999', customer_email: null, total_visits: 1, total_revenue: 100, last_visit_date: '2026-01-01', customer_tier: 'new' },
];

describe('DuplicateCustomersPanel API contract', () => {
  beforeEach(() => {
    authFetch.mockReset();
    authFetch.mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === 'POST'
        ? { success: true, data: {} }
        : { success: true, data: { duplicates: [{ match_field: 'phone', match_value: '+5511999', customers }], total_groups: 1 } },
    }));
  });

  it('renders the backend match field and distinct customer records', async () => {
    renderWithProviders(<DuplicateCustomersPanel onClose={vi.fn()} />);

    expect(await screen.findByText('Matched by phone')).toBeInTheDocument();
    expect(screen.getByText('1 group found')).toBeInTheDocument();
    expect(screen.getByText('+5511999')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Alice B')).toBeInTheDocument();
    expect(screen.getByText('1 visit')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('requires an explicit absorbed record for a group larger than two', async () => {
    renderWithProviders(<DuplicateCustomersPanel onClose={vi.fn()} />);
    await screen.findByText('Matched by phone');
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));

    const confirm = screen.getByRole('button', { name: 'Merge Customers' });
    expect(confirm).toBeDisabled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Record to merge into the one kept' }), 'c3');
    expect(screen.getByText('Alice C → Alice')).toBeInTheDocument();
    expect(screen.getByText('After merging: 6 visits')).toBeInTheDocument();
    await userEvent.click(confirm);

    await waitFor(() => expect(authFetch).toHaveBeenCalledWith(
      '/api/customers?action=merge',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ keep_id: 'c1', merge_id: 'c3' }) }),
    ));
  });

  it('returns focus to the group action after Escape cancels confirmation', async () => {
    renderWithProviders(<DuplicateCustomersPanel onClose={vi.fn()} />);
    const merge = await screen.findByRole('button', { name: 'Merge' });
    await userEvent.click(merge);
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Find duplicates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Merge' })).toHaveFocus();
  });

  it('shows a retryable inline error when the merge request fails', async () => {
    authFetch.mockImplementation(async (_url: string, init?: RequestInit) => ({
      ok: init?.method !== 'POST',
      json: async () => init?.method === 'POST'
        ? { success: false, error: 'Simulated failure' }
        : { success: true, data: { duplicates: [{ match_field: 'phone', match_value: '+5511999', customers }], total_groups: 1 } },
    }));
    renderWithProviders(<DuplicateCustomersPanel onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Merge' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Record to merge into the one kept' }), 'c3');
    await userEvent.click(screen.getByRole('button', { name: 'Merge Customers' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not merge these records. Try again.');
    expect(screen.getByRole('button', { name: 'Merge Customers' })).toBeEnabled();
  });
});
