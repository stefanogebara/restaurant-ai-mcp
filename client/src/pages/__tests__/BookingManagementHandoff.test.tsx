import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import BookingForm, { type RestaurantInfo } from '../../components/booking/BookingForm';
import BookingConfirmation from '../BookingConfirmation';
import CustomerPortal from '../CustomerPortal';

// Simulate the payment processor callback, while exercising both real form
// success handlers and the real reservation mutation with mocked HTTP only.
vi.mock('../../components/booking/DepositPaymentStep', () => ({
  default: ({ onSuccess }: { onSuccess: (id: string) => void }) => <button onClick={() => onSuccess('pi_test')}>Complete test deposit</button>,
}));

const CODE = 'RES-20261110-aB_cD-eF12_X';
const PHONE = '+55 (11) 91234-5678';
const receipt = { id: CODE, name: 'Guest', party_size: 2, date: '2027-03-01', time: '23:59',
  status: 'confirmed', restaurant_name: 'Cantina' };
const handoff = { receiptId: CODE, reservation: receipt, customerPhone: PHONE };
const restaurant: RestaurantInfo = { id: 'restaurant', name: 'Cantina', slug: 'cantina', type: 'casual',
  city: 'São Paulo', country: 'BR', phone: '', email: '', website: '', max_party_size: 10,
  min_party_size: 1, advance_booking_days: 5, average_dining_duration: 90,
  business_hours: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map(day => [day, { is_open: true, open_time: '12:00', close_time: '23:59' }])) };
const request = vi.fn<typeof fetch>();
// The form books TODAY and hides slots less than 30 minutes ahead; the only
// slot here is 23:59. On the real clock the test failed whenever it ran
// between 23:29 and 23:59 (CI did, at 23:53 UTC on 2026-11-11). Pin "now" to
// midday, faking only Date so React Query and waitFor keep real timers.
const MIDDAY = new Date(2027, 1, 26, 12, 0, 0);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MIDDAY);
  request.mockReset().mockImplementation(async input => {
    const url = new URL(String(input), 'https://seatable.one');
    if (url.pathname === '/api/booking-token') return Response.json({ token: 'test-token' });
    if (url.pathname === '/api/create-deposit-intent') return Response.json({ success: true, client_secret: 'test-secret', deposit_amount: 10 });
    const action = url.searchParams.get('action');
    if (action === 'restaurant') return Response.json({ success: true, data: restaurant });
    if (action === 'availability') return Response.json({ success: true, slots: [{ time: '23:59', available: true, available_seats: 8 }] });
    if (action === 'reserve' || action === 'reservation') return Response.json({ success: true, reservation: receipt });
    if (action === 'lookup') return Response.json({ success: true, reservation: {
      reservation_id: CODE, customer_name: 'Verified guest', customer_phone: PHONE,
      customer_email: '', date: receipt.date, time: receipt.time, party_size: 2, status: 'confirmed',
    } });
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', request);
  window.history.replaceState({}, '', '/');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function LocationProof() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{JSON.stringify(location)}</output>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button></>;
}
function Arrival({ target, state }: { target: string; state: unknown }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(target, { state })}>Arrive</button>;
}
function renderFlow(target: string, state?: unknown, fresh = true, deposit = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  renderWithProviders(<MemoryRouter initialEntries={fresh ? ['/start'] : [{ pathname: target.split('?')[0], search: target.includes('?') ? '?' + target.split('?')[1] : '', state }]}>
    <LocationProof />
    <Routes>
      <Route path="/start" element={<Arrival target={target} state={state} />} />
      <Route path="/book/:slug" element={<BookingForm restaurant={{ ...restaurant, deposit_config: { enabled: deposit, type: 'flat', amount: 10 } }} />} />
      <Route path="/book/:slug/confirmed" element={<BookingConfirmation />} />
      <Route path="/customer" element={<CustomerPortal />} />
    </Routes>
  </MemoryRouter>, { queryClient });
  if (fresh) fireEvent.click(screen.getByRole('button', { name: 'Arrive' }));
  return queryClient;
}
const lookupCalls = () => request.mock.calls.filter(([input]) => String(input).includes('action=lookup'));
function expectManual() {
  expect(screen.getByLabelText('Confirmation ID')).toHaveValue('');
  expect(screen.getByLabelText('Phone Number')).toHaveValue('');
  expect(lookupCalls()).toHaveLength(0);
}

