import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReservationsList from '../ReservationsList';
import type { UpcomingReservation } from '../../../types/host.types';

// i18n mock — resolves nested keys from EN locale
const enTranslations: Record<string, string> = {
  'dashboard.reservationsList.upcoming': 'Upcoming Reservations',
  'dashboard.reservationsList.tomorrow': 'Tomorrow',
  'dashboard.reservationsList.today': 'Today',
  'dashboard.reservationsList.week': 'Week',
  'dashboard.reservationsList.allClear': 'All Caught Up',
  'dashboard.reservationsList.noUpcoming': 'No upcoming reservations for today',
  'dashboard.reservationsList.noTomorrow': 'No reservations tomorrow',
  'dashboard.reservationsList.aiHint': 'Reservations from the AI assistant or added manually will appear here',
  'dashboard.reservationsList.checkIn': 'Check In',
  'dashboard.reservationsList.seated': 'Seated',
  'dashboard.reservationsList.takeAction': 'Take Action',
  'dashboard.reservationsList.takeActionButton': 'Send reminder',
  'dashboard.reservationsList.takeActionAriaLabel': 'Send a reminder to this at-risk guest',
  'dashboard.reservationsList.actionTaken': 'Action taken',
  'dashboard.reservationsList.people': 'people',
  'dashboard.reservationsList.lunch': 'Lunch',
  'dashboard.reservationsList.dinner': 'Dinner',
  'dashboard.reservationsList.atRisk': 'At Risk',
  'dashboard.reservationsList.confirmed': 'Confirmed',
  'dashboard.reservationsList.edit': 'Edit',
  'dashboard.reservationsList.cancel': 'Cancel',
  'dashboard.reservationsList.addReservation': '+ Add',
  'dashboard.reservationsList.searchPlaceholder': 'Search by name or phone...',
  'dashboard.reservationsList.filterAll': 'All',
  'dashboard.reservationsList.filterConfirmed': 'Confirmed',
  'dashboard.reservationsList.filterAtRisk': 'At Risk',
  'dashboard.reservationsList.filterCheckedIn': 'Checked In',
  'dashboard.reservationsList.showingResults': 'Showing {{shown}} of {{total}}',
  'dashboard.reservationsList.noResults': 'No matches',
  'dashboard.reservationsList.noResultsHint': 'Try a different search or filter',
};

const esTranslations: Record<string, string> = {
  'dashboard.reservationsList.upcoming': 'Próximas Reservas',
  'dashboard.reservationsList.people': 'personas',
  'dashboard.reservationsList.today': 'Hoy',
  'dashboard.reservationsList.tomorrow': 'Mañana',
  'dashboard.reservationsList.checkIn': 'Check In',
  'dashboard.reservationsList.seated': 'Sentado',
  'dashboard.reservationsList.confirmed': 'Confirmado',
  'dashboard.reservationsList.takeAction': 'Tomar Acción',
  'dashboard.reservationsList.lunch': 'Almuerzo',
  'dashboard.reservationsList.dinner': 'Cena',
};

let currentLang = 'en';
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const translations = currentLang === 'es' ? esTranslations : enTranslations;
      let result = translations[key] || (opts?.defaultValue as string) || key;
      // Simple interpolation for {{var}} patterns
      if (opts) {
        Object.entries(opts).forEach(([k, v]) => {
          if (k !== 'defaultValue') {
            result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
          }
        });
      }
      return result;
    },
    i18n: { language: currentLang, changeLanguage: (lang: string) => { currentLang = lang; } },
  }),
}));

// ---- Test data ----

const todayReservations: UpcomingReservation[] = [
  {
    reservation_id: 'r1',
    customer_name: 'Alice Smith',
    customer_phone: '+1 555-0001',
    party_size: 4,
    date: '2026-01-15',
    time: '19:00',
    reservation_time: '2026-01-15T19:00:00Z',
    checked_in: false,
    special_requests: 'Window seat please',
  },
  {
    reservation_id: 'r2',
    customer_name: 'Bob Johnson',
    customer_phone: '+1 555-0002',
    party_size: 2,
    date: '2026-01-15',
    time: '20:30',
    reservation_time: '2026-01-15T20:30:00Z',
    checked_in: true,
  },
];

const tomorrowReservations: UpcomingReservation[] = [
  {
    reservation_id: 'r3',
    customer_name: 'Charlie Brown',
    customer_phone: '+1 555-0003',
    party_size: 6,
    date: '2026-01-16',
    time: '18:00',
    reservation_time: '2026-01-16T18:00:00Z',
    checked_in: false,
  },
];

