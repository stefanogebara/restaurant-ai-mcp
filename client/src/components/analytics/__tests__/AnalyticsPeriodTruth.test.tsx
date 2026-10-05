import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AnalyticsStats, { LiveOccupancySignal } from '../AnalyticsStats';
import NoShowPredictions from '../NoShowPredictions';
import RevenueOpportunities from '../RevenueOpportunities';
import TableUtilizationHeatmap from '../TableUtilizationHeatmap';
import StatusBreakdownPie from '../StatusBreakdownPie';
import { useNoShowPredictions, useRevenueOpportunities } from '../../../hooks/usePredictiveAnalytics';
import AnalyticsTab from '../../../pages/insights/AnalyticsTab';
import { useAnalytics } from '../../../hooks/useAnalytics';

vi.mock('../../../hooks/useAnalytics', () => ({ useAnalytics: vi.fn() }));

vi.mock('../../../hooks/usePredictiveAnalytics', () => ({
  useNoShowPredictions: vi.fn(),
  useRevenueOpportunities: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => key === 'analytics.busiestDaySummary' && fallback && typeof fallback === 'object'
      ? `${fallback.day} accounts for ${fallback.count} bookings (${fallback.share}% of the period).`
      : typeof fallback === 'string' ? fallback : key,
    i18n: { language: 'pt-BR' },
  }),
}));

vi.mock('../../common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span aria-hidden="true" data-icon={name} />,
}));

describe('Analytics period truth', () => {
  beforeEach(() => vi.resetAllMocks());

  it('keeps supporting rates below the mobile lead metrics when the report is split around the chart', () => {
    const overview = {
      total_reservations: 10,
      total_revenue: 100,
      avg_party_size: 2.5,
      total_capacity: 12,
      current_occupancy: 3,
      current_occupancy_percentage: '25.0',
    };
    const props = { overview, reservationsByStatus: { confirmed: 9, 'no-show': 1 }, reservationsByDay: { Monday: 10 } };
    const { rerender } = render(<AnalyticsStats compact compactPart="lead" {...props} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('10,0%')).not.toBeInTheDocument();

    rerender(<AnalyticsStats compact compactPart="detail" {...props} />);
    expect(screen.queryByText('10')).not.toBeInTheDocument();
    expect(screen.getByText('10,0%')).toBeInTheDocument();
    expect(screen.getByText('No-shows')).toBeInTheDocument();
    expect(screen.getByText('Per booking')).toBeInTheDocument();
    expect(screen.getByText('people')).toBeInTheDocument();
  });

  it('derives status shares from the selected-period reservation statuses, not service totals', () => {
    const overview = {
      total_reservations: 10,
      total_completed_services: 999, // Deliberately all-time in the API.
      total_revenue: 0,
      avg_party_size: 2.4,
      total_capacity: 9,
      current_occupancy: 3,
      current_occupancy_percentage: '33.3',
    };
    render(<AnalyticsStats
      overview={overview}
      reservationsByStatus={{ confirmed: 7, 'no-show': 1, cancelled: 2 }}
      reservationsByDay={{ Monday: 3, Saturday: 7 }}
    />);

    expect(screen.getByText('10,0%')).toBeInTheDocument();
    expect(screen.getByText('20,0%')).toBeInTheDocument();
    expect(screen.getByText('Recorded revenue')).toBeInTheDocument();
    expect(screen.getByText('sábado accounts for 7 bookings (70% of the period).')).toBeInTheDocument();
    expect(screen.queryByText('Live · outside the date filter')).not.toBeInTheDocument();
    render(<LiveOccupancySignal occupiedSeats={overview.current_occupancy} totalSeats={overview.total_capacity} />);
    const liveSignal = screen.getByRole('region', { name: 'Occupancy now' });
    expect(within(liveSignal).getByText('33,3%')).toBeInTheDocument();
    expect(within(liveSignal).getByText('Live · outside the date filter')).toBeInTheDocument();
    expect(within(liveSignal).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33.3');
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
    expect(screen.getByText('Next 7 days')).toBeInTheDocument();
    expect(screen.queryByText('Next 7 days · scores, not probabilities.')).not.toBeInTheDocument();
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
    expect(rows[0]).toHaveTextContent('High ·76/100');
    expect(rows[1]).toHaveTextContent('Guest Low');
    expect(rows[1]).toHaveTextContent('Low ·12/100');
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
    expect(within(chart!).getByText(/All dates · service frequency/)).toBeInTheDocument();
  });

  it('leads with the most used tables and expands the remaining history on request', () => {
    const tableUtilization = [1, 6, 5, 4, 3, 2].map((times_used, index) => ({
      table_number: index + 1,
      capacity: 4,
      location: 'Sala',
      times_used,
      utilization_rate: '0',
    }));
    render(<TableUtilizationHeatmap tableUtilization={tableUtilization} />);

    expect(screen.queryByText('floorPlan.tableLabel 1')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Show all/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('floorPlan.tableLabel 1')).toBeInTheDocument();
  });

  it('renders readable status counts without relying on a chart canvas', () => {
    render(<StatusBreakdownPie reservationsByStatus={{ confirmed: 30, cancelled: 3, no_show: 1 }} />);
    const summary = screen.getByRole('img', { name: /reservations.confirmed: 30/ });
    expect(summary).toHaveAttribute('aria-label', 'reservations.confirmed: 30, reservations.cancelled: 3, reservations.noShow: 1');
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('9%')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
  });

  it('uses a semantic state color for seated bookings, not the action color', () => {
    render(<StatusBreakdownPie reservationsByStatus={{ seated: 2 }} />);
    const segment = screen.getByRole('img', { name: /reservations.seated: 2/ }).firstElementChild;
    expect(segment).toHaveStyle({ backgroundColor: '#819C82' });
    expect(segment).not.toHaveStyle({ backgroundColor: '#3F4E32' });
  });

  it('merges both no-show spellings before showing a status share', () => {
    render(<StatusBreakdownPie reservationsByStatus={{ confirmed: 6, no_show: 1, 'no-show': 1 }} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'reservations.confirmed: 6, reservations.noShow: 2');
    expect(screen.getAllByText('reservations.noShow')).toHaveLength(1);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});

describe('Analytics empty period', () => {
  it('shows a period-specific empty state while preserving live and future signals', () => {
    vi.mocked(useAnalytics).mockReturnValue({
      data: {
        overview: {
          total_reservations: 0,
          total_completed_services: 0,
          total_revenue: 0,
          avg_party_size: 0,
          avg_service_time_minutes: 0,
          total_capacity: 12,
          current_occupancy: 3,
          current_occupancy_percentage: '25.0',
        },
        reservations_by_status: {},
        reservations_by_day: {},
        reservations_by_time_slot: {},
        table_utilization: [],
        daily_trend: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalytics>);
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: { predictions: [], summary: { total_upcoming: 0, high_risk: 0, medium_risk: 0, low_risk: 0 } },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<AnalyticsTab />);
    expect(screen.getByRole('heading', { name: 'No activity recorded.' })).toBeInTheDocument();
    expect(screen.queryByText('Daily activity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Occupancy now' })).toHaveTextContent('25,0%');
    expect(screen.getByText('No upcoming reservations to assess')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View last 90 days' }));
    expect(screen.queryByRole('button', { name: 'View last 90 days' })).not.toBeInTheDocument();
  });
});