it.each([false, true])('carries the full receipt and original phone after booking (deposit: %s), then requires explicit lookup', async deposit => {
  renderFlow('/book/cantina', undefined, true, deposit);
  fireEvent.click(await screen.findByRole('button', { name: '11:59 PM' }));
  const inputs = screen.getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: 'Guest' } });
  fireEvent.change(inputs[1], { target: { value: PHONE } });
  fireEvent.click(screen.getByRole('button', { name: deposit ? 'Continue to Payment' : 'Confirm Reservation' }));
  if (deposit) fireEvent.click(await screen.findByRole('button', { name: 'Complete test deposit' }));
  expect(await screen.findByText(CODE)).toBeVisible();
  await waitFor(() => expect(JSON.parse(screen.getByTestId('location').textContent!).state).toEqual({
    reservation: receipt, restaurant_name: restaurant.name, restaurant_id: restaurant.id,
  }));
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expect(screen.getByLabelText('Confirmation ID')).toHaveValue(CODE);
  expect(screen.getByLabelText('Phone Number')).toHaveValue(PHONE);
  expect(screen.getByLabelText('Phone Number')).toBeValid();
  const location = JSON.parse(screen.getByTestId('location').textContent!);
  expect(location.pathname).toBe('/customer');
  expect(location.search).toBe('');
  expect(location.state).toEqual({ reservation: receipt });
  expect(lookupCalls()).toHaveLength(0);
  expect(screen.queryByText('Verified guest')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Look Up Reservation' }));
  expect(await screen.findByText('Verified guest')).toBeVisible();
  const query = new URL(String(lookupCalls()[0][0]), 'https://seatable.one').searchParams;
  expect(query.get('reservation_id')).toBe(CODE);
  expect(query.get('customer_phone')).toBe(PHONE);
  expect(lookupCalls()).toHaveLength(1);
});

it('consumes proof on both routes while preserving receipt state, search, and hash', async () => {
  const target = `/book/cantina/confirmed?id=${CODE}&rid=restaurant#receipt`;
  renderFlow(target, { ...handoff, restaurant_id: 'restaurant', existing: 'keep' });
  await screen.findByText(CODE);
  const confirmed = JSON.parse(screen.getByTestId('location').textContent!);
  expect(confirmed.pathname).toBe('/book/cantina/confirmed');
  expect(confirmed.search).toBe(`?id=${CODE}&rid=restaurant`);
  expect(confirmed.hash).toBe('#receipt');
  expect(confirmed.state).toEqual({ reservation: receipt, restaurant_id: 'restaurant', existing: 'keep' });
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expect(screen.getByLabelText('Phone Number')).toHaveValue(PHONE);
  expect(JSON.parse(screen.getByTestId('location').textContent!).state).toEqual({ reservation: receipt });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByText(CODE);
  expect(JSON.parse(screen.getByTestId('location').textContent!).state).toEqual(confirmed.state);
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expectManual();
});

it('cannot recover the phone when returning to the consumed portal history entry', async () => {
  renderFlow(`/book/cantina/confirmed?id=${CODE}`, handoff);
  await screen.findByText(CODE);
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expect(screen.getByLabelText('Phone Number')).toHaveValue(PHONE);
  expect(JSON.parse(screen.getByTestId('location').textContent!).state).toEqual({ reservation: receipt });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByText(CODE);
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  expectManual();
});

it('rechecks the displayed receipt after capture before forwarding local proof', async () => {
  const queryClient = renderFlow(`/book/cantina/confirmed?id=${CODE}`, handoff);
  await screen.findByText(CODE);
  expect(JSON.parse(screen.getByTestId('location').textContent!).state).toEqual({ reservation: receipt });
  act(() => { queryClient.setQueryData(['reservation', CODE], { ...receipt, id: CODE.toLowerCase() }); });
  await screen.findByText(CODE.toLowerCase());
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expectManual();
});

it('keeps portal prefill locally after replacing state, but a remount cannot recover proof', () => {
  renderFlow('/customer?source=receipt#lookup', { ...handoff, existing: 'keep' });
  expect(screen.getByLabelText('Phone Number')).toHaveValue(PHONE);
  expect(screen.getByLabelText('Confirmation ID')).toHaveValue(CODE);
  const consumed = JSON.parse(screen.getByTestId('location').textContent!);
  expect(consumed.state).toEqual({ reservation: receipt, existing: 'keep' });
  expect(consumed.search).toBe('?source=receipt');
  expect(consumed.hash).toBe('#lookup');
  expect(lookupCalls()).toHaveLength(0);
  cleanup();
  renderFlow('/customer', consumed.state, false);
  expectManual();
});

