import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
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


describe('Guest drawer keyboard lifecycle', () => {
  it('moves focus inside, traps Tab and closes with Escape using the latest callback', () => {
    mocks.fail = false;
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const { rerender } = renderWithProviders(<GuestProfilePanel phone="+5511999888777" onClose={firstClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Guest profile' });
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    const close = screen.getByRole('button', { name: 'Close' });
    // jsdom has no layout. Give the real close button a visible offset parent.
    Object.defineProperty(close, 'offsetParent', { configurable: true, get: () => document.body });
    close.focus();
    rerender(<GuestProfilePanel phone="+5511999888777" onClose={latestClose} />);
    expect(close).toHaveFocus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(close, tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
  });

  it('restores the opener and an existing body scroll style after closing', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    document.body.style.overflow = 'clip';
    const { unmount } = renderWithProviders(<GuestProfilePanel phone="+5511999888777" onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('clip');
    document.body.style.overflow = '';
    trigger.remove();
  });
});
