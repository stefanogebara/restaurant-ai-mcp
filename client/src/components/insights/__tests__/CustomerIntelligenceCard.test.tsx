import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomerIntelligenceCard from '../CustomerIntelligenceCard';
import { useLTVAtRisk, useLTVTopVIPs, useSendCampaign } from '../../../hooks/useLTVData';
import { usePlanFeature } from '../../../hooks/usePlanFeature';

const sendCampaign = vi.fn();

vi.mock('../../../hooks/useLTVData', () => ({
  useLTVAtRisk: vi.fn(),
  useLTVTopVIPs: vi.fn(),
  useSendCampaign: vi.fn(),
}));
vi.mock('../../../hooks/usePlanFeature', () => ({ usePlanFeature: vi.fn() }));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'pt-BR' },
    t: (key: string, values?: { name?: string; score?: number; count?: number }) => {
      if (key === 'insights.reEngagementDraft') return 'Olá! Faz tempo que não vemos você por aqui.';
      if (key === 'insights.reviewEmailFor') return `Revisar e-mail para ${values?.name}`;
      if (key === 'insights.estimatedChurnRisk') return `Pontuação de risco de perda: ${values?.score}/100`;
      if (key === 'insights.visits') return `${values?.count} visitas`;
      return key;
    },
  }),
}));

vi.mock('../../common/ThiingsIcon', () => ({
  default: () => <span aria-hidden="true" />,
}));

describe('CustomerIntelligenceCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(usePlanFeature).mockReturnValue({ hasAccess: true, isLoading: false, plan: 'growth' } as ReturnType<typeof usePlanFeature>);
    vi.mocked(useLTVAtRisk).mockReturnValue({
      data: [{
        customer_id: 'guest-1',
        customer_name: 'Ana Costa',
        total_visits: 3,
        total_revenue: 300,
        avg_revenue_per_visit: 100,
        customer_tier: 'at_risk',
        lifetime_value: 300,
        churn_risk_score: 82,
        last_visit_date: '2026-08-10',
        predicted_next_visit_date: null,
        favorite_time_slot: null,
        favorite_day: null,
      }],
      isLoading: false,
    } as unknown as ReturnType<typeof useLTVAtRisk>);
    vi.mocked(useLTVTopVIPs).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useLTVTopVIPs>);
    vi.mocked(useSendCampaign).mockReturnValue({ mutate: sendCampaign, isPending: false } as unknown as ReturnType<typeof useSendCampaign>);
  });

  it('opens a localized draft for review and sends only after explicit confirmation', () => {
    render(<MemoryRouter><CustomerIntelligenceCard appearance="hero" /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /Revisar e-mail para Ana Costa/ })).toHaveTextContent('82/100');

    fireEvent.click(screen.getByRole('button', { name: /Revisar e-mail para Ana Costa · Pontuação de risco de perda: 82\/100/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'insights.message' })).toHaveValue('Olá! Faz tempo que não vemos você por aqui.');
    expect(sendCampaign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'insights.sendEmail' }));
    expect(sendCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'guest-1', campaignType: 'win_back', message: 'Olá! Faz tempo que não vemos você por aqui.' }),
      expect.any(Object),
    );
    expect(screen.getByRole('dialog')).toHaveClass('bg-brand-paper');
  });

  it('does not describe a locked customer feed as having no priority guests', () => {
    vi.mocked(usePlanFeature).mockReturnValue({ hasAccess: false, isLoading: false, plan: 'free' } as ReturnType<typeof usePlanFeature>);
    vi.mocked(useLTVAtRisk).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useLTVAtRisk>);
    vi.mocked(useLTVTopVIPs).mockReturnValue({ data: undefined, isLoading: false } as ReturnType<typeof useLTVTopVIPs>);

    render(<MemoryRouter><CustomerIntelligenceCard appearance="hero" /></MemoryRouter>);

    expect(screen.getByText('insights.customerPlanUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('insights.noHighRiskCustomers')).not.toBeInTheDocument();
  });

  it('keeps failed customer queries distinct from an empty guest list', () => {
    vi.mocked(useLTVAtRisk).mockReturnValue({ data: undefined, isLoading: false, isError: true } as ReturnType<typeof useLTVAtRisk>);

    render(<CustomerIntelligenceCard />);

    expect(screen.getByText('insights.customerDataUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('insights.noHighRiskCustomers')).not.toBeInTheDocument();
  });
});
