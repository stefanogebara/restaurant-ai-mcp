import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TableCard from '../TableCard';
import type { Table } from '../../../types/host.types';

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

// Mock TableActionMenu to avoid importing its complex dependencies
vi.mock('../TableActionMenu', () => ({
  default: ({ table, onClose }: { table: Table; onClose: () => void }) => (
    <div data-testid="table-action-menu">
      <span>Menu for Table {table.table_number}</span>
      <button onClick={onClose}>Close Menu</button>
    </div>
  ),
}));

// Mock ThiingsIcon to render a simple element
vi.mock('../../common/ThiingsIcon', () => ({
  default: ({ name }: { name: string }) => (
    <span data-testid={`icon-${name}`}>{name}</span>
  ),
}));

function createTable(overrides: Partial<Table> = {}): Table {
  return {
    id: 'table-1',
    table_number: '5',
    capacity: 4,
    location: 'Main Floor',
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
  };
}

describe('TableCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the table number', () => {
    render(<TableCard table={createTable({ table_number: '12' })} />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('displays the capacity with seats label', () => {
    render(<TableCard table={createTable({ capacity: 6 })} />);
    expect(screen.getByText('6 seats')).toBeInTheDocument();
  });

  it('displays the location', () => {
    render(<TableCard table={createTable({ location: 'Terrace' })} />);
    expect(screen.getByText('Terrace')).toBeInTheDocument();
  });

  it('shows Available status', () => {
    render(<TableCard table={createTable({ status: 'Available' })} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('shows Occupied status', () => {
    render(<TableCard table={createTable({ status: 'Occupied' })} />);
    expect(screen.getByText('Occupied')).toBeInTheDocument();
  });

  it('shows Reserved status', () => {
    render(<TableCard table={createTable({ status: 'Reserved' })} />);
    expect(screen.getByText('Reserved')).toBeInTheDocument();
  });

  it('shows Being Cleaned status', () => {
    render(<TableCard table={createTable({ status: 'Being Cleaned' })} />);
    expect(screen.getByText('Being Cleaned')).toBeInTheDocument();
  });

  it('renders the correct status icon for Available', () => {
    render(<TableCard table={createTable({ status: 'Available' })} />);
    expect(screen.getByTestId('icon-check')).toBeInTheDocument();
  });

  it('renders the correct status icon for Occupied', () => {
    render(<TableCard table={createTable({ status: 'Occupied' })} />);
    expect(screen.getByTestId('icon-user')).toBeInTheDocument();
  });

  it('renders the correct status icon for Reserved', () => {
    render(<TableCard table={createTable({ status: 'Reserved' })} />);
    expect(screen.getByTestId('icon-clock')).toBeInTheDocument();
  });

  it('renders the correct status icon for Being Cleaned', () => {
    render(<TableCard table={createTable({ status: 'Being Cleaned' })} />);
    expect(screen.getByTestId('icon-sparkles')).toBeInTheDocument();
  });

  it('calls onClick when provided and card is clicked', () => {
    const handleClick = vi.fn();
    render(<TableCard table={createTable()} onClick={handleClick} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows action menu when clicked without onClick handler', () => {
    render(<TableCard table={createTable()} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByTestId('table-action-menu')).toBeInTheDocument();
    expect(screen.getByText('Menu for Table 5')).toBeInTheDocument();
  });

  it('does not show action menu initially', () => {
    render(<TableCard table={createTable()} />);
    expect(screen.queryByTestId('table-action-menu')).not.toBeInTheDocument();
  });

  it('shows "Tap to manage" hint text', () => {
    render(<TableCard table={createTable()} />);
    expect(screen.getByText('Tap to manage')).toBeInTheDocument();
  });
});
