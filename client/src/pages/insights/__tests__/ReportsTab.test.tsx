import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../../test/renderWithProviders';
import ReportsTab from '../ReportsTab';

const mockReport = vi.fn();
const mockAuthFetch = vi.fn();
vi.mock('../../../hooks/useWeeklyReport', () => ({ useWeeklyReport: (...args: unknown[]) => mockReport(...args) }));
vi.mock('../../../services/api', () => ({ authFetch: (...args: unknown[]) => mockAuthFetch(...args) }));

const report = {
  summary: {
    total_covers: 2, previous_covers: 0, covers_change_percent: 0,
    total_reservations: 1, reservation_count: 1, walk_in_count: 0,
    avg_party_size: 2, cancellation_rate: 0, cancelled_count: 0,
  },
  busiest: { times: [], days: [] },
  demographics: { tourist_count: 0, local_count: 0, tourist_percentage: 0, first_time_visitors: 0, repeat_customers: 0 },
  preferences: { seating: {}, dietary_restrictions: {}, occasions: {}, languages: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/host-dashboard/insights?tab=reports&start_date=2026-09-01&end_date=2026-09-07');
  mockReport.mockReturnValue({ data: report, isLoading: false, isError: false, refetch: vi.fn() });
  mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ available: true, reason: null }) });
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('ReportsTab', () => {
  it('keeps draft date changes separate until Apply', async () => {
    renderWithProviders(<ReportsTab />);
    expect(mockReport).toHaveBeenLastCalledWith('2026-09-01', '2026-09-07');

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-02' } });
    expect(screen.getByText('Dates changed; the report below has not updated yet.')).toBeInTheDocument();
    expect(mockReport).toHaveBeenLastCalledWith('2026-09-01', '2026-09-07');

    await userEvent.click(screen.getByRole('button', { name: 'Apply period' }));
    expect(mockReport).toHaveBeenLastCalledWith('2026-09-02', '2026-09-07');
  });

  it('passes the displayed range to the WhatsApp endpoint only when delivery is available', async () => {
    renderWithProviders(<ReportsTab />);
    const send = await screen.findByRole('button', { name: 'Send via WhatsApp' });
    await userEvent.click(send);
    expect(mockAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining('start_date=2026-09-01&end_date=2026-09-07'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not offer a send action for an empty report', async () => {
    mockReport.mockReturnValue({ data: { ...report, summary: { ...report.summary, total_reservations: 0, total_covers: 0 } }, isLoading: false, isError: false, refetch: vi.fn() });
    renderWithProviders(<ReportsTab />);
    expect(screen.getByText('No reservations or completed services in this period. Try other dates.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send via WhatsApp' })).not.toBeInTheDocument();
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('explains when PDF delivery is unavailable without offering a broken action', async () => {
    mockAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ available: false, reason: 'renderer_unavailable' }) });
    renderWithProviders(<ReportsTab />);
    expect(await screen.findByText('PDF delivery via WhatsApp is currently unavailable. You can still print or save the report.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send via WhatsApp' })).not.toBeInTheDocument();
  });
});
