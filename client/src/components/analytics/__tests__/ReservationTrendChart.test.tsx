import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReservationTrendChart from '../ReservationTrendChart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div data-testid="daily-chart">{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: ({ domain, allowDecimals }: { domain: Array<number | string>; allowDecimals: boolean }) => (
    <span data-testid="daily-axis" data-domain={domain.join(',')} data-integers-only={!allowDecimals} />
  ),
  Tooltip: () => null,
  Legend: () => null,
  Area: ({ dataKey, type, name }: { dataKey: string; type: string; name: string }) => (
    <span data-testid={`${dataKey}-series`} data-interpolation={type} data-name={name} data-mark="area" />
  ),
  ReferenceDot: ({ x, y }: { x: string; y: number }) => <span data-testid="daily-peak" data-date={x} data-value={y} />,
}));

describe('ReservationTrendChart', () => {
  it('names only the reservation series and avoids a fabricated trend claim', () => {
    render(<ReservationTrendChart dailyTrend={[
      { date: '2026-09-29', dayName: 'Tue', reservations: 3, completed_services: 1 },
      { date: '2026-09-30', dayName: 'Wed', reservations: 0, completed_services: 2 },
    ]} />);

    expect(screen.getByRole('heading', { name: 'Reservations by Day' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Daily line chart of 3 reservations in the selected period.' })).toBeInTheDocument();
    expect(screen.queryByText(/stable|trending up|trending down/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('reservations-series')).toHaveAttribute('data-name', 'Reservations');
    expect(screen.queryByTestId('completed_services-series')).not.toBeInTheDocument();
    expect(screen.getByTestId('daily-peak')).toHaveAttribute('data-value', '3');
  });

  it('uses a straight reservation series on an integer zero baseline', () => {
    render(<ReservationTrendChart dailyTrend={[
      { date: '2026-09-28', dayName: 'Mon', reservations: 1, completed_services: 0 },
      { date: '2026-09-29', dayName: 'Tue', reservations: 7, completed_services: 4 },
      { date: '2026-09-30', dayName: 'Wed', reservations: 2, completed_services: 1 },
    ]} />);

    expect(screen.getByTestId('reservations-series')).toHaveAttribute('data-interpolation', 'linear');
    expect(screen.queryByTestId('completed_services-series')).not.toBeInTheDocument();
    expect(screen.getByTestId('daily-axis')).toHaveAttribute('data-domain', '0,auto');
    expect(screen.getByTestId('daily-axis')).toHaveAttribute('data-integers-only', 'true');
  });

  it.each([
    { dailyTrend: [] },
    { dailyTrend: [{ date: '2026-09-30', dayName: 'Wed', reservations: 0, completed_services: 0 }] },
    { dailyTrend: [{ date: '2026-09-30', dayName: 'Wed', reservations: 0, completed_services: 2 }] },
  ])('shows a readable empty state when there is no activity', ({ dailyTrend }) => {
    render(<ReservationTrendChart dailyTrend={dailyTrend} />);

    expect(screen.getByText('No reservations in this period')).toBeInTheDocument();
    expect(screen.queryByTestId('daily-chart')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
