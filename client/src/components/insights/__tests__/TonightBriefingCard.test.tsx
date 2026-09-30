import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import TonightBriefingCard from '../TonightBriefingCard';
import { useNoShowPredictions, type NoShowPrediction } from '../../../hooks/usePredictiveAnalytics';

vi.mock('../../../hooks/usePredictiveAnalytics', () => ({
  useNoShowPredictions: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === 'insights.moreHighRisk' ? `${options?.count} future high risk` : key,
  }),
}));

vi.mock('../../common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => <span aria-hidden="true" data-icon={name} />,
}));

const prediction = (
  reservation_id: string,
  days_until: number,
  risk_level: NoShowPrediction['risk_level'],
): NoShowPrediction => ({
  reservation_id,
  customer_name: reservation_id,
  party_size: 2,
  date: '2026-09-30',
  time: '20:00',
  risk_score: risk_level === 'high' ? 82 : 42,
  risk_level,
  days_until,
  recommendations: [],
});

function showPredictions(predictions: NoShowPrediction[]) {
  vi.mocked(useNoShowPredictions).mockReturnValue({
    data: {
      predictions,
      summary: {
        total_upcoming: 42,
        high_risk: 12,
        medium_risk: 9,
        low_risk: 21,
        historical_no_show_rate: 0.1,
        estimated_potential_no_shows: 4,
      },
    },
    isLoading: false,
  } as ReturnType<typeof useNoShowPredictions>);
}

describe('TonightBriefingCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('counts only today in every metric, regardless of the all-upcoming summary', () => {
    showPredictions([
      prediction('Ana', 0, 'high'),
      prediction('Bia', 0, 'medium'),
      prediction('Caio', 0, 'low'),
      prediction('Dani', 1, 'high'),
      prediction('Eli', 2, 'medium'),
    ]);

    render(<TonightBriefingCard />);

    expect(within(screen.getByRole('group', { name: 'insights.tonight' })).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'insights.highRisk' })).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'insights.mediumRisk' })).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Ana', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Dani')).not.toBeInTheDocument();
    expect(screen.queryByText('1 future high risk')).not.toBeInTheDocument();
  });

  it('does not mark medium-risk predictions as an emerald all-clear', () => {
    showPredictions([prediction('Bia', 0, 'medium')]);

    render(<TonightBriefingCard />);

    expect(screen.getByText('Bia', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('insights.noHighRiskTonight')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /insights.openReservations/ })).toHaveAttribute('href', '/host-dashboard/simple');
  });

  it('changes the focused decision when a different booking is selected on the timeline', () => {
    showPredictions([prediction('Ana', 0, 'high'), prediction('Bia', 0, 'medium')]);
    render(<TonightBriefingCard />);

    fireEvent.click(within(screen.getByRole('region', { name: 'insights.serviceTimeline' })).getByRole('button', { name: /20:00 · Bia/ }));
    expect(screen.getByText('Bia', { selector: 'p' })).toBeInTheDocument();
  });

  it('reserves emerald for a day with no predicted risk', () => {
    showPredictions([]);

    render(<TonightBriefingCard />);

    expect(screen.getByText('insights.noReservationsToday').parentElement).toHaveClass('text-emerald-700');
  });

  it('does not report an all-clear when prediction data is unavailable', () => {
    vi.mocked(useNoShowPredictions).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useNoShowPredictions>);

    render(<TonightBriefingCard />);

    expect(screen.getByText('common.noData')).toBeInTheDocument();
    expect(screen.queryByText('insights.noReservationsToday')).not.toBeInTheDocument();
  });
});
