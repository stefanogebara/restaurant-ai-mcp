import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
import type { NoShowReservationDeposit } from '../../../types/host.types';
import NoShowReservationDeposits from '../NoShowReservationDeposits';

const apiPost = vi.fn();
let role = 'owner';
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ role }) }));
vi.mock('../../../services/api', () => ({ api: { post: (...args: unknown[]) => apiPost(...args) } }));

const held: NoShowReservationDeposit = {
  reservation_id: 'HELD', customer_name: 'Held guest', date: '2026-03-20', time: '19:00:00',
  deposit_amount: 25, deposit_currency: 'eur', deposit_state: 'held',
};

beforeEach(() => {
  role = 'owner';
  apiPost.mockReset();
});

it('confirms the amount and no-show before charging', async () => {
  const refresh = vi.fn();
  apiPost.mockResolvedValue({ data: { success: true } });
  render(<NoShowReservationDeposits deposits={[held]} onDepositAction={refresh} />);
  fireEvent.click(screen.getByRole('button', { name: 'Charge €25.00' }));
  expect(apiPost).not.toHaveBeenCalled();

  const confirm = screen.getByRole('dialog', { name: 'Charge €25.00 for this no-show?' });
  expect(within(confirm).getByText(/Confirm the guest did not arrive/)).toBeVisible();
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
  expect(apiPost).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Charge €25.00' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge €25.00' }));
  expect(await screen.findByText('€25.00 captured')).toBeVisible();
  expect(apiPost).toHaveBeenCalledExactlyOnceWith('/capture-deposit', { reservation_id: 'HELD' });
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /charge|release|refund/i })).not.toBeInTheDocument();
});

it('releases a no-show hold without attempting a capture', async () => {
  const refresh = vi.fn();
  apiPost.mockResolvedValue({ data: { success: true } });
  render(<NoShowReservationDeposits deposits={[held]} onDepositAction={refresh} />);

  fireEvent.click(screen.getByRole('button', { name: 'Release' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(apiPost).toHaveBeenCalledExactlyOnceWith('/release-deposit', { reservation_id: 'HELD' });
  expect(screen.queryByText('Held guest')).not.toBeInTheDocument();
});

it('refreshes an expired authorization and immediately hides its actions', async () => {
  const refresh = vi.fn();
  apiPost.mockRejectedValue({ isAxiosError: true, response: { data: { code: 'deposit_authorization_expired' } } });
  render(<NoShowReservationDeposits deposits={[held]} onDepositAction={refresh} />);

  fireEvent.click(screen.getByRole('button', { name: 'Charge €25.00' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge €25.00' }));

  expect(await screen.findByText('Card hold expired')).toBeVisible();
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: /charge|release/i })).not.toBeInTheDocument();
});

it('offers the existing refund only for a captured deposit with a remaining balance', async () => {
  const captured: NoShowReservationDeposit = {
    ...held, reservation_id: 'CAPTURED', customer_name: 'Captured guest', deposit_state: 'captured', deposit_outstanding_amount: 25,
  };
  const expired: NoShowReservationDeposit = { ...held, reservation_id: 'EXPIRED', customer_name: 'Expired guest', deposit_state: 'expired' };
  const settled: NoShowReservationDeposit = {
    ...captured, reservation_id: 'SETTLED', customer_name: 'Settled guest', deposit_outstanding_amount: 0,
  };
  apiPost.mockResolvedValue({ data: { state: 'refunded' } });
  render(<NoShowReservationDeposits deposits={[captured, expired, settled]} onDepositAction={vi.fn()} />);
  expect(within(screen.getByText('Expired guest').closest('li')!).getByText('Card hold expired')).toBeVisible();

  const refund = screen.getByRole('button', { name: 'Refund deposit' });
  fireEvent.click(refund);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Refund deposit' }));
  await waitFor(() => expect(apiPost).toHaveBeenCalledExactlyOnceWith('/refund-deposit', { reservation_id: 'CAPTURED' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Refund deposit' })).not.toBeInTheDocument());
});

it.each(['manager', 'staff', 'host'])('lets a %s release a hold with charge and refund hidden', async assignedRole => {
  role = assignedRole;
  const captured: NoShowReservationDeposit = {
    ...held, reservation_id: 'CAPTURED', deposit_state: 'captured', deposit_outstanding_amount: 25,
  };
  const refresh = vi.fn();
  apiPost.mockResolvedValue({ data: { success: true } });
  render(<NoShowReservationDeposits deposits={[held, captured]} onDepositAction={refresh} />);

  expect(screen.queryByRole('button', { name: /charge|refund/i })).not.toBeInTheDocument();
  expect(screen.getByText('€25.00 captured')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Release' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(apiPost).toHaveBeenCalledExactlyOnceWith('/release-deposit', { reservation_id: 'HELD' });
});

it('hides charge on owner_required and still lets staff release the hold', async () => {
  apiPost
    .mockRejectedValueOnce({ isAxiosError: true, response: { status: 403, data: { code: 'owner_required' } } })
    .mockResolvedValueOnce({ data: { success: true } });
  const refresh = vi.fn();
  render(<NoShowReservationDeposits deposits={[held]} onDepositAction={refresh} />);

  fireEvent.click(screen.getByRole('button', { name: 'Charge €25.00' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge €25.00' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Only the restaurant owner can charge or refund deposits.');
  expect(screen.queryByRole('button', { name: 'Charge €25.00' })).not.toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Release' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(apiPost).toHaveBeenNthCalledWith(1, '/capture-deposit', { reservation_id: 'HELD' });
  expect(apiPost).toHaveBeenNthCalledWith(2, '/release-deposit', { reservation_id: 'HELD' });
});
