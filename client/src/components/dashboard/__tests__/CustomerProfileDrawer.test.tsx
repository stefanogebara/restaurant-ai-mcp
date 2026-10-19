import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import i18n from 'i18next';
import { QueryClient } from '@tanstack/react-query';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { UpcomingReservation } from '../../../types/host.types';
import CustomerProfileDrawer from '../CustomerProfileDrawer';

const mocks = vi.hoisted(() => ({
  ltv: null as Record<string, unknown> | null,
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-owner' } }),
}));

vi.mock('../../../services/api', () => ({
  authFetch: async (url: string) => url.startsWith('/api/ltv')
    ? { ok: !!mocks.ltv, json: async () => ({ customer: mocks.ltv }) }
    : { ok: true, json: async () => ({ memories: [] }) },
}));

const reservation: UpcomingReservation = {
  reservation_id: 'r-1',
  customer_name: 'Beatriz Costa',
  customer_phone: '+5511999888777',
  party_size: 2,
  date: '2026-10-11',
  time: '19:00',
  reservation_time: '19:00',
  checked_in: false,
  customer_tier: 'vip',
  visit_count: 3,
};

function renderDrawer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['customer-ltv', reservation.customer_phone], mocks.ltv);
  queryClient.setQueryData(['guest-context', reservation.customer_phone], { memories: [] });
  return renderWithProviders(<CustomerProfileDrawer reservation={reservation} onClose={vi.fn()} />, { queryClient });
}

describe('CustomerProfileDrawer', () => {
  beforeEach(async () => {
    mocks.ltv = null;
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  afterEach(async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('never invents spend or churn probability from the customer tier', async () => {
    renderDrawer();

    expect(await screen.findByRole('dialog', { name: 'Guest profile' })).toBeInTheDocument();
    expect(screen.getByText('Risk score')).toBeInTheDocument();
    expect(screen.queryByText('5%')).not.toBeInTheDocument();
    expect(screen.queryByText('5/100')).not.toBeInTheDocument();
    expect(screen.queryByText('Usual time')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('Oct 11, 2026')).toBeInTheDocument();
  });

  it('shows the stored heuristic as a score and the stored estimated spend', async () => {
    mocks.ltv = {
      churn_risk_score: 42,
      total_revenue: 240,
      avg_revenue_per_visit: 80,
      first_visit_date: '2026-05-10',
    };
    renderDrawer();

    expect(await screen.findByText('42/100')).toBeInTheDocument();
    expect(screen.getByText('Estimated total spend')).toBeInTheDocument();
    expect(screen.getByText('Guest since May 2026')).toBeInTheDocument();
    expect(screen.queryByText('42%')).not.toBeInTheDocument();
  });

  it('localizes the reservation date and labels in Portuguese', async () => {
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    renderDrawer();

    expect(await screen.findByRole('dialog', { name: 'Perfil do convidado' })).toBeInTheDocument();
    expect(screen.getByText('Pontuação de risco')).toBeInTheDocument();
    expect(screen.getByText(/11 de out.*2026/)).toBeInTheDocument();
  });
});
