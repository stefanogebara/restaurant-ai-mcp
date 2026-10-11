import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OverviewTab from '../OverviewTab';
import { useHostDashboard } from '../../../hooks/useHostDashboard';
import { useCustomerList } from '../../../hooks/useCustomers';
import { useLTVStats } from '../../../hooks/useLTVData';
import { usePlanFeature } from '../../../hooks/usePlanFeature';

vi.mock('../../../hooks/useHostDashboard', () => ({ useHostDashboard: vi.fn() }));
vi.mock('../../../hooks/useCustomers', () => ({ useCustomerList: vi.fn() }));
vi.mock('../../../hooks/useLTVData', () => ({ useLTVStats: vi.fn() }));
vi.mock('../../../hooks/usePlanFeature', () => ({ usePlanFeature: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../components/common/ThiingsIcon', () => ({ default: () => null }));
vi.mock('../../../components/insights/TonightBriefingCard', () => ({ default: () => <div>briefing</div> }));
vi.mock('../../../components/insights/CustomerIntelligenceCard', () => ({ default: () => <div>customers</div> }));
vi.mock('../../../components/insights/WeeklyForecastCard', () => ({ default: () => <div>forecast</div> }));
vi.mock('../../../components/dashboard/StrategyMetricsWidget', () => ({ default: () => <div>strategy</div> }));
vi.mock('../../../components/dashboard/CampaignManager', () => ({ default: () => <div>campaigns</div> }));

const dashboard = {
  summary: { upcoming_reservations: 0 },
  upcoming_reservations: [],
  active_parties: [],
};

function showData(customerTotal: number) {
  vi.mocked(useHostDashboard).mockReturnValue({ data: dashboard, isLoading: false, isError: false } as unknown as ReturnType<typeof useHostDashboard>);
  vi.mocked(useCustomerList).mockReturnValue({ data: { total: customerTotal, customers: [] }, isLoading: false, isError: false } as unknown as ReturnType<typeof useCustomerList>);
}

function renderOverview() {
  return render(<MemoryRouter><OverviewTab /></MemoryRouter>);
}

describe('OverviewTab data states', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(useLTVStats).mockReturnValue({ data: null } as ReturnType<typeof useLTVStats>);
    vi.mocked(usePlanFeature).mockReturnValue({ hasAccess: true, isLoading: false, plan: 'growth' });
  });

  it('shows one page-level explanation only for a genuinely new restaurant', () => {
    showData(0);
    renderOverview();
    expect(screen.getByRole('heading', { name: 'insights.emptyTitle' })).toBeInTheDocument();
    expect(screen.queryByText('briefing')).not.toBeInTheDocument();
  });

  it('does not call an established restaurant new on a quiet day', () => {
    showData(18);
    renderOverview();
    expect(screen.queryByRole('heading', { name: 'insights.emptyTitle' })).not.toBeInTheDocument();
    expect(screen.getByText('briefing')).toBeInTheDocument();
  });

  it('surfaces the customer risk signal in the section heading when known', () => {
    showData(96);
    vi.mocked(useLTVStats).mockReturnValue({ data: { high_risk_customers: 10 } } as ReturnType<typeof useLTVStats>);
    renderOverview();
    expect(screen.getByRole('heading', { name: 'insights.customerAttentionTitle' })).toBeInTheDocument();
    expect(screen.getByText('insights.customerAttentionSignal')).toBeInTheDocument();
  });

  it('does not reveal cached customer counts or repeat the plan message when access is blocked', () => {
    showData(96);
    vi.mocked(useLTVStats).mockReturnValue({ data: { high_risk_customers: 10 } } as ReturnType<typeof useLTVStats>);
    vi.mocked(usePlanFeature).mockReturnValue({ hasAccess: false, isLoading: false, plan: 'free' });
    renderOverview();
    expect(screen.getByRole('heading', { name: 'insights.customerSection' })).toBeInTheDocument();
    expect(screen.queryByText('insights.customerAttentionSignal')).not.toBeInTheDocument();
    expect(screen.getAllByText('insights.customerPlanUnavailable')).toHaveLength(1);
    expect(screen.queryByText('customers')).not.toBeInTheDocument();
    expect(screen.queryByText('forecast')).not.toBeInTheDocument();
    expect(screen.getAllByText('insights.locked_advancedAnalytics')).toHaveLength(1);
    expect(screen.queryByText('strategy')).not.toBeInTheDocument();
    expect(screen.queryByText('campaigns')).not.toBeInTheDocument();
  });

  it('shows an error instead of a false new-restaurant claim when CRM fails', () => {
    showData(0);
    vi.mocked(useCustomerList).mockReturnValue({ isLoading: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof useCustomerList>);
    renderOverview();
    expect(screen.getByRole('alert')).toHaveTextContent('insights.overviewErrorTitle');
    expect(screen.queryByRole('heading', { name: 'insights.emptyTitle' })).not.toBeInTheDocument();
  });

  it('waits for the CRM signal before deciding which page state to render', () => {
    showData(0);
    vi.mocked(useCustomerList).mockReturnValue({ isLoading: true, isError: false } as ReturnType<typeof useCustomerList>);
    renderOverview();
    expect(screen.getByLabelText('common.loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('heading', { name: 'insights.emptyTitle' })).not.toBeInTheDocument();
  });
});
