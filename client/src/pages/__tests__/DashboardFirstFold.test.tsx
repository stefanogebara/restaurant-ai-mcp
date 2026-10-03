import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';
import { formatLocalDate } from '../../utils/timeFormatting';

const state = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({ useQuery: () => state.query }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'pt-BR' },
    t: (key: string, fallback?: string) => ({
      'dashboard.stats.tables': 'Mesas Disponíveis',
      'dashboard.stats.tablesShort': 'Livres',
      'dashboard.welcomeGuide.title': 'Seu painel está pronto!',
    }[key] || fallback || key),
  }),
}));
vi.mock('../../hooks/useDocumentTitle', () => ({ useDocumentTitle: vi.fn() }));
vi.mock('../../hooks/useRealtimeSubscription', () => ({ useRealtimeDashboard: vi.fn() }));
vi.mock('../../hooks/useCompleteService', () => ({ useCompleteService: () => ({ mutate: vi.fn() }) }));
vi.mock('../../hooks/useSubscription', () => ({ usePlanInfo: () => ({ isTrial: false, isActive: true, status: 'active' }) }));
vi.mock('../../hooks/useServiceMode', () => ({ useServiceMode: () => ({ isNight: false, toggle: vi.fn() }) }));
vi.mock('../../hooks/useRevenueStats', () => ({ useRevenueStats: () => ({ data: undefined }) }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock('../../lib/analytics', () => ({ trackFirstReservationCreated: vi.fn() }));

vi.mock('../../components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/dashboard/ReservationsList', () => ({
  default: ({ language }: { language: string }) => <div data-testid="reservations-list" data-language={language} />,
}));
vi.mock('../../components/dashboard/TableLayoutPanel', () => ({ default: () => <div data-testid="floor-plan" /> }));
vi.mock('../../components/dashboard/TableTimeline', () => ({ default: () => null }));
vi.mock('../../components/dashboard/CustomerProfileDrawer', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ActivePartiesPanel', () => ({ default: () => null }));
vi.mock('../../components/host/WaitlistPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ManagerNotesPanel', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StaffingForecastWidget', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectStatusBadge', () => ({ default: () => null }));
vi.mock('../../components/dashboard/StripeConnectNudgeBanner', () => ({ default: () => null }));
vi.mock('../../components/dashboard/RevenueStatsWidget', () => ({ default: () => null }));
vi.mock('../../components/dashboard/RevenueByPartySizeWidget', () => ({ default: () => null }));
vi.mock('../../components/dashboard/ProactiveCommsPanel', () => ({ default: () => null }));
vi.mock('../../components/host/WalkInModal', () => ({ default: () => null }));
vi.mock('../../components/host/SeatPartyModal', () => ({ default: () => null }));
vi.mock('../../components/host/CheckInModal', () => ({ default: () => null }));
vi.mock('../../components/host/QuickInterventionModal', () => ({ default: () => null }));
vi.mock('../../components/host/AddReservationModal', () => ({ default: () => null }));
vi.mock('../../components/host/EditReservationModal', () => ({ default: () => null }));
vi.mock('../../components/host/CancelReservationDialog', () => ({ default: () => null }));
vi.mock('../../components/dashboard/DepositRequestModal', () => ({ default: () => null }));
vi.mock('../../components/dashboard/LaunchChecklistModal', () => ({ default: () => null }));

function dashboardData(waitlistCount: number | null, weekReservations: unknown[] = []) {
  return {
    data: {
      summary: { waitlist_count: waitlistCount },
      tables: [
        { id: 'one', status: 'Available' },
        { id: 'two', status: 'Available' },
        { id: 'three', status: 'Occupied' },
      ],
      upcoming_reservations: weekReservations,
      active_parties: [],
    },
  };
}

function renderDashboard() {
  return render(<MemoryRouter><Dashboard /></MemoryRouter>);
}

describe('Dashboard first-fold data contract', () => {
  beforeEach(() => {
    state.query = { data: dashboardData(1), isLoading: false, isError: false, refetch: vi.fn() };
  });

  it('shows available tables and exact active waitlist count in Portuguese', () => {
    renderDashboard();

    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('Livres')).toHaveAttribute('aria-label', 'Mesas Disponíveis');
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByTestId('reservations-list')).toHaveAttribute('data-language', 'pt-BR');
    expect(screen.queryByText('Seu painel está pronto!')).not.toBeInTheDocument();
  });

  it('does not call a restaurant empty when it has bookings later this week', () => {
    const threeDaysFromNow = formatLocalDate(new Date(Date.now() + 3 * 86_400_000));
    state.query.data = dashboardData(0, [{ date: threeDaysFromNow, party_size: 2 }]);

    renderDashboard();

    expect(screen.queryByText('Seu painel está pronto!')).not.toBeInTheDocument();
  });

  it('does not claim the queue is empty when its count is unavailable', () => {
    state.query.data = dashboardData(null);
    renderDashboard();

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Seu painel está pronto!')).not.toBeInTheDocument();
  });

  it('shows onboarding guidance only when bookings, parties and queue are all empty', () => {
    state.query.data = dashboardData(0);
    renderDashboard();

    expect(screen.getByText('Seu painel está pronto!')).toBeInTheDocument();
  });
});
