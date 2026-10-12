import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import i18n from '../../../i18n/config';
import { setActiveRestaurantCountry } from '../../../utils/currency';
import { renderWithProviders } from '../../../test/renderWithProviders';
import type { Customer } from '../ltvDashboard.types';
import LTVKeyMetrics from '../LTVKeyMetrics';
import LTVTierBreakdown from '../LTVTierBreakdown';
import LTVTopVIPs from '../LTVTopVIPs';
import LTVAtRiskCustomers from '../LTVAtRiskCustomers';

const customer: Customer = {
  customer_id: '+5511999000000',
  customer_name: 'Beatriz Costa',
  total_visits: 9,
  total_revenue: 1620,
  avg_revenue_per_visit: 180,
  customer_tier: 'vip',
  lifetime_value: 18720,
  churn_risk_score: 80,
  last_visit_date: '2026-05-06',
  predicted_next_visit_date: null,
  favorite_time_slot: null,
  favorite_day: null,
};

afterEach(async () => {
  setActiveRestaurantCountry(null);
  await act(async () => { await i18n.changeLanguage('en'); });
});

describe('customer value presentation', () => {
  it('uses the restaurant currency and Portuguese labels, not the browser language or dollars', async () => {
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    setActiveRestaurantCountry('Brazil');
    renderWithProviders(<LTVKeyMetrics currency="BRL" stats={{
      total_customers: 18,
      avg_ltv: 14785,
      total_ltv: 266137,
      tiers: { vip: 1, regular: 1, occasional: 2, new: 0, at_risk: 14 },
      high_risk_customers: 14,
    }} />);

    expect(screen.getByText('Clientes com histórico')).toBeInTheDocument();
    expect(screen.getByText('Valor médio estimado')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$/).length).toBe(2);
    expect(screen.queryByText(/\$14,785/)).not.toBeInTheDocument();
  });

  it('keeps BRL for a Brazilian restaurant even when the interface is Spanish', async () => {
    await act(async () => { await i18n.changeLanguage('es'); });
    setActiveRestaurantCountry('Brazil');
    renderWithProviders(<LTVTopVIPs topVIPs={[customer]} currency="BRL" />);

    expect(screen.getByText('Beatriz Costa')).toBeInTheDocument();
    expect(screen.getByText('Clientes frecuentes con alto valor estimado')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$/).length).toBe(2);
    expect(screen.queryByText(customer.customer_id)).not.toBeInTheDocument();
  });

  it('shows localized segment names and opens only the selected guest message', async () => {
    await act(async () => { await i18n.changeLanguage('pt-BR'); });
    setActiveRestaurantCountry('Brazil');
    const onOpenCampaignModal = vi.fn();
    renderWithProviders(<>
      <LTVTierBreakdown tiers={{ vip: 1, regular: 1, occasional: 2, new: 0, at_risk: 14 }} />
      <LTVAtRiskCustomers atRiskCustomers={[customer]} highRiskCount={14} currency="BRL" onOpenCampaignModal={onOpenCampaignModal} />
    </>);

    expect(screen.getByText('Precisa de atenção')).toBeInTheDocument();
    expect(screen.getByText('Escolha um cliente para revisar a mensagem antes de enviar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar mensagem para todos' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preparar mensagem' }));
    expect(onOpenCampaignModal).toHaveBeenCalledOnce();
    expect(onOpenCampaignModal).toHaveBeenCalledWith(customer);
  });
});