it('removes proof from browser history without losing the router index or receipt metadata', async () => {
  window.history.replaceState({}, '', '/start');
  renderWithProviders(<BrowserRouter>
    <Routes>
      <Route path="/start" element={<Arrival target={`/book/cantina/confirmed?id=${CODE}#receipt`} state={{ ...handoff, existing: 'keep' }} />} />
      <Route path="/book/:slug/confirmed" element={<BookingConfirmation />} />
      <Route path="/customer" element={<CustomerPortal />} />
    </Routes>
  </BrowserRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Arrive' }));
  await screen.findByText(CODE);
  expect(window.history.state).toMatchObject({ idx: 1, key: expect.any(String), usr: { reservation: receipt, existing: 'keep' } });
  expect(window.history.state.usr).not.toHaveProperty('receiptId');
  expect(window.history.state.usr).not.toHaveProperty('customerPhone');
  expect(window.location.hash).toBe('#receipt');
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expect(screen.getByLabelText('Phone Number')).toHaveValue(PHONE);
  expect(window.history.state).toMatchObject({ idx: 2, key: expect.any(String) });
  expect(window.history.state.usr).toEqual({ reservation: receipt });
  expect(lookupCalls()).toHaveLength(0);
});

it.each([
  undefined,
  { ...handoff, receiptId: CODE.toLowerCase() },
  ...[null, 5511912345678, {}, '', 'abc1234567890', '+55', '+55 111111111111111111', '+55\n11912345678'].map(customerPhone => ({ ...handoff, customerPhone })),
])('leaves the portal manual for absent, mismatched or invalid state: %j', state => {
  renderFlow('/customer', state);
  expectManual();
  const remaining = JSON.parse(screen.getByTestId('location').textContent!).state ?? {};
  expect(remaining).not.toHaveProperty('customerPhone');
  expect(remaining).not.toHaveProperty('receiptId');
});

it('ignores history state on direct/reloaded portal entry', () => {
  renderFlow('/customer', handoff, false);
  expectManual();
  expect(JSON.parse(screen.getByTestId('location').textContent!).state).toEqual({ reservation: receipt });
});

it.each([false, true])('does not forward phone from a %s fresh confirmation with a mismatched receipt', async fresh => {
  renderFlow(`/book/cantina/confirmed?id=${CODE}`, { ...handoff, receiptId: CODE.toLowerCase() }, fresh);
  await screen.findByText(CODE);
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expectManual();
});

it('does not reuse a valid phone after the confirmation is reloaded', async () => {
  renderFlow(`/book/cantina/confirmed?id=${CODE}`, handoff, false);
  await screen.findByText(CODE);
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expectManual();
});

it.each([
  undefined,
  { ...handoff, customerPhone: 5511912345678 },
  { ...handoff, reservation: { ...receipt, id: CODE.toLowerCase() } },
])('does not forward absent or invalid booking state from a fresh confirmation: %j', async state => {
  renderFlow(`/book/cantina/confirmed?id=${CODE}`, state);
  await screen.findByRole('button', { name: /^Manage Reservation$/ });
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  expectManual();
});

it('preserves a national phone accepted by the booking form', () => {
  renderFlow('/customer', { ...handoff, customerPhone: '(11) 91234-5678' });
  expect(screen.getByLabelText('Phone Number')).toHaveValue('(11) 91234-5678');
  expect(screen.getByLabelText('Phone Number')).toBeValid();
  expect(lookupCalls()).toHaveLength(0);
});

it('still requires the server to validate a prefilled pair', async () => {
  request.mockResolvedValue(Response.json({ success: false, error: 'Reservation not found' }, { status: 404 }));
  renderFlow('/customer', handoff);
  expect(screen.queryByText('Guest')).not.toBeInTheDocument();
  expect(lookupCalls()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Look Up Reservation' }));
  expect(await screen.findByText('Reservation not found')).toBeVisible();
  expect(screen.queryByText('Verified guest')).not.toBeInTheDocument();
  expect(lookupCalls()).toHaveLength(1);
});

it('also forwards the verified handoff from the secondary manage action', async () => {
  renderFlow(`/book/cantina/confirmed?id=${CODE}`, handoff);
  await screen.findByText(CODE);
  fireEvent.click(screen.getByRole('button', { name: 'Manage your reservation' }));
  expect(screen.getByLabelText('Confirmation ID')).toHaveValue(CODE);
  expect(screen.getByLabelText('Phone Number')).toHaveValue(PHONE);
  expect(lookupCalls()).toHaveLength(0);
});
