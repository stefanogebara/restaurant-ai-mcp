import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { UpcomingReservation } from '../../types/host.types';
import Dashboard from '../Dashboard';

// 2026-11-21, measured in production: each dashboard load made 10 API calls.
// Five came from the lower widgets, which mounted while the waitlist was still
// loading (its count was null, so "empty" read as false) and folded away a
// moment later. These tests pin the order: nothing below the fold mounts
// while emptiness is unknown, and the revenue call waits for bookings.
const state = vi.hoisted(() => ({
  loading: false,
  waitlist: undefined as { waitlist: unknown[] } | undefined,
  reservations: [] as UpcomingReservation[],
  revenueOptions: [] as Array<{ enabled?: boolean } | undefined>,
}));

vi.mock('../../components/layout/DashboardLayout', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('../../hooks/useDashboardData', () => ({ useDashboardData: () => ({
  data: state.loading ? undefined : { data: { timezone: 'America/Sao_Paulo', upcoming_reservations: state.reservations, tables: [], active_parties: [], restaurant_id: 'r-1' } },
  isLoading: state.loading, isError: false, refetch: vi.fn(),
}) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ role: 'owner' }) }));
vi.mock('../../hooks/useRealtimeSubscription', () => ({ useRealtimeDashboard: vi.fn() }));
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));
vi.mock('../../hooks/useCompleteService', () => ({ useCompleteService: () => ({ mutate: vi.fn() }) }));
vi.mock('../../hooks/useRevenueStats', () => ({ useRevenueStats: (options?: { enabled?: boolean }) => {
  state.revenueOptions.push(options);
  return { data: undefined };
} }));
vi.mock('../../hooks/useSubscription', () => ({ usePlanInfo: () => ({ isTrial: false, isActive: true }) }));
vi.mock('../../hooks/useServiceMode', () => ({ useServiceMode: () => ({ isNight: false, toggle: vi.fn() }) }));
vi.mock('../../hooks/useWaitlistEntries', () => ({
  useWaitlistEntries: () => ({ data: state.waitlist, isError: false }),
  countActiveWaitlist: (entries: unknown[]) => entries.length,
}));
vi.mock('../../components/dashboard/TableLayoutPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/TableTimeline', () => ({ default: () => null }));
vi.mock('../../components/dashboard/CustomerProfileDrawer', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ActivePartiesPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectStatusBadge', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectNudgeBanner', () => ({ default: () => null }));
vi.mock('../../components/host/WaitlistPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ReservationsList', () => ({ default: () => null }));
// The five lower widgets: each one would start its own API call on mount.
vi.mock('../../components/dashboard/ManagerNotesPanel', () => ({ default: () => <div data-testid="lower-widget" /> }));
vi.mock('../../components/dashboard/RevenueByPartySizeWidget', () => ({ default: () => <div data-testid="lower-widget" /> }));
vi.mock('../../components/dashboard/StaffingForecastWidget', () => ({ default: () => <div data-testid="lower-widget" /> }));
vi.mock('../../components/dashboard/RevenueStatsWidget', () => ({ default: () => <div data-testid="lower-widget" /> }));
vi.mock('../../components/dashboard/ProactiveCommsPanel', () => ({ default: () => <div data-testid="lower-widget" /> }));

function booking(date: string): UpcomingReservation {
  return { reservation_id: `r-${date}`, customer_name: 'Ana', customer_phone: '+5511999990000',
    party_size: 2, date, time: '19:00', reservation_time: `${date} 19:00`, checked_in: false, status: 'confirmed' };
}
function page() { return <MemoryRouter><Dashboard /></MemoryRouter>; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-21T15:00:00Z'));
  state.loading = false;
  state.waitlist = { waitlist: [] };
  state.reservations = [];
  state.revenueOptions = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('the dashboard only loads what the first screen shows', () => {
  it('mounts no lower widget while the dashboard is still loading', () => {
    state.loading = true;
    state.waitlist = undefined;
    renderWithProviders(page());
    expect(screen.queryAllByTestId('lower-widget')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /analytics|análises/i })).not.toBeInTheDocument();
  });

  it('mounts no lower widget while only the waitlist is still loading', () => {
    state.waitlist = undefined;
    renderWithProviders(page());
    expect(screen.queryAllByTestId('lower-widget')).toHaveLength(0);
  });

  it('an empty day shows the fold button, not the widgets', () => {
    renderWithProviders(page());
    expect(screen.queryAllByTestId('lower-widget')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /analytics|análises/i })).toBeInTheDocument();
  });

  it('a day with bookings shows the widgets (mounted at once where IntersectionObserver is missing)', () => {
    state.reservations = [booking('2026-11-21')];
    renderWithProviders(page());
    expect(screen.getAllByTestId('lower-widget')).toHaveLength(5);
  });

  it('asks for revenue figures only when there are bookings to price', () => {
    renderWithProviders(page());
    expect(state.revenueOptions.at(-1)).toEqual({ enabled: false });
    state.reservations = [booking('2026-11-22')];
    renderWithProviders(page());
    expect(state.revenueOptions.at(-1)).toEqual({ enabled: true });
  });
});
