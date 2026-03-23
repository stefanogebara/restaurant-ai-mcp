import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditReservationModal from '../EditReservationModal';
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
  hostAPI: { modifyReservation: vi.fn() },
}));

// Use a future date to avoid HTML5 min-date validation blocking form submit
const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0];

const reservation: UpcomingReservation = {
  reservation_id: 'res-123',
  customer_name: 'Alice Smith',
  customer_phone: '+1 555-0001',
  party_size: 4,
  date: futureDate,
  time: '19:30',
  reservation_time: `${futureDate}T19:30:00Z`,
  checked_in: false,
  special_requests: 'Window seat',
};

const defaultProps = {
  isOpen: true,
  reservation,
  onClose: vi.fn(),
};

describe('EditReservationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <EditReservationModal isOpen={false} reservation={reservation} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog with title when open', () => {
    render(<EditReservationModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Reservation')).toBeInTheDocument();
  });

  it('shows guest name as read-only', () => {
    render(<EditReservationModal {...defaultProps} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('shows confirmation ID as read-only', () => {
    render(<EditReservationModal {...defaultProps} />);
    expect(screen.getByText('res-123')).toBeInTheDocument();
  });

  it('pre-fills date and time from reservation', () => {
    render(<EditReservationModal {...defaultProps} />);
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(dateInput.value).toBe(futureDate);
    expect(timeInput.value).toBe('19:30');
  });

  it('pre-fills party size from reservation', () => {
    render(<EditReservationModal {...defaultProps} />);
    const sizeInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(sizeInput.value).toBe('4');
  });

  it('pre-fills special requests from reservation', () => {
    render(<EditReservationModal {...defaultProps} />);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Window seat');
  });

  it('renders Cancel and Save buttons', () => {
    render(<EditReservationModal {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<EditReservationModal {...defaultProps} />);
    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls mutate on form submit', async () => {
    const user = userEvent.setup();
    render(<EditReservationModal {...defaultProps} />);
    await user.click(screen.getByText('Save Changes'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
});
