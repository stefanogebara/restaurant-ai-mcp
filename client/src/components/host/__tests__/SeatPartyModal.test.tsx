import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SeatPartyModal from '../SeatPartyModal';

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

const mockMutate = vi.fn();
const mockReset = vi.fn();

// Track the mutation state we want to simulate
let mutationState = {
  isPending: false,
  isSuccess: false,
  isError: false,
};

vi.mock('../../../hooks/useSeatParty', () => ({
  useSeatParty: () => ({
    mutate: mockMutate,
    reset: mockReset,
    ...mutationState,
  }),
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const sampleData = {
  type: 'reservation' as const,
  reservation_id: 'res-123',
  customer_name: 'Maria Garcia',
  customer_phone: '+34 612 345 678',
  party_size: 4,
  table_ids: ['table-1', 'table-3'],
  table_numbers: ['T1', 'T3'],
  special_requests: 'Window seat preferred',
};

const defaultProps = {
  isOpen: true,
  data: sampleData,
  onClose: vi.fn(),
  onRetryTableSelection: vi.fn(),
};

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('SeatPartyModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationState = {
      isPending: false,
      isSuccess: false,
      isError: false,
    };
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = renderWithProviders(
      <SeatPartyModal {...defaultProps} isOpen={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when data is null', () => {
    const { container } = renderWithProviders(
      <SeatPartyModal {...defaultProps} data={null} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the confirmation dialog with customer details when open', () => {
    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Confirm Seating' })).toBeInTheDocument();
    expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
    expect(screen.getByText('4 guests')).toBeInTheDocument();
    expect(screen.getByText('Table T1, T3')).toBeInTheDocument();
  });

  it('displays special requests when provided', () => {
    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    expect(screen.getByText('Special Requests:')).toBeInTheDocument();
    expect(screen.getByText('Window seat preferred')).toBeInTheDocument();
  });

  it('does not display special requests section when not provided', () => {
    const dataNoRequests = { ...sampleData, special_requests: undefined };
    renderWithProviders(
      <SeatPartyModal {...defaultProps} data={dataNoRequests} />,
    );

    expect(screen.queryByText('Special Requests:')).not.toBeInTheDocument();
  });

  it('shows Cancel and Confirm Seating buttons', () => {
    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm seating/i })).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls seatPartyMutation.mutate with correct request data on confirm', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /confirm seating/i }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      {
        type: 'reservation',
        reservation_id: 'res-123',
        customer_name: 'Maria Garcia',
        customer_phone: '+34 612 345 678',
        party_size: 4,
        table_ids: ['table-1', 'table-3'],
        special_requests: 'Window seat preferred',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('shows "Seating..." text when mutation is pending', () => {
    mutationState = { isPending: true, isSuccess: false, isError: false };

    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    expect(screen.getByRole('button', { name: /seating\.\.\./i })).toBeInTheDocument();
    // Buttons should be disabled while pending
    expect(screen.getByRole('button', { name: /seating\.\.\./i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('shows success state with check mark when mutation succeeds', () => {
    mutationState = { isPending: false, isSuccess: true, isError: false };

    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    expect(screen.getByText('Party Seated Successfully!')).toBeInTheDocument();
    expect(
      screen.getByText(/Maria Garcia has been seated at Table T1, T3/),
    ).toBeInTheDocument();
  });

  it('shows error state with retry option when mutation fails', () => {
    mutationState = { isPending: false, isSuccess: false, isError: true };

    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    expect(screen.getByText('Unable to seat party')).toBeInTheDocument();
    expect(
      screen.getByText(/The selected tables may no longer be available/),
    ).toBeInTheDocument();
  });

  it('calls onRetryTableSelection and resets mutation when retry link is clicked', async () => {
    mutationState = { isPending: false, isSuccess: false, isError: true };
    const user = userEvent.setup();

    renderWithProviders(<SeatPartyModal {...defaultProps} />);

    const retryLink = screen.getByText(/Select Different Tables/i);
    await user.click(retryLink);

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(defaultProps.onRetryTableSelection).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when retry is clicked but onRetryTableSelection is not provided', async () => {
    mutationState = { isPending: false, isSuccess: false, isError: true };
    const user = userEvent.setup();

    renderWithProviders(
      <SeatPartyModal
        isOpen={true}
        data={sampleData}
        onClose={defaultProps.onClose}
      />,
    );

    const retryLink = screen.getByText(/Select Different Tables/i);
    await user.click(retryLink);

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
