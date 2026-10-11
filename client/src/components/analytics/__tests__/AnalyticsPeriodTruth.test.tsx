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
    t: (key: string, fallback?: string | Record<string, unknown>) => key === 'analytics.occupancySeatCount' && fallback && typeof fallback === 'object'
      ? `${fallback.occupied} of ${fallback.capacity} seats occupied`
      : key === 'analytics.occupancyFooterCount' && fallback && typeof fallback === 'object'
      ? `${fallback.occupied}/${fallback.capacity} seats occupied`
      : key === 'analytics.reviewShortlistCount' && fallback && typeof fallback === 'object'
      ? `Showing ${fallback.shown} of ${fallback.total} bookings to review.`
      : key === 'analytics.busiestDaySummary' && fallback && typeof fallback === 'object'
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

  it('shows exact zero occupancy without a meaningless decimal', () => {
    render(<LiveOccupancySignal occupiedSeats={0} totalSeats={74} />);
    const liveSignal = screen.getByRole('region', { name: 'Occupancy now' });
    expect(within(liveSignal).getByText('0%')).toBeInTheDocument();
    expect(within(liveSignal).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('keeps the live scope label attached to compact empty-period occupancy', () => {
    render(<LiveOccupancySignal occupiedSeats={0} totalSeats={74} compact />);
    const liveSignal = screen.getByRole('region', { name: 'Occupancy now' });
    expect(within(liveSignal).getByText('0%')).toBeInTheDocument();
    expect(within(liveSignal).getByText('Live · outside the date filter')).toBeInTheDocument();
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
    expect(screen.queryByText('Next 7 days')).not.toBeInTheDocument();
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

  it('does not claim there are no future bookings when the summary has bookings but the shortlist is missing', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: {
        predictions: [],
        summary: { total_upcoming: 17, high_risk: 1, medium_risk: 1, low_risk: 15 },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<NoShowPredictions featured />);
    expect(screen.getByRole('heading', { name: '2 to review' })).toBeInTheDocument();
    expect(screen.getByText('Risk predictions unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No upcoming reservations to assess')).not.toBeInTheDocument();
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
    expect(screen.getByText('upcoming bookings')).toBeInTheDocument();
    expect(screen.getByText('Up to 10 in this list')).toBeInTheDocument();
    expect(screen.getByText('Scores are not probabilities and do not confirm a no-show.')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Guest High');
    expect(rows[0]).toHaveTextContent('High ·76/100');
    expect(rows[1]).toHaveTextContent('Guest Low');
    expect(rows[1]).toHaveTextContent('Low ·12/100');
  });

  it('makes the future summary lead when historical activity is empty', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: {
        predictions: [
          { reservation_id: 'low', customer_name: 'Guest Low', party_size: 2, date: '2026-10-11', time: '18:00', days_until: 3, risk_score: 90, risk_level: 'low', recommendations: [] },
          { reservation_id: 'high', customer_name: 'Guest High', party_size: 2, date: '2026-10-09', time: '19:00', days_until: 1, risk_score: 82, risk_level: 'high', recommendations: [] },
          { reservation_id: 'medium', customer_name: 'Guest Medium', party_size: 2, date: '2026-10-10', time: '20:00', days_until: 2, risk_score: 63, risk_level: 'medium', recommendations: [] },
        ],
        summary: { total_upcoming: 17, high_risk: 1, medium_risk: 1, low_risk: 15 },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<NoShowPredictions featured />);
    expect(screen.getByText('Next 7 days')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '2 to review' })).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.trim() === 'Among 17 upcoming bookings')).toBeInTheDocument();
    expect(screen.getByText('Estimated risk, not a no-show probability.')).toBeInTheDocument();
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Guest High');
    expect(rows[0]).toHaveTextContent('High risk');
    expect(rows[0]).not.toHaveTextContent('82/100');
    expect(rows[1]).toHaveTextContent('Guest Medium');
    const otherDetails = screen.getByText('Other assessed bookings · up to 10 shown').closest('details');
    expect(otherDetails).not.toHaveAttribute('open');
    expect(within(otherDetails!).getByRole('button', { name: /Guest Low/ })).toBeInTheDocument();
    expect(screen.queryByText('Up to 10 in this list')).not.toBeInTheDocument();
    fireEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
    expect(rows[0]).toHaveTextContent('Risk score {{score}}');
    fireEvent.click(screen.getByText('Other assessed bookings · up to 10 shown'));
    expect(otherDetails).toHaveAttribute('open');
  });

  it('discloses when the top-ten response shows fewer review rows than the total risk count', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: {
        predictions: Array.from({ length: 10 }, (_, index) => ({
          reservation_id: `high-${index}`,
          customer_name: `Guest ${index + 1}`,
          party_size: 2,
          date: '2026-10-10',
          time: '19:00',
          days_until: 2,
          risk_score: 90 - index,
          risk_level: 'high',
          recommendations: [],
        })),
        summary: { total_upcoming: 17, high_risk: 12, medium_risk: 0, low_risk: 5 },
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useNoShowPredictions>);

    render(<NoShowPredictions featured />);
    expect(screen.getByRole('heading', { name: '12 to review' })).toBeInTheDocument();
    expect(screen.getByText('Showing 10 of 12 bookings to review.')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(10);
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
  it('shows an error instead of a false zero when the analytics request fails', () => {
    const refetch = vi.fn();
    vi.mocked(useAnalytics).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useAnalytics>);

    render(<AnalyticsTab />);
    expect(screen.getByText('analytics.errorTitle')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No bookings in this period.' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Period overview' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('does not show cached metrics as current when a refetch fails', () => {
    vi.mocked(useAnalytics).mockReturnValue({
      data: {
        overview: { total_reservations: 0, total_revenue: 0, total_capacity: 74, current_occupancy: 0 },
        reservations_by_status: {}, reservations_by_day: {}, reservations_by_time_slot: {}, table_utilization: [], daily_trend: [],
      },
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalytics>);

    render(<AnalyticsTab />);
    expect(screen.getByText('analytics.errorTitle')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Period overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Occupancy now' })).not.toBeInTheDocument();
  });

  it.each(['upgrade_required', 'no_restaurant'] as const)('keeps the %s access state separate from a true zero report', gate => {
    vi.mocked(useAnalytics).mockReturnValue({
      data: {
        [gate]: true,
        overview: { total_reservations: 0, total_revenue: 0, total_capacity: 0, current_occupancy: 0 },
        reservations_by_status: {}, reservations_by_day: {}, reservations_by_time_slot: {}, table_utilization: [], daily_trend: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAnalytics>);

    render(<AnalyticsTab />);
    expect(screen.queryByRole('region', { name: 'Period overview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Occupancy now' })).not.toBeInTheDocument();
    expect(screen.queryByText('No upcoming reservations to assess')).not.toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', gate === 'no_restaurant' ? '/onboarding' : '/subscription/manage');
  });

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
    const periodOverview = screen.getByRole('region', { name: 'Period overview' });
    expect(within(periodOverview).getByRole('heading', { name: 'No bookings in this period.' })).toBeInTheDocument();
    expect(within(periodOverview).getByText('No recorded revenue on the selected dates either.')).toBeInTheDocument();
    expect(screen.queryByText('Daily activity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
    const occupancy = screen.getByRole('region', { name: 'Occupancy now' });
    expect(occupancy).toHaveTextContent('3/12 seats occupied');
    expect(occupancy).toHaveTextContent('Live · outside the date filter');
    expect(occupancy).not.toHaveTextContent('25%');
    expect(screen.getByText('No upcoming reservations to assess')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View 90 days' }));
    expect(screen.queryByRole('button', { name: 'View 90 days' })).not.toBeInTheDocument();
  });
});
