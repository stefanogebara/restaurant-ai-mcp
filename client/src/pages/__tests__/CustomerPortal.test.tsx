import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import CustomerPortal from '../CustomerPortal';
import { MemoryRouter } from 'react-router-dom';

const CODE = 'RES-20261110-aB_cD-eF12_X';
const PHONE = '+15550001234';
const booking = { reservation_id: CODE, customer_phone: PHONE, customer_name: 'Private Guest',
  customer_email: '', date: '2027-03-01', time: '19:00', party_size: 2, status: 'confirmed' };
const request = vi.fn();
beforeEach(() => {
  request.mockReset().mockResolvedValue({ ok: true, json: async () => ({ success: true, reservation: booking }) });
  vi.stubGlobal('fetch', request);
  window.history.replaceState({}, '', '/customer');
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, '', '/'); });
function fields() {
  return { phone: screen.getByLabelText('Phone Number'), code: screen.getByLabelText('Confirmation ID') };
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Look Up Reservation' })); }
function fillBoth() {
  const inputs = fields();
  fireEvent.change(inputs.phone, { target: { value: PHONE } });
  fireEvent.change(inputs.code, { target: { value: CODE } });
}

it('requires both fields and never submits a phone-only or code-only lookup', async () => {
  renderWithProviders(<MemoryRouter><CustomerPortal /></MemoryRouter>);
  const inputs = fields();
  fireEvent.change(inputs.phone, { target: { value: PHONE } });
  submit();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Look Up Reservation' })).not.toBeDisabled());
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(inputs.phone, { target: { value: '' } });
  fireEvent.change(inputs.code, { target: { value: CODE } });
  submit();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Look Up Reservation' })).not.toBeDisabled());
  expect(request).not.toHaveBeenCalled();
});

it('submits the pair without changing code case, underscores or hyphens', async () => {
  renderWithProviders(<MemoryRouter><CustomerPortal /></MemoryRouter>);
  fillBoth(); submit();
  expect(await screen.findByText('Private Guest')).toBeVisible();
  const url = new URL(String(request.mock.calls[0][0]), 'https://seatable.one');
  expect(url.searchParams.get('reservation_id')).toBe(CODE);
  expect(url.searchParams.get('customer_phone')).toBe(PHONE);
  expect(request).toHaveBeenCalledOnce();
});

it.each(['id', 'reservation_id'])('prefills a receipt %s without fetching details until the phone is supplied', async key => {
  window.history.replaceState({}, '', '/customer?' + new URLSearchParams({ [key]: CODE }));
  renderWithProviders(<MemoryRouter><CustomerPortal /></MemoryRouter>);
  expect(screen.getByLabelText('Confirmation ID')).toHaveValue(CODE);
  expect(screen.getByLabelText('Phone Number')).toBeRequired();
  expect(screen.getByLabelText('Phone Number')).toHaveAttribute('placeholder', '+5511999999999');
  expect(screen.getByLabelText('Phone Number')).toHaveValue('');
  expect(request).not.toHaveBeenCalled();
  submit();
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByText('Private Guest')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: PHONE } });
  submit();
  expect(await screen.findByText('Private Guest')).toBeVisible();
  const query = new URL(String(request.mock.calls[0][0]), 'https://seatable.one').searchParams;
  expect(query.get('reservation_id')).toBe(CODE);
  expect(query.get('customer_phone')).toBe(PHONE);
});

it('uses required accessible fields and prevents mobile correction of the opaque code', () => {
  renderWithProviders(<MemoryRouter><CustomerPortal /></MemoryRouter>);
  const code = screen.getByLabelText('Confirmation ID');
  expect(code).toBeRequired();
  expect(code).toHaveAttribute('autocapitalize', 'none');
  expect(code).toHaveAttribute('autocorrect', 'off');
  expect(code).toHaveAttribute('spellcheck', 'false');
  expect(screen.getByLabelText('Phone Number')).toBeRequired();
  expect(screen.queryByText('or', { exact: true })).not.toBeInTheDocument();
});

it('refreshes with the same verified pair after modifying the reservation', async () => {
  renderWithProviders(<MemoryRouter><CustomerPortal /></MemoryRouter>);
  fillBoth(); submit();
  await screen.findByText('Private Guest');
  fireEvent.click(screen.getByRole('button', { name: 'Edit Reservation' }));
  fireEvent.change(screen.getByDisplayValue('19:00'), { target: { value: '20:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(request.mock.calls[2][0]).toBe(request.mock.calls[0][0]);
  expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({ reservation_id: CODE, customer_phone: PHONE });
});

it('keeps wrong-pair responses generic and does not show private booking details', async () => {
  request.mockResolvedValue({ ok: false, json: async () => ({ success: false, error: 'Reservation not found' }) });
  renderWithProviders(<MemoryRouter><CustomerPortal /></MemoryRouter>);
  fillBoth(); submit();
  expect(await screen.findByText('Reservation not found')).toBeVisible();
  expect(screen.queryByText('Private Guest')).not.toBeInTheDocument();
});
