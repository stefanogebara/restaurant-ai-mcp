import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReservationsList from '../ReservationsList';
import type { UpcomingReservation } from '../../../types/host.types';

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
    // Count shown in parenthetical
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('shows check-in button for unchecked reservations', () => {
    render(<ReservationsList {...defaultProps} />);
    const checkInButtons = screen.getAllByRole('button', { name: /check in/i });
    expect(checkInButtons).toHaveLength(1); // Only Alice (Bob is already checked in)
  });

  it('shows "Seated" badge for checked-in reservations', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByText('Seated')).toBeInTheDocument();
  });

  it('calls onCheckIn when Check In button is clicked', async () => {
    const user = userEvent.setup();
    const onCheckIn = vi.fn();
    render(<ReservationsList {...defaultProps} onCheckIn={onCheckIn} />);

    await user.click(screen.getByRole('button', { name: /check in/i }));
    expect(onCheckIn).toHaveBeenCalledTimes(1);
    expect(onCheckIn).toHaveBeenCalledWith(todayReservations[0]);
  });

  it('displays special requests when present', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByText('Window seat please')).toBeInTheDocument();
  });

  it('displays party size for each reservation', () => {
    render(<ReservationsList {...defaultProps} />);
    expect(screen.getByText('4p')).toBeInTheDocument();
    expect(screen.getByText('2p')).toBeInTheDocument();
  });

  it('toggles to tomorrow reservations when button is clicked', async () => {
    const user = userEvent.setup();
    render(<ReservationsList {...defaultProps} />);

    // Click "Tomorrow" toggle
    await user.click(screen.getByRole('button', { name: /tomorrow/i }));

    // Should now show tomorrow's reservations
    expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    expect(screen.getByText('6p')).toBeInTheDocument();
    expect(screen.getByText('(Tomorrow)')).toBeInTheDocument();

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
    render(<ReservationsList {...defaultProps} language="es" />);
    expect(screen.getByText('Próximas Reservas')).toBeInTheDocument();
    expect(screen.getByText('4p')).toBeInTheDocument();
  });

  it('shows high-risk badges for risky reservations', () => {
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
    expect(screen.getByText('HIGH RISK')).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: /take action/i }));
    expect(onIntervention).toHaveBeenCalledTimes(1);
  });
});
