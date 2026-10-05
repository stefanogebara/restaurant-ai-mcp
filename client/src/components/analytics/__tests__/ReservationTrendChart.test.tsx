import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import ReservationTrendChart from '../ReservationTrendChart';

describe('ReservationTrendChart', () => {
  it('renders every daily observation on the unsmoothed line and one dated peak marker', () => {
    const dailyTrend = Array.from({ length: 30 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
      dayName: 'day',
      reservations: index + 1,
      completed_services: 99,
    }));
    render(<ReservationTrendChart dailyTrend={dailyTrend} />);

    const days = document.querySelectorAll('[data-date][data-count]');
    expect(days).toHaveLength(30);
    expect(days[0]).toHaveAttribute('data-date', '2026-09-01');
    expect(days[0]).toHaveAttribute('data-count', '1');
    expect(days[29]).toHaveAttribute('data-count', '30');
    expect(document.querySelectorAll('[data-day-point]')).toHaveLength(1);
    const trendPoints = document.querySelector('[data-trend-line] polyline')?.getAttribute('points')?.split(' ');
    expect(trendPoints).toHaveLength(30);
    expect(Number(trendPoints?.[0].split(',')[0])).toBeCloseTo(16.67, 1);
    expect(Number(trendPoints?.[0].split(',')[1])).toBeCloseTo(96.67, 1);
    expect(Number(trendPoints?.[29].split(',')[0])).toBeCloseTo(983.33, 1);
    expect(Number(trendPoints?.[29].split(',')[1])).toBe(0);
    expect(document.querySelectorAll('[data-peak-point="true"]')).toHaveLength(1);
    expect(screen.getByLabelText('Daily peak: 30 bookings on 09/30.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Line chart of daily reservations: 465 reservations in the selected period\. Daily peak: 30 bookings on 09\/30\./ })).toBeInTheDocument();
    const exactValues = screen.getByRole('table', { name: 'Reservations by Day' });
    expect(within(exactValues).getAllByRole('row')).toHaveLength(31);
    expect(within(exactValues).getByText('September 30, 2026')).toBeInTheDocument();
  });

  it('keeps every day in a longer range without artificial gaps', () => {
    const dailyTrend = Array.from({ length: 90 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10),
      dayName: 'day',
      reservations: index % 12,
      completed_services: 0,
    }));
    render(<ReservationTrendChart dailyTrend={dailyTrend} />);

    expect(document.querySelectorAll('[data-date][data-count]')).toHaveLength(90);
    expect(document.querySelector('[data-trend-line] polyline')?.getAttribute('points')?.split(' ')).toHaveLength(90);
    expect(document.querySelectorAll('[data-day-point]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-week-break]')).toHaveLength(0);
    expect(document.querySelector('[data-chart-scrollable]')).toHaveAttribute('data-chart-scrollable', 'true');
    expect(screen.getByRole('table', { name: 'Reservations by Day' })).toBeInTheDocument();
  });

  it('preserves zero and integer daily counts rather than showing completed services', () => {
    render(<ReservationTrendChart dailyTrend={[
      { date: '2026-09-28', dayName: 'Mon', reservations: 1, completed_services: 7 },
      { date: '2026-09-29', dayName: 'Tue', reservations: 0, completed_services: 9 },
      { date: '2026-09-30', dayName: 'Wed', reservations: 7, completed_services: 10 },
    ]} />);

    const days = document.querySelectorAll('[data-date][data-count]');
    expect(days).toHaveLength(3);
    expect(days[1]).toHaveAttribute('data-count', '0');
    expect(days[1].querySelector('[data-day-point]')).toBeNull();
    expect(days[2]).toHaveAttribute('data-count', '7');
    expect(days[2].querySelector('[data-day-point]')).toHaveStyle({ bottom: 'calc(87.5% - 4px)' });
    expect(document.querySelector('[data-trend-line] polyline')?.getAttribute('points')?.split(' ').map(point => Number(point.split(',')[1]))).toEqual([87.5, 100, 12.5]);
    expect(screen.getByRole('img', { name: /Line chart of daily reservations: 8 reservations/ })).toBeInTheDocument();
  });

  it.each([
    { dailyTrend: [] },
    { dailyTrend: [{ date: '2026-09-30', dayName: 'Wed', reservations: 0, completed_services: 0 }] },
    { dailyTrend: [{ date: '2026-09-30', dayName: 'Wed', reservations: 0, completed_services: 2 }] },
  ])('shows a readable empty state when there is no reservation activity', ({ dailyTrend }) => {
    render(<ReservationTrendChart dailyTrend={dailyTrend} />);

    expect(screen.getByText('No reservations in this period')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
