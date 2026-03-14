import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CancelReservationDialog from '../CancelReservationDialog';
import type { UpcomingReservation } from '../../../types/host.types';

// Mocks
const mockMutate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutate: mockMutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../services/api', () => ({
  hostAPI: { cancelReservation: vi.fn() },
}));

const reservation: UpcomingReservation = {
  reservation_id: 'res-456',
  customer_name: 'Bob Johnson',
  customer_phone: '+1 555-0002',
  customer_email: 'bob@example.com',
  party_size: 2,
  date: '2026-03-20',
  time: '20:00',
  reservation_time: '2026-03-20T20:00:00Z',
  checked_in: false,
};

const defaultProps = {
  isOpen: true,
  reservation,
  onClose: vi.fn(),
};

describe('CancelReservationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CancelReservationDialog isOpen={false} reservation={reservation} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog with title when open', () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Title appears in h3 and button — use getAllByText
    expect(screen.getAllByText('Cancel Reservation').length).toBeGreaterThanOrEqual(1);
  });

  it('shows confirmation question', () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getByText('Are you sure you want to cancel this reservation?')).toBeInTheDocument();
  });

  it('shows reservation summary with guest name and details', () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText(/2p.*2026-03-20.*20:00/)).toBeInTheDocument();
  });

  it('shows reason dropdown with all options', () => {
    render(<CancelReservationDialog {...defaultProps} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(7); // none + 6 reasons
  });

  it('shows email notification hint when customer has email', () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getByText('The customer will be notified by email.')).toBeInTheDocument();
  });

  it('hides email hint when customer has no email', () => {
    const noEmailRes = { ...reservation, customer_email: undefined };
    render(<CancelReservationDialog {...defaultProps} reservation={noEmailRes} />);
    expect(screen.queryByText('The customer will be notified by email.')).not.toBeInTheDocument();
  });

  it('renders Back and Cancel Reservation buttons', () => {
    render(<CancelReservationDialog {...defaultProps} />);
    expect(screen.getByText('Back')).toBeInTheDocument();
    // The confirm button also says "Cancel Reservation"
    const buttons = screen.getAllByText('Cancel Reservation');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClose when Back is clicked', async () => {
    const user = userEvent.setup();
    render(<CancelReservationDialog {...defaultProps} />);
    await user.click(screen.getByText('Back'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls mutate when cancel confirmation is clicked', async () => {
    const user = userEvent.setup();
    render(<CancelReservationDialog {...defaultProps} />);
    // The red cancel button is the last one
    const cancelButtons = screen.getAllByText('Cancel Reservation');
    const confirmButton = cancelButtons[cancelButtons.length - 1];
    await user.click(confirmButton);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('allows selecting a reason before cancelling', async () => {
    const user = userEvent.setup();
    render(<CancelReservationDialog {...defaultProps} />);
    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'customer_request');
    expect((select as HTMLSelectElement).value).toBe('customer_request');
  });
});
