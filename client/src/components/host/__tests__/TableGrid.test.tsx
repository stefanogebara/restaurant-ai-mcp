import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TableGrid from '../TableGrid';
import type { Table } from '../../../types/host.types';

// Mock the TableCard child component to avoid deep dependency trees (dnd-kit, etc.)
vi.mock('../TableCard', () => ({
  default: ({ table, onClick }: { table: Table; onClick?: () => void }) => (
    <button
      data-testid={`table-card-${table.id}`}
      onClick={onClick}
    >
      <span data-testid={`table-number-${table.id}`}>{table.table_number}</span>
      <span data-testid={`table-status-${table.id}`}>{table.status}</span>
      <span data-testid={`table-capacity-${table.id}`}>{table.capacity} seats</span>
      <span data-testid={`table-location-${table.id}`}>{table.location}</span>
    </button>
  ),
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const makeTable = (overrides: Partial<Table> = {}): Table => ({
  id: 'table-1',
  table_number: 'T1',
  capacity: 4,
  location: 'Main Room',
  status: 'Available',
  shape: 'square',
  is_fixed_seating: false,
  is_joinable: false,
  joinable_with: [],
  position_x: 0,
  position_y: 0,
  width: 1,
  height: 1,
  rotation: 0,
  ...overrides,
});

const sampleTables: Table[] = [
  makeTable({ id: 'table-1', table_number: 'T1', location: 'Main Room', status: 'Available' }),
  makeTable({ id: 'table-2', table_number: 'T2', location: 'Main Room', status: 'Occupied', capacity: 6 }),
  makeTable({ id: 'table-3', table_number: 'T3', location: 'Patio', status: 'Reserved', capacity: 2 }),
  makeTable({ id: 'table-4', table_number: 'T4', location: 'Patio', status: 'Being Cleaned', capacity: 8 }),
];

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('TableGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the empty state when tables array is empty', () => {
    render(<TableGrid tables={[]} />);

    expect(screen.getByText('No tables configured yet')).toBeInTheDocument();
    expect(screen.getByText('Tables will appear here after onboarding')).toBeInTheDocument();
  });

  it('renders the empty state when tables is undefined-like (empty array)', () => {
    render(<TableGrid tables={[]} />);

    expect(screen.getByText('No tables configured yet')).toBeInTheDocument();
  });

  it('renders all tables from the provided array', () => {
    render(<TableGrid tables={sampleTables} />);

    expect(screen.getByTestId('table-card-table-1')).toBeInTheDocument();
    expect(screen.getByTestId('table-card-table-2')).toBeInTheDocument();
    expect(screen.getByTestId('table-card-table-3')).toBeInTheDocument();
    expect(screen.getByTestId('table-card-table-4')).toBeInTheDocument();
  });

  it('groups tables by location and renders location headers', () => {
    render(<TableGrid tables={sampleTables} />);

    // Location header spans exist in the document
    const mainRoomEls = screen.getAllByText('Main Room');
    const patioEls = screen.getAllByText('Patio');
    expect(mainRoomEls.length).toBeGreaterThan(0);
    expect(patioEls.length).toBeGreaterThan(0);
  });

  it('displays correct status for each table via TableCard', () => {
    render(<TableGrid tables={sampleTables} />);

    expect(screen.getByTestId('table-status-table-1')).toHaveTextContent('Available');
    expect(screen.getByTestId('table-status-table-2')).toHaveTextContent('Occupied');
    expect(screen.getByTestId('table-status-table-3')).toHaveTextContent('Reserved');
    expect(screen.getByTestId('table-status-table-4')).toHaveTextContent('Being Cleaned');
  });

  it('displays correct table numbers', () => {
    render(<TableGrid tables={sampleTables} />);

    expect(screen.getByTestId('table-number-table-1')).toHaveTextContent('T1');
    expect(screen.getByTestId('table-number-table-2')).toHaveTextContent('T2');
    expect(screen.getByTestId('table-number-table-3')).toHaveTextContent('T3');
    expect(screen.getByTestId('table-number-table-4')).toHaveTextContent('T4');
  });

  it('calls onTableClick with the correct table when a table is clicked', async () => {
    const user = userEvent.setup();
    const onTableClick = vi.fn();

    render(<TableGrid tables={sampleTables} onTableClick={onTableClick} />);

    await user.click(screen.getByTestId('table-card-table-2'));

    expect(onTableClick).toHaveBeenCalledTimes(1);
    expect(onTableClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'table-2', table_number: 'T2', status: 'Occupied' }),
    );
  });

  it('uses "Unassigned" as location header when table has no location', () => {
    const tablesNoLocation: Table[] = [
      makeTable({ id: 'table-x', table_number: 'TX', location: '' }),
    ];

    render(<TableGrid tables={tablesNoLocation} />);

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('renders tables without onTableClick (onClick is undefined on cards)', async () => {
    const user = userEvent.setup();

    render(<TableGrid tables={[sampleTables[0]]} />);

    // The card should render but clicking should not throw
    const card = screen.getByTestId('table-card-table-1');
    await user.click(card);

    // No error thrown - test passes
    expect(card).toBeInTheDocument();
  });
});
