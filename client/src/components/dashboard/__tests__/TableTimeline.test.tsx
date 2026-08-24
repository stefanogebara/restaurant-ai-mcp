import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TableTimeline from '../TableTimeline';
import type { Table, ActiveParty, UpcomingReservation } from '../../../types/host.types';

// ---- Test data ----
// Fixed clock: 2026-01-15 19:33 local. seated_at/estimated_departure are
// built from local-time constructors so the test is timezone-independent.
const NOW = new Date(2026, 0, 15, 19, 33);
const localISO = (h: number, m: number) => new Date(2026, 0, 15, h, m).toISOString();

const mkTable = (id: string, num: number): Table =>
  ({ id, table_number: num, capacity: 4, status: 'Occupied' } as unknown as Table);

const tables = [mkTable('t1', 1), mkTable('t2', 2), mkTable('t7', 7)];

const parties: ActiveParty[] = [
  {
    service_id: 's1',
    customer_name: 'Alice Smith',
    customer_phone: '+1',
    party_size: 4,
    tables: ['t1'],
    seated_at: localISO(18, 30),
    estimated_departure: localISO(20, 0),
    time_elapsed_minutes: 63,
    time_remaining_minutes: 27,
    is_overdue: false,
  },
  {
    service_id: 's2',
    customer_name: 'Vera VIP',
    customer_phone: '+1',
    party_size: 5,
    tables: ['t7'],
    seated_at: localISO(19, 30),
    estimated_departure: localISO(21, 30),
    time_elapsed_minutes: 3,
    time_remaining_minutes: 117,
    is_overdue: false,
    is_vip: true,
  },
];

const reservations: UpcomingReservation[] = [
  {
    reservation_id: 'r1',
    customer_name: 'Bob Jones',
    customer_phone: '+1',
    party_size: 2,
    date: '2026-01-15',
    time: '19:45',
    reservation_time: '19:45',
    checked_in: false,
    table_ids: ['t1'], // conflicts: Alice only leaves at 20:00
  },
  {
    reservation_id: 'r2',
    customer_name: 'Carol King',
    customer_phone: '+1',
    party_size: 2,
    date: '2026-01-15',
    time: '21:00',
    reservation_time: '21:00',
    checked_in: true, // checked-in → already covered by an active party bar
    table_ids: ['t2'],
  },
];

describe('TableTimeline', () => {
  it('renders one lane per table with activity', () => {
    render(
      <TableTimeline tables={tables} activeParties={parties} todayReservations={reservations} now={NOW} />,
    );
    expect(screen.getByText('Table 1')).toBeInTheDocument();
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getByText('Alice · 4p')).toBeInTheDocument();
    expect(screen.getByText('Vera · 5p')).toBeInTheDocument();
  });

  it('draws reservations that have not checked in, skips checked-in ones', () => {
    render(
      <TableTimeline tables={tables} activeParties={parties} todayReservations={reservations} now={NOW} />,
    );
    expect(screen.getByText('Bob · 2p')).toBeInTheDocument();
    // Carol checked in — her reservation bar must not render (table 2 has no
    // other activity, so its lane disappears entirely).
    expect(screen.queryByText('Carol · 2p')).not.toBeInTheDocument();
    expect(screen.queryByText('Table 2')).not.toBeInTheDocument();
  });

  it('surfaces the nearest conflict: table still occupied when the reservation arrives', () => {
    render(
      <TableTimeline tables={tables} activeParties={parties} todayReservations={reservations} now={NOW} />,
    );
    // Bob arrives 19:45 at table 1; Alice leaves 20:00 → conflict headline.
    const conflict = screen.getByText(/must be ready at|precisa estar pronta/);
    const paragraph = conflict.closest('p');
    expect(paragraph?.textContent).toContain('19:45');
    expect(paragraph?.textContent).toContain('20:00');
  });

  it('renders nothing when there is no activity', () => {
    const { container } = render(
      <TableTimeline tables={tables} activeParties={[]} todayReservations={[]} now={NOW} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
