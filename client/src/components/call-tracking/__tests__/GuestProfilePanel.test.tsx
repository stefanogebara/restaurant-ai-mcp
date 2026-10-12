import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import GuestProfilePanel from '../GuestProfilePanel';

const mocks = vi.hoisted(() => ({ fail: false }));

vi.mock('../../../services/api', () => ({
  authFetch: async () => ({
    ok: !mocks.fail,
    json: async () => ({
      success: true,
      profile: {
        phone: '+5511999888777',
        name: 'Beatriz Costa',
        call_stats: {
          total_calls: 1,
          successful_bookings: 1,
          average_duration_seconds: 30,
          sentiment: { positive: 1, neutral: 0, negative: 0 },
          first_call: null,
          last_call: null,
        },
        reservation_stats: { total_reservations: 1, upcoming: 1 },
        ltv: {
          total_visits: 3,
          total_spend: 240,
          average_spend: 80,
          last_visit: '2026-10-10',
          churn_risk: 80,
          tier: 'regular',
          tags: [],
        },
        recent_calls: [],
        recent_reservations: [{ id: 'r-1', date: '2026-10-11', time: '19:00', party_size: 2, status: 'confirmed', name: 'Beatriz Costa' }],
      },
    }),
  }),
}));

describe('GuestProfilePanel', () => {
  it('reads the API 0–100 churn score without multiplying it by 100', async () => {
    mocks.fail = false;
    renderWithProviders(<GuestProfilePanel phone="+5511999888777" onClose={vi.fn()} />);

    expect(await screen.findByText('80/100')).toBeInTheDocument();
    expect(screen.queryByText('8000%')).not.toBeInTheDocument();
    expect(screen.getByText('80/100').previousElementSibling?.firstElementChild).toHaveStyle({ width: '80%' });
    expect(screen.getByText('Estimated spend/visit')).toBeInTheDocument();
    expect(screen.getByText('Oct 11, 2026 · 19:00')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('shows an actionable error instead of falsely claiming no data when the API fails', async () => {
    mocks.fail = true;
    renderWithProviders(<GuestProfilePanel phone="+5511999888777" onClose={vi.fn()} />);

    expect(await screen.findByText("We couldn't load this guest's profile. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No data found for this number.')).not.toBeInTheDocument();
  });
});
