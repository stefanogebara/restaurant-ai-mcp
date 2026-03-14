import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddReservationModal from '../AddReservationModal';

// Mocks
const mockMutate = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: ({ onSuccess, onError }: { onSuccess: () => void; onError: (e: Error) => void }) => {
    mockSuccess.mockImplementation(onSuccess);
    mockError.mockImplementation(onError);
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../services/api', () => ({
  hostAPI: { createReservation: vi.fn() },
}));

vi.mock('../../common/PhoneInput', () => ({
  default: ({ value, onChange, label, required }: { value: string; onChange: (v: string) => void; label: string; required?: boolean }) => (
    <div>
      <label>{label}{required ? ' *' : ''}</label>
      <input
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="+34 612 345 678"
      />
    </div>
  ),
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
};

describe('AddReservationModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AddReservationModal isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog with title when open', () => {
    render(<AddReservationModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Reservation')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(<AddReservationModal {...defaultProps} />);
    expect(screen.getByText(/Guest Name/)).toBeInTheDocument();
    expect(screen.getByText(/^Phone/)).toBeInTheDocument();
    expect(screen.getByText(/^Email$/)).toBeInTheDocument();
    expect(screen.getByText(/^Date/)).toBeInTheDocument();
    expect(screen.getByText(/^Time/)).toBeInTheDocument();
    expect(screen.getByText(/Party Size/)).toBeInTheDocument();
    expect(screen.getByText(/Special Requests/)).toBeInTheDocument();
  });

  it('renders Cancel and Create buttons', () => {
    render(<AddReservationModal {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Create Reservation')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<AddReservationModal {...defaultProps} />);
    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<AddReservationModal {...defaultProps} />);
    // The backdrop is the outermost fixed div
    const backdrop = container.querySelector('.fixed.inset-0');
    if (backdrop) {
      await user.click(backdrop);
      expect(defaultProps.onClose).toHaveBeenCalled();
    }
  });

  it('calls mutate on form submit', async () => {
    const user = userEvent.setup();
    render(<AddReservationModal {...defaultProps} />);

    // Fill required fields
    await user.type(screen.getByPlaceholderText('John Smith'), 'Alice Test');
    await user.type(screen.getByPlaceholderText('+34 612 345 678'), '+1 555-0001');

    // Submit
    await user.click(screen.getByText('Create Reservation'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('has date defaulting to today', () => {
    render(<AddReservationModal {...defaultProps} />);
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe(today);
  });

  it('has time defaulting to 19:00', () => {
    render(<AddReservationModal {...defaultProps} />);
    const timeInput = document.querySelector('input[type="time"]') as HTMLInputElement;
    expect(timeInput.value).toBe('19:00');
  });

  it('has party size defaulting to 2', () => {
    render(<AddReservationModal {...defaultProps} />);
    const sizeInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(sizeInput.value).toBe('2');
  });

  it('shows special requests placeholder', () => {
    render(<AddReservationModal {...defaultProps} />);
    expect(screen.getByPlaceholderText('Birthday celebration, high chair needed...')).toBeInTheDocument();
  });
});