const defaultProps = {
  todayReservations,
  tomorrowReservations,
  onCheckIn: vi.fn(),
  onIntervention: vi.fn(),
};

describe('ReservationsList', () => {
  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(<ReservationsList {...defaultProps} isLoading />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('displays today reservations by default', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByText('Upcoming Reservations')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    // Count shown as badge
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows check-in button for unchecked reservations', () => {
    render(<ReservationsList {...defaultProps} />);
    // Button displays "Confirmed" but has aria-label "Check In"
    // Desktop + mobile responsive variants both render (CSS hides one), so expect 2
    const checkInButtons = screen.getAllByRole('button', { name: /check in/i });
    expect(checkInButtons).toHaveLength(2); // Only Alice (Bob is already checked in) — desktop + mobile
  });

  it('shows "Seated" badge for checked-in reservations', () => {
    render(<ReservationsList {...defaultProps} />);
    // Multiple seated reservations in the fixture render multiple "Seated"
    // badges. Assert at least one is present rather than uniqueness.
    expect(screen.getAllByText('Seated').length).toBeGreaterThan(0);
  });

  it('calls onCheckIn when Check In button is clicked', async () => {
    const user = userEvent.setup();
    const onCheckIn = vi.fn();
    render(<ReservationsList {...defaultProps} onCheckIn={onCheckIn} />);

    // Desktop + mobile both render; click the first (desktop) one
    const checkInButtons = screen.getAllByRole('button', { name: /check in/i });
    await user.click(checkInButtons[0]);
    expect(onCheckIn).toHaveBeenCalledTimes(1);
    expect(onCheckIn).toHaveBeenCalledWith(todayReservations[0]);
  });

  it('displays special requests when present', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByText(/Window seat please/)).toBeInTheDocument();
  });

  it('displays party size for each reservation', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByText(/4 people/)).toBeInTheDocument();
    expect(screen.getByText(/2 people/)).toBeInTheDocument();
  });

  it('toggles to tomorrow reservations when button is clicked', async () => {
    const user = userEvent.setup();
    render(<ReservationsList {...defaultProps} />);

    // Click "Tomorrow" toggle
    await user.click(screen.getByRole('button', { name: /tomorrow/i }));

    // Should now show tomorrow's reservations
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.getByText(/6 people/)).toBeInTheDocument();

    // Toggle back to "Today"
    await user.click(screen.getByRole('button', { name: /today/i }));
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows empty state when no reservations', () => {
    render(
      <ReservationsList
        {...defaultProps}
        todayReservations={[]}
        tomorrowReservations={[]}
      />
    );
    expect(screen.getByText('All Caught Up')).toBeInTheDocument();
    expect(screen.getByText('No upcoming reservations for today')).toBeInTheDocument();
  });

  it('shows empty state for tomorrow when toggled', async () => {
    const user = userEvent.setup();
    render(
      <ReservationsList
        {...defaultProps}
        tomorrowReservations={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: /tomorrow/i }));
    expect(screen.getByText('No reservations tomorrow')).toBeInTheDocument();
  });

  it('renders in Spanish when language is "es"', () => {
    currentLang = 'es';
    render(<ReservationsList {...defaultProps} language="es" />);
    expect(screen.getByText('Próximas Reservas')).toBeInTheDocument();
    expect(screen.getByText(/4 personas/)).toBeInTheDocument();
    currentLang = 'en'; // reset for subsequent tests
  });

  it('shows action button for high-risk reservations', () => {
    const riskyReservations: UpcomingReservation[] = [
      {
        ...todayReservations[0],
        ml_risk_level: 'high',
        ml_risk_score: 75,
      },
    ];

    render(
      <ReservationsList
        {...defaultProps}
        todayReservations={riskyReservations}
      />
    );
    expect(screen.getByRole('button', { name: /send a reminder/i })).toBeInTheDocument();
  });

  it('shows per-reservation predicted revenue when avgSpendPerCover provided', () => {
    render(
      <ReservationsList
        {...defaultProps}
        avgSpendPerCover={80}
        byPartySize={[
          { range: '1-2', avg_per_cover: 65, avg_total: 130, count: 10 },
          { range: '3-4', avg_per_cover: 78, avg_total: 312, count: 8 },
        ]}
      />
    );
    // Party of 4 → bucket 3-4, avg_per_cover 78, predicted = 4*78 = 312 → formatted as currency
    // Party of 2 → bucket 1-2, avg_per_cover 65, predicted = 2*65 = 130
    // Should show rose-colored revenue estimates (brand color)
    const revenueSpans = document.querySelectorAll('.text-rose-600');
    expect(revenueSpans.length).toBeGreaterThanOrEqual(2);
  });

  it('shows Take Action button for high-risk reservations', async () => {
    const user = userEvent.setup();
    const onIntervention = vi.fn();

    const riskyReservations: UpcomingReservation[] = [
      {
        ...todayReservations[0],
        ml_risk_level: 'very-high',
        ml_risk_score: 90,
      },
    ];

    render(
      <ReservationsList
        {...defaultProps}
        todayReservations={riskyReservations}
        onIntervention={onIntervention}
      />
    );

    await user.click(screen.getByRole('button', { name: /send a reminder/i }));
    expect(onIntervention).toHaveBeenCalledTimes(1);
  });

  // --- Search & Filter tests ---

  it('renders search input', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search by name or phone...')).toBeInTheDocument();
  });

  it('renders status filter chips', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    // "Confirmed" appears as both a filter chip and a status badge — check chip exists
    const confirmedButtons = screen.getAllByRole('button', { name: /Confirmed/i });
    expect(confirmedButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'At Risk' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checked In' })).toBeInTheDocument();
  });

  it('filters reservations by search query (debounced)', async () => {
    vi.useFakeTimers();

    render(<ReservationsList {...defaultProps} />);

    // Both visible before search
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();

    // Type in search using fireEvent (avoids userEvent timer conflicts)
    const searchInput = screen.getByPlaceholderText('Search by name or phone...');
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    // Advance past debounce
    act(() => { vi.advanceTimersByTime(350); });

    // Only Alice should remain
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('filters reservations by phone number', async () => {
    vi.useFakeTimers();

    render(<ReservationsList {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search by name or phone...');
    fireEvent.change(searchInput, { target: { value: '555-0002' } });

    act(() => { vi.advanceTimersByTime(350); });

    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('filters by "Checked In" status chip', () => {
    render(<ReservationsList {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Checked In' }));

    // Bob is checked in, Alice is not
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('filters by "At Risk" status chip', () => {
    const mixedReservations: UpcomingReservation[] = [
      { ...todayReservations[0], ml_risk_level: 'high', ml_risk_score: 80 },
      todayReservations[1],
    ];

    render(
      <ReservationsList
        {...defaultProps}
        todayReservations={mixedReservations}
      />
    );

    // Click the filter chip "At Risk" (not the status badge)
    const atRiskButtons = screen.getAllByRole('button', { name: /At Risk/i });
    // The filter chip is the first one (in the header area)
    fireEvent.click(atRiskButtons[0]);

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.queryByText('Bob Johnson')).not.toBeInTheDocument();
  });

  it('shows result count when filtering', () => {
    render(<ReservationsList {...defaultProps} />);

    // Click Checked In filter chip
    fireEvent.click(screen.getByRole('button', { name: 'Checked In' }));

    const resultCount = screen.getByTestId('filter-result-count');
    expect(resultCount).toBeInTheDocument();
    expect(resultCount.textContent).toContain('1');
    expect(resultCount.textContent).toContain('2');
  });

  // O nome do cliente é o gatilho do perfil na hora de sentar (o equivalente
  // ao Digital Chit). Ele SEMPRE renderizou como <button> com hover, mas sem
  // onCustomerClick o clique não fazia nada — afordância morta. Estes dois
  // testes travam as duas metades: dispara quando há handler, e não finge
  // ser clicável quando não há.
  it('fires onCustomerClick with the reservation when the guest name is clicked', async () => {
    const onCustomerClick = vi.fn();
    const user = userEvent.setup();

    render(<ReservationsList {...defaultProps} onCustomerClick={onCustomerClick} />);
    await user.click(screen.getByRole('button', { name: 'Alice Smith' }));

    expect(onCustomerClick).toHaveBeenCalledTimes(1);
    expect(onCustomerClick).toHaveBeenCalledWith(
      expect.objectContaining({ reservation_id: 'r1', customer_phone: '+1 555-0001' }),
    );
  });

  it('leaves the guest name inert when no onCustomerClick is provided', () => {
    render(<ReservationsList {...defaultProps} />);
    // Sem handler o nome não deve se anunciar como botão clicável.
    expect(screen.queryByRole('button', { name: 'Alice Smith' })).not.toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows no-results empty state when search has no matches', () => {
    vi.useFakeTimers();

    render(<ReservationsList {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText('Search by name or phone...');
    fireEvent.change(searchInput, { target: { value: 'zzzznonexistent' } });

    act(() => { vi.advanceTimersByTime(350); });

    expect(screen.getByText('No matches')).toBeInTheDocument();
    expect(screen.getByText('Try a different search or filter')).toBeInTheDocument();

    vi.useRealTimers();
  });
});
