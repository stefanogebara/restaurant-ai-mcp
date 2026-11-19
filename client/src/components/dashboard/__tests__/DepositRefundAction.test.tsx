import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import CancelledReservationDeposits from '../CancelledReservationDeposits';
import DepositBadge from '../DepositBadge';
import DepositRefundAction from '../DepositRefundAction';

const apiPost = vi.fn();
let role = 'owner';
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ role }) }));
vi.mock('../../../services/api', () => ({ api: { post: (...args: unknown[]) => apiPost(...args) } }));

beforeEach(() => {
  role = 'owner';
  apiPost.mockReset();
});

it('requires confirmation before refunding', async () => {
  apiPost.mockResolvedValue({ data: { state: 'refunded' } });
  const reload = vi.fn();
  render(<DepositRefundAction reservationId="RES-1" onActionComplete={reload} />);

  fireEvent.click(screen.getByRole('button', { name: 'Refund deposit' }));
  expect(apiPost).not.toHaveBeenCalled();
  const dialog = screen.getByRole('dialog', { name: 'Refund the captured deposit?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Refund deposit' }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(apiPost).toHaveBeenCalledOnce();
  expect(apiPost).toHaveBeenCalledWith('/refund-deposit', { reservation_id: 'RES-1' });
});

it('shows a pending refund without marking the deposit refunded', async () => {
  apiPost.mockResolvedValue({ data: { state: 'pending' } });
  render(<DepositRefundAction reservationId="RES-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Refund deposit' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refund deposit' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Stripe is processing the refund.');
});

it('hides the refund action from a manager', () => {
  role = 'manager';
  render(<DepositRefundAction reservationId="RES-1" />);
  expect(screen.queryByRole('button', { name: 'Refund deposit' })).not.toBeInTheDocument();
});

it('hides refund when the server rejects a stale owner session', async () => {
  apiPost.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { code: 'owner_required' } } });
  const refresh = vi.fn();
  render(<DepositRefundAction reservationId="RES-1" onActionComplete={refresh} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refund deposit' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refund deposit' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Only the restaurant owner can charge or refund deposits.');
  expect(screen.queryByRole('button', { name: 'Refund deposit' })).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});

it('distinguishes a released hold, a full refund and a partial refund', () => {
  const { rerender } = render(<DepositBadge amount={null} currency="eur" held={false} />);
  expect(screen.queryByText(/captured|refunded/)).not.toBeInTheDocument();

  rerender(<DepositBadge amount={25} refundedAmount={25} currency="eur" held={false} />);
  expect(screen.getByText('€25.00 refunded')).toBeInTheDocument();
  expect(screen.queryByText(/captured/)).not.toBeInTheDocument();

  rerender(<DepositBadge amount={25} refundedAmount={10} currency="eur" held={false} />);
  expect(screen.getByText('€25.00 captured · €10.00 refunded')).toBeInTheDocument();
});

it('shows cancelled holds and captured balances with the refund action on the captured row', async () => {
  apiPost.mockResolvedValue({ data: { state: 'refunded' } });
  const refresh = vi.fn();
  const booking = { date: '2026-03-20', time: '19:00', deposit_currency: 'eur' };
  const pending = {
    ...booking, reservation_id: 'PENDING', customer_name: 'Pending guest',
    deposit_release_pending: true, deposit_outstanding_amount: null,
  };
  const captured = {
    ...booking, reservation_id: 'CAPTURED', customer_name: 'Captured guest',
    deposit_release_pending: false, deposit_outstanding_amount: 15,
  };
  const { rerender } = render(<CancelledReservationDeposits deposits={[pending, captured]} onDepositAction={refresh} />);

  const section = screen.getByRole('region', { name: 'Deposits on canceled reservations' });
  const [pendingRow, capturedRow] = within(section).getAllByRole('listitem');
  expect(within(pendingRow).getByText('Card hold release pending')).toBeVisible();
  expect(within(pendingRow).queryByRole('button', { name: 'Refund deposit' })).not.toBeInTheDocument();
  expect(within(capturedRow).getByText('Captured deposit · €15.00 remaining')).toBeVisible();
  fireEvent.click(within(capturedRow).getByRole('button', { name: 'Refund deposit' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refund deposit' }));

  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(apiPost).toHaveBeenCalledExactlyOnceWith('/refund-deposit', { reservation_id: 'CAPTURED' });
  expect(within(section).queryByText('Captured guest')).not.toBeInTheDocument();
  expect(within(section).getByText('Pending guest')).toBeVisible();
  rerender(<CancelledReservationDeposits deposits={[]} onDepositAction={refresh} />);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(screen.getByText('Refund confirmed.')).toBeVisible();
});

it('marks a failed cancelled deposit lookup separately from an empty result', () => {
  const { rerender } = render(<CancelledReservationDeposits deposits={null} onDepositAction={vi.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Could not load deposits on canceled reservations.');

  rerender(<CancelledReservationDeposits deposits={[]} onDepositAction={vi.fn()} />);
  expect(screen.queryByRole('region', { name: 'Deposits on canceled reservations' })).not.toBeInTheDocument();
});
