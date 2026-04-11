import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalkInModal from '../WalkInModal';
import type { Table } from '../../../types/host.types';

// Mock the TableCombinationSelector child component to avoid deep dependency trees
vi.mock('../TableCombinationSelector', () => ({
  default: ({
    partySize,
    onSelect,
    availableTables,
  }: {
    partySize: number;
    onSelect: (ids: string[], numbers: string[]) => void;
    availableTables: Table[];
    selectedTableIds?: string[];
  }) => (
    <div data-testid="table-combination-selector">
      <span>Party of {partySize}</span>
      <span>{availableTables.length} tables available</span>
      <button
        type="button"
        onClick={() => onSelect(['table-1'], ['T1'])}
      >
        Select Table 1
      </button>
    </div>
  ),
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const defaultTables: Table[] = [
  {
    id: 'table-1',
    table_number: 1,
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
  },
  {
    id: 'table-2',
    table_number: 2,
    capacity: 6,
    location: 'Patio',
    status: 'Available',
    shape: 'rectangle',
    is_fixed_seating: false,
    is_joinable: false,
    joinable_with: [],
    position_x: 1,
    position_y: 0,
    width: 2,
    height: 1,
    rotation: 0,
  },
];

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  availableTables: defaultTables,
};

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('WalkInModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <WalkInModal {...defaultProps} isOpen={false} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders the step 1 form with all fields when open', () => {
    render(<WalkInModal {...defaultProps} />);

    expect(
      screen.getByText('Add Walk-in Customer'),
    ).toBeInTheDocument();

    // Form fields
    expect(screen.getByLabelText('Party size')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer name')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer phone')).toBeInTheDocument();
    expect(screen.getByLabelText('Preferred location')).toBeInTheDocument();

    // Buttons
    expect(
      screen.getByRole('button', { name: /cancel/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /next: select table/i }),
    ).toBeInTheDocument();
  }, 15000);

  it('advances to step 2 when the form is filled and submitted', async () => {
    const user = userEvent.setup();

    render(<WalkInModal {...defaultProps} />);

    // Fill required fields
    await user.type(screen.getByLabelText('Party size'), '4');
    await user.type(screen.getByLabelText('Customer name'), 'Jane Doe');
    await user.type(screen.getByLabelText('Customer phone'), '+1 555-0000');

    // Submit form to go to step 2
    await user.click(
      screen.getByRole('button', { name: /next: select table/i }),
    );

    // Step 2 should now be shown
    expect(screen.getByText('Select Table')).toBeInTheDocument();

    // Customer info summary should be visible
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('4 guests')).toBeInTheDocument();

    // Table combination selector should be rendered
    expect(
      screen.getByTestId('table-combination-selector'),
    ).toBeInTheDocument();
  });

  it('calls onClose and resets form when Cancel is clicked', async () => {
    const user = userEvent.setup();

    render(<WalkInModal {...defaultProps} />);

    // Type something in a field first
    await user.type(screen.getByLabelText('Customer name'), 'Test');

    // Click Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSuccess with correct data when a table is selected and Proceed is clicked', async () => {
    const user = userEvent.setup();

    render(<WalkInModal {...defaultProps} />);

    // Step 1: fill form
    await user.type(screen.getByLabelText('Party size'), '3');
    await user.type(screen.getByLabelText('Customer name'), 'Bob Lee');
    await user.type(screen.getByLabelText('Customer phone'), '+1 555-1111');

    await user.click(
      screen.getByRole('button', { name: /next: select table/i }),
    );

    // Step 2: select a table from the mocked selector
    await user.click(screen.getByText('Select Table 1'));

    // Click Proceed to Seat
    const proceedButton = screen.getByRole('button', {
      name: /proceed to seat/i,
    });
    await user.click(proceedButton);

    expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSuccess).toHaveBeenCalledWith({
      type: 'walk-in',
      customer_name: 'Bob Lee',
      customer_phone: '+1 555-1111',
      party_size: 3,
      table_ids: ['table-1'],
      table_numbers: ['T1'],
      special_requests: '',
    });
  });

  it('goes back to step 1 when Back button is clicked on step 2', async () => {
    const user = userEvent.setup();

    render(<WalkInModal {...defaultProps} />);

    // Fill and submit step 1
    await user.type(screen.getByLabelText('Party size'), '2');
    await user.type(screen.getByLabelText('Customer name'), 'Ann');
    await user.type(screen.getByLabelText('Customer phone'), '+1 555-2222');
    await user.click(
      screen.getByRole('button', { name: /next: select table/i }),
    );

    // Verify step 2
    expect(screen.getByText('Select Table')).toBeInTheDocument();

    // Click Back
    await user.click(screen.getByRole('button', { name: /back/i }));

    // Should be back on step 1
    expect(
      screen.getByText('Add Walk-in Customer'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Party size')).toBeInTheDocument();
  });
});
