import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { UpcomingReservation } from '../../types/host.types';
import Dashboard from '../Dashboard';

const state = vi.hoisted(() => ({ timezone: 'America/Sao_Paulo', reservations: [] as UpcomingReservation[] }));
vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../../hooks/useDashboardData', () => ({ useDashboardData: () => ({
  data: { data: { timezone: state.timezone, upcoming_reservations: state.reservations, tables: [], active_parties: [], restaurant_id: 'sandbox' } },
  isLoading: false, isError: false, refetch: vi.fn(),
}) }));
vi.mock('../../hooks/useRealtimeSubscription', () => ({ useRealtimeDashboard: vi.fn() }));
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));
vi.mock('../../hooks/useCompleteService', () => ({ useCompleteService: () => ({ mutate: vi.fn() }) }));
vi.mock('../../hooks/useRevenueStats', () => ({ useRevenueStats: () => ({ data: undefined }) }));
vi.mock('../../hooks/useSubscription', () => ({ usePlanInfo: () => ({ isTrial: false, isActive: true }) }));
vi.mock('../../hooks/useServiceMode', () => ({ useServiceMode: () => ({ isNight: false, toggle: vi.fn() }) }));
vi.mock('../../hooks/useWaitlistEntries', () => ({ useWaitlistEntries: () => ({ data: { waitlist: [] } }), countActiveWaitlist: () => 0 }));
vi.mock('../../components/dashboard/TableLayoutPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/TableTimeline', () => ({ default: () => null }));
vi.mock('../../components/dashboard/CustomerProfileDrawer', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ActivePartiesPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ManagerNotesPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StaffingForecastWidget', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectStatusBadge', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectNudgeBanner', () => ({ default: () => null }));
vi.mock('../../components/dashboard/RevenueStatsWidget', () => ({ default: () => null }));
vi.mock('../../components/dashboard/RevenueByPartySizeWidget', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ProactiveCommsPanel', () => ({ default: () => null }));
vi.mock('../../components/host/WaitlistPanel', () => ({ default: () => null }));

function reservation(date: string, name: string): UpcomingReservation {
  return { reservation_id: name, customer_name: name, customer_phone: '+15551234567',
    party_size: 2, date, time: '19:00', reservation_time: `${date} 19:00`, checked_in: false, status: 'confirmed' };
}
function page() { return <MemoryRouter><Dashboard /></MemoryRouter>; }

beforeEach(() => {
  vi.stubEnv('TZ', 'Europe/Madrid');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-09T23:30:00Z'));
  state.timezone = 'America/Sao_Paulo';
  state.reservations = [reservation('2026-11-09', 'Restaurant Today Guest'), reservation('2026-11-10', 'Restaurant Tomorrow Guest')];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('Dashboard reservation days belong to the restaurant', () => {
  it('puts November 10 in Tomorrow while a Madrid host is already on November 10', () => {
    expect(new Date().getDate()).toBe(10);
    renderWithProviders(page());
    expect(screen.getByText('Restaurant Today Guest')).toBeVisible();
    expect(screen.queryByText('Restaurant Tomorrow Guest')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    expect(screen.getByText('Restaurant Tomorrow Guest')).toBeVisible();
    expect(screen.queryByText('Restaurant Today Guest')).not.toBeInTheDocument();
  });

  it('moves the next calendar day into Today on a render after restaurant midnight', () => {
    const { rerender } = renderWithProviders(page());
    vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
    rerender(page());
    expect(screen.getByText('Restaurant Tomorrow Guest')).toBeVisible();
    expect(screen.queryByText('Restaurant Today Guest')).not.toBeInTheDocument();
  });

  it('keeps Tomorrow and day +7 distinct across the 25-hour Madrid daylight-saving day', () => {
    state.timezone = 'Europe/Madrid';
    vi.setSystemTime(new Date('2026-10-24T22:30:00Z'));
    state.reservations = [reservation('2026-10-25', 'DST Today Guest'), reservation('2026-10-26', 'DST Tomorrow Guest'),
      reservation('2026-11-01', 'Day Seven Guest'), reservation('2026-11-02', 'Day Eight Guest')];
    renderWithProviders(page());
    fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
    expect(screen.getByText('DST Tomorrow Guest')).toBeVisible();
    expect(screen.queryByText('DST Today Guest')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /This Week/i }));
    expect(screen.getByText('Day Seven Guest')).toBeVisible();
    expect(screen.queryByText('Day Eight Guest')).not.toBeInTheDocument();
  });
});


it('shows the restaurant weekday and calendar date rather than the travelling host date', () => {
  expect(new Date().getHours()).toBe(0);
  renderWithProviders(page());
  expect(screen.getByText('Monday, November 9')).toBeVisible();
  expect(screen.queryByText('Tuesday, November 10')).not.toBeInTheDocument();
});

it('greets the restaurant evening even when the Madrid browser is after midnight', () => {
  expect(new Date().getHours()).toBe(0);
  renderWithProviders(page());
  expect(screen.getByText('Boa noite 👋')).toBeVisible();
  expect(screen.queryByText('Bom dia 👋')).not.toBeInTheDocument();
});

it('uses the UTC fallback consistently for header, greeting and reservation groups', () => {
  state.timezone = 'invalid/zone';
  renderWithProviders(page());
  expect(screen.getByText('Monday, November 9')).toBeVisible();
  expect(screen.getByText('Boa noite 👋')).toBeVisible();
  expect(screen.getByText('Restaurant Today Guest')).toBeVisible();
});
