import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AnalyticsStats from '../AnalyticsStats';
import NoShowPredictions from '../NoShowPredictions';
import RevenueOpportunities from '../RevenueOpportunities';
import TableUtilizationHeatmap from '../TableUtilizationHeatmap';
import StatusBreakdownPie from '../StatusBreakdownPie';
import { useNoShowPredictions, useRevenueOpportunities } from '../../../hooks/usePredictiveAnalytics';

vi.mock('../../../hooks/usePredictiveAnalytics', () => ({
  useNoShowPredictions: vi.fn(),
  useRevenueOpportunities: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => typeof fallback === 'string' ? fallback : key,
    i18n: { language: 'pt-BR' },
  }),
}));

vi.mock('../../common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span aria-hidden="true" data-icon={name} />,
}));

describe('Analytics period truth', () => {
  beforeEach(() => vi.resetAllMocks());

  it('derives status shares from the selected-period reservation statuses, not service totals', () => {
    const overview = {
      total_reservations: 10,
      total_completed_services: 999, // Deliberately all-time in the API.
      total_revenue: 0,
      avg_party_size: 2.4,
      current_occupancy_percentage: '33.3',
    };
    render(<AnalyticsStats
      overview={overview}
      reservationsByStatus={{ confirmed: 7, 'no-show': 1, cancelled: 2 }}
    />);

    expect(screen.getByText('10.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('Recorded revenue')).toBeInTheDocument();
    expect(screen.getByText('Bills recorded in this period')).toBeInTheDocument();
    expect(screen.getByText('Live · outside the date filter')).toBeInTheDocument();
  });

  it('does not surface the backend historical rate, which also counts cancellations', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: {
        predictions: [],
        summary: {
          total_upcoming: 0,
          high_risk: 0,
          medium_risk: 0,
          low_risk: 0,
          historical_no_show_rate: 66.8,
          estimated_potential_no_shows: 4,
        },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<NoShowPredictions />);
    expect(screen.queryByText('66.8%')).not.toBeInTheDocument();
    expect(screen.getByText('Next 7 days · independent of the date filter · ranked risk signals, not calibrated probabilities.')).toBeInTheDocument();
    expect(screen.getByText('No upcoming reservations to assess')).toBeInTheDocument();
  });

  it('does not report an all-clear if prediction data is unavailable', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<NoShowPredictions />);
    expect(screen.getByText('Risk predictions unavailable')).toBeInTheDocument();
    expect(screen.getByText('No risk conclusion can be drawn from this view.')).toBeInTheDocument();
  });

  it('orders the risk shortlist by score even when a later booking has greater risk', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: {
        predictions: [
          { reservation_id: 'low', customer_name: 'Guest Low', party_size: 2, date: '2026-09-30', time: '19:00', days_until: 0, risk_score: 12, risk_level: 'low', recommendations: [] },
          { reservation_id: 'high', customer_name: 'Guest High', party_size: 2, date: '2026-10-02', time: '20:00', days_until: 2, risk_score: 76, risk_level: 'high', recommendations: [] },
        ],
        summary: { total_upcoming: 2, high_risk: 1, medium_risk: 0, low_risk: 1, historical_no_show_rate: 0, estimated_potential_no_shows: 0 },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<NoShowPredictions />);
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Guest High');
    expect(rows[1]).toHaveTextContent('Guest Low');
  });

  it('hides unvalidated revenue projections and the inert implementation button', () => {
    vi.mocked(useRevenueOpportunities).mockReturnValue({
      data: {
        opportunities: [{
          rank: 1,
          category: 'Revenue Per Cover',
          description: 'Increase average revenue per customer through upselling',
          current_loss: 10000,
          potential_gain: 5856,
          recovery_rate: '15%',
          actions: ['Highlight premium menu items'],
          priority: 'high',
          implementation_difficulty: 'low',
          estimated_timeline: '1-2 weeks',
        }],
        summary: {
          total_opportunities: 1,
          total_potential_revenue: 5856,
          estimated_monthly_impact: 488,
          quick_wins: 1,
          high_priority: 1,
        },
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useRevenueOpportunities>);

    render(<RevenueOpportunities />);
    expect(screen.getByText('Receita por cliente')).toBeInTheDocument();
    expect(screen.queryByText(/5.856|5856|488/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('labels table data as all-time service frequency, not period occupancy', () => {
    render(<TableUtilizationHeatmap tableUtilization={[{
      table_number: 7,
      capacity: 4,
      location: 'Sala',
      times_used: 3,
      utilization_rate: '75.0',
    }]} />);

    const chart = screen.getByRole('heading', { name: 'Recorded services by table' }).closest('section');
    expect(chart).not.toBeNull();
    expect(within(chart!).getByText('3')).toBeInTheDocument();
    expect(within(chart!).queryByText('75.0%')).not.toBeInTheDocument();
    expect(within(chart!).getByText(/regardless of the selected period/)).toBeInTheDocument();
  });

  it('renders readable status counts without relying on a chart canvas', () => {
    render(<StatusBreakdownPie reservationsByStatus={{ confirmed: 30, cancelled: 3, no_show: 1 }} />);
    const summary = screen.getByRole('img', { name: /reservations.confirmed: 30/ });
    expect(summary).toHaveAttribute('aria-label', 'reservations.confirmed: 30, reservations.cancelled: 3, reservations.noShow: 1');
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('9%')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
  });
});
