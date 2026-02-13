import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CheckInModal from '../CheckInModal';
import type { UpcomingReservation, Table } from '../../../types/host.types';

// Mock TableCombinationSelector to simplify testing
vi.mock('../TableCombinationSelector', () => ({
  default: ({
    partySize,
    onSelect,
  }: {
    availableTables: Table[];
    partySize: number;
    onSelect: (ids: string[], numbers: string[]) => void;
    selectedTableIds: string[];
  }) => (
    <div data-testid="table-combination-selector">
      <span>Party of {partySize}</span>
      <button
        onClick={() => onSelect(['table-1'], ['5'])}
        data-testid="select-table-btn"
      >
        Select Table
      </button>
    </div>
  ),
}));

function createReservation(
  overrides: Partial<UpcomingReservation> = {}
): UpcomingReservation {
  return {
    reservation_id: 'res-1',
    customer_name: 'John Doe',
    customer_phone: '+1234567890',
    party_size: 4,
    date: '2026-02-13',
    time: '19:00',
    reservation_time: '7:00 PM',
    special_requests: 'Window seat please',
    checked_in: false,
    ...overrides,
  };
}

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

describe('CheckInModal', () => {
  const defaultProps = {
    isOpen: true,
    reservation: createReservation(),
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    availableTables: [createTable()],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders reservation details when open', () => {
    render(<CheckInModal {...defaultProps} />);
    expect(screen.getByText('Check In Reservation')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('4 guests')).toBeInTheDocument();
    expect(screen.getByText('7:00 PM')).toBeInTheDocument();
    expect(screen.getByText('+1234567890')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<CheckInModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Check In Reservation')).not.toBeInTheDocument();
  });

  it('does not render when reservation is null', () => {
    render(<CheckInModal {...defaultProps} reservation={null} />);
    expect(screen.queryByText('Check In Reservation')).not.toBeInTheDocument();
  });

  it('displays special requests when provided', () => {
    render(<CheckInModal {...defaultProps} />);
    expect(screen.getByText('Special Requests')).toBeInTheDocument();
    expect(screen.getByText('Window seat please')).toBeInTheDocument();
  });

  it('does not display special requests section when not provided', () => {
    const reservation = createReservation({ special_requests: undefined });
    render(<CheckInModal {...defaultProps} reservation={reservation} />);
    expect(screen.queryByText('Special Requests')).not.toBeInTheDocument();
  });

  it('shows the cancel and check-in buttons initially', () => {
    render(<CheckInModal {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Check In & Find Tables')).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<CheckInModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows table selection after clicking Check In & Find Tables', () => {
    render(<CheckInModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Check In & Find Tables'));
    expect(screen.getByTestId('table-combination-selector')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
    expect(screen.getByText('Proceed to Seat')).toBeInTheDocument();
  });

  it('goes back to initial view when Back button is clicked', () => {
    render(<CheckInModal {...defaultProps} />);
    // Move to table selection
    fireEvent.click(screen.getByText('Check In & Find Tables'));
    expect(screen.getByTestId('table-combination-selector')).toBeInTheDocument();
    // Go back
    fireEvent.click(screen.getByText('Back'));
    expect(screen.queryByTestId('table-combination-selector')).not.toBeInTheDocument();
    expect(screen.getByText('Check In & Find Tables')).toBeInTheDocument();
  });

  it('Proceed to Seat is disabled when no tables are selected', () => {
    render(<CheckInModal {...defaultProps} />);
    fireEvent.click(screen.getByText('Check In & Find Tables'));
    const proceedButton = screen.getByText('Proceed to Seat');
    expect(proceedButton).toBeDisabled();
  });

  it('calls onSuccess with correct data when tables are selected and Proceed is clicked', () => {
    const onSuccess = vi.fn();
    render(<CheckInModal {...defaultProps} onSuccess={onSuccess} />);
    // Move to table selection
    fireEvent.click(screen.getByText('Check In & Find Tables'));
    // Select a table via the mocked selector
    fireEvent.click(screen.getByTestId('select-table-btn'));
    // Now proceed
    const proceedButton = screen.getByText('Proceed to Seat');
    expect(proceedButton).not.toBeDisabled();
    fireEvent.click(proceedButton);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({
      type: 'reservation',
      reservation_id: 'res-1',
      customer_name: 'John Doe',
      customer_phone: '+1234567890',
      party_size: 4,
      special_requests: 'Window seat please',
      table_ids: ['table-1'],
      table_numbers: ['5'],
    });
  });

  it('displays the party size from reservation', () => {
    const reservation = createReservation({ party_size: 8 });
    render(<CheckInModal {...defaultProps} reservation={reservation} />);
    expect(screen.getByText('8 guests')).toBeInTheDocument();
  });

  it('displays the reservation time', () => {
    const reservation = createReservation({ reservation_time: '8:30 PM' });
    render(<CheckInModal {...defaultProps} reservation={reservation} />);
    expect(screen.getByText('8:30 PM')).toBeInTheDocument();
  });
});
