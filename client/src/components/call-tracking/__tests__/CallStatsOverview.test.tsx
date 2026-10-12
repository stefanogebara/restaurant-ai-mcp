import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Stats } from '../callTrackingTypes';
import CallStatsOverview from '../CallStatsOverview';

function stats(total: number, booked: number): Stats {
  return {
    overview: {
      total_calls: total,
      successful_bookings: booked,
      success_rate: total > 0 ? booked / total * 100 : 0,
      average_duration_seconds: total > 0 ? 60 : 0,
      average_duration_formatted: total > 0 ? '1m' : '0s',
    },
    breakdowns: { by_outcome: {}, by_language: {}, by_day: {} },
    top_errors: [],
  };
}

describe('CallStatsOverview', () => {
  it('does not claim a 0% success rate when there were no calls', () => {
    render(<CallStatsOverview stats={stats(0, 0)} />);

    expect(screen.getByText('Calls in selected period')).toBeInTheDocument();
    expect(screen.queryByText('Total Calls Today')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0s')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows observed rates when calls exist', () => {
    render(<CallStatsOverview stats={stats(5, 2)} />);

    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });
});
