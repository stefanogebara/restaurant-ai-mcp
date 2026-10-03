import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ServiceRiskTimeline from '../ServiceRiskTimeline';
import type { NoShowPrediction } from '../../../hooks/usePredictiveAnalytics';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { size?: number; score?: number; count?: number }) => {
      if (key === 'analytics.partyOf') return `Party of ${options?.size}`;
      if (key === 'insights.estimatedNoShowRisk') return `Risk ${options?.score}/100`;
      if (key === 'insights.todayCount') return `${options?.count} bookings`;
      return key;
    },
  }),
}));

const prediction = (
  reservation_id: string,
  time: string,
  risk_level: NoShowPrediction['risk_level'] = 'high',
): NoShowPrediction => ({
  reservation_id,
  customer_name: reservation_id,
  party_size: 3,
  date: '2026-09-30',
  time,
  risk_score: risk_level === 'high' ? 82 : 38,
  risk_level,
  days_until: 0,
  recommendations: [],
});

describe('ServiceRiskTimeline', () => {
  it('orders real booking times and lets the manager select a reservation', () => {
    const onSelect = vi.fn();
    render(
      <ServiceRiskTimeline
        predictions={[prediction('Bia', '21:30', 'medium'), prediction('Ana', '18:30:00')]}
        selectedId="Ana"
        onSelect={onSelect}
      />,
    );

    const list = screen.getByTestId('risk-timeline-list');
    const buttons = within(list).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName('18:30 · Ana · Party of 3 · Risk 82/100');
    expect(buttons[1]).toHaveAccessibleName('21:30 · Bia · Party of 3 · Risk 38/100');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith('Bia');
  });

  it('keeps simultaneous reservations as separate selectable rows', () => {
    render(
      <ServiceRiskTimeline
        predictions={[prediction('Ana', '20:00'), prediction('Bia', '20:00', 'medium')]}
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );

    const list = screen.getByTestId('risk-timeline-list');
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByRole('button', { name: /Ana/ })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Bia/ })).toBeInTheDocument();
  });

  it('puts invalid times last while keeping their reservations operable', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <ServiceRiskTimeline
        predictions={[prediction('Ana', 'not-a-time'), prediction('Caio', '19:15:88'), prediction('Bia', '19:15')]}
        selectedId={null}
        onSelect={onSelect}
      />,
    );

    const buttons = within(screen.getByTestId('risk-timeline-list')).getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName(/19:15 · Bia/);
    expect(buttons[1]).toHaveAccessibleName(/insights.timeUnavailable · Ana/);
    expect(buttons[2]).toHaveAccessibleName(/insights.timeUnavailable · Caio/);
    expect(container.innerHTML).not.toContain('NaN');
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith('Ana');
  });

  it('renders one reservation with its real time', () => {
    render(<ServiceRiskTimeline predictions={[prediction('Ana', '19:15')]} selectedId={null} onSelect={vi.fn()} />);
    expect(within(screen.getByTestId('risk-timeline-list')).getByRole('button', { name: /19:15 · Ana/ })).toBeInTheDocument();
  });

  it('has an honest empty state when there are no reservations', () => {
    render(<ServiceRiskTimeline predictions={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText('common.noData')).toBeInTheDocument();
    expect(screen.queryByTestId('risk-timeline-list')).not.toBeInTheDocument();
  });

  it('uses the hero canvas colors only when requested', () => {
    render(<ServiceRiskTimeline predictions={[prediction('Ana', '19:15'), prediction('Bia', '20:00')]} selectedId="Ana" onSelect={vi.fn()} appearance="hero" />);
    const list = screen.getByTestId('risk-timeline-list');
    expect(within(list).getByRole('button', { name: /Ana/ })).toHaveClass('hover:bg-brand-action/5');
    expect(within(list).getByRole('button', { name: /Ana/ })).not.toHaveClass('bg-brand-action/5');
    expect(list.querySelectorAll(':scope > span[aria-hidden="true"]')).toHaveLength(1);
  });
});
