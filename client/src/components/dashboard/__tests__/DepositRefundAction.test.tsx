import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/renderWithProviders';
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

it('distinguishes a released hold, a full refund and a partial refund', () => {
  const { rerender } = render(<DepositBadge amount={null} currency="eur" held={false} />);
  expect(screen.queryByText(/captured|refunded/)).not.toBeInTheDocument();

  rerender(<DepositBadge amount={25} refundedAmount={25} currency="eur" held={false} />);
  expect(screen.getByText('€25.00 refunded')).toBeInTheDocument();
  expect(screen.queryByText(/captured/)).not.toBeInTheDocument();

  rerender(<DepositBadge amount={25} refundedAmount={10} currency="eur" held={false} />);
  expect(screen.getByText('€25.00 captured · €10.00 refunded')).toBeInTheDocument();
});
