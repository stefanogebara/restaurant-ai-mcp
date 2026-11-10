import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import i18n from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderWithProviders';
import BookingConfirmation from '../BookingConfirmation';
import CustomerPortal from '../CustomerPortal';

const receipt = { id: 'RES-20261110-aB_cD-eF12_X', name: 'Guest', party_size: 2,
  date: '2027-03-01', time: '19:00', status: 'confirmed', restaurant_name: 'Cantina' };
const target = `/book/cantina/confirmed?id=${receipt.id}&rid=restaurant`;
const handoff = { reservation: receipt, receiptId: receipt.id, customerPhone: '+5511912345678', restaurant_id: 'restaurant' };
const request = vi.fn<typeof fetch>();
const postMessage = vi.fn();
let serverStatus: string;
let serverError: boolean;
let waitForRead: Promise<void> | undefined;
let queryClient: QueryClient;
let serviceWorkerDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  serverStatus = 'confirmed'; serverError = false; waitForRead = undefined;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  postMessage.mockReset();
  vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage } as unknown as Window);
  vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://restaurant.example/book');
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() });
  vi.stubGlobal('PushManager', class {});
  serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  request.mockReset().mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'https://seatable.one');
    if (url.pathname === '/api/customer-reservation') {
      if (init?.method === 'POST') {
        expect(url.searchParams.get('action')).toBe('cancel');
        serverStatus = 'cancelled';
      }
      return Response.json({ success: true, reservation: { ...receipt, reservation_id: receipt.id,
        customer_name: receipt.name, customer_phone: handoff.customerPhone, customer_email: '', status: serverStatus } });
    }
    if (url.searchParams.get('action') === 'restaurant') return Response.json({ success: true,
      data: { id: 'restaurant', name: 'Cantina', phone: '+551100000000', whatsapp_enabled: true } });
    if (url.searchParams.get('action') === 'reservation') {
      await waitForRead;
      if (serverError) return Response.json({ success: false }, { status: 503 });
      return Response.json({ success: true, reservation: { ...receipt, status: serverStatus } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', request);
});
afterEach(async () => {
  cleanup(); queryClient.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (serviceWorkerDescriptor) Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
  else Reflect.deleteProperty(navigator, 'serviceWorker');
  await i18n.changeLanguage('en');
});

function Start({ status = 'confirmed' }: { status?: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(target, { state: { ...handoff, reservation: { ...receipt, status } } })}>Complete booking</button>;
}
function Back() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Back</button>;
}
function renderReceipt(fresh = false, status = 'confirmed', savedState = true, cached = true) {
  if (!fresh && cached) queryClient.setQueryData(['reservation', receipt.id], receipt);
  renderWithProviders(<MemoryRouter initialEntries={fresh ? ['/start'] : [{ pathname: '/book/cantina/confirmed',
    search: `?id=${receipt.id}&rid=restaurant`, state: savedState ? { reservation: receipt } : null }]}>
    <Back />
    <Routes>
      <Route path="/start" element={<Start status={status} />} />
      <Route path="/book/:slug/confirmed" element={<BookingConfirmation />} />
      <Route path="/customer" element={<CustomerPortal />} />
    </Routes>
  </MemoryRouter>, { queryClient });
  if (fresh) fireEvent.click(screen.getByRole('button', { name: 'Complete booking' }));
}
const reads = () => request.mock.calls.filter(([input]) => String(input).includes('action=reservation'));
function expectNoConfirmation() {
  expect(screen.queryByRole('heading', { name: 'Reservation Confirmed' })).not.toBeInTheDocument();
  expect(screen.queryByText('Confirmed', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Turn on reminders' })).not.toBeInTheDocument();
  expect(screen.queryByText(/send you a WhatsApp reminder/)).not.toBeInTheDocument();
}

it.each([
  ['cancelled', 'Cancelled'], [' Cancelled ', 'Cancelled'], ['completed', 'Completed'],
  ['seated', 'Seated'], ['no_show', 'No-show'], ['no-show', 'No-show'], ['pending', 'Pending'],
  ['unexpected', 'Status unavailable'], ['', 'Status unavailable'],
])('renders server %s accurately after mounting a cached confirmed receipt', async (status, label) => {
  serverStatus = status;
  renderReceipt();
  expect(await screen.findByText(label, { exact: true })).toBeVisible();
  expect(await screen.findByText(receipt.id)).toBeVisible();
  expectNoConfirmation();
  expect(reads()).toHaveLength(1);
  expect(postMessage).not.toHaveBeenCalled();
});

it.each([
  ['pt-BR', 'cancelled', 'Cancelada'], ['pt-BR', 'pending', 'Pendente'], ['pt-BR', 'unknown', 'Status indisponível'],
  ['es', 'cancelled', 'Cancelada'], ['es', 'pending', 'Pendiente'], ['es', 'unknown', 'Estado no disponible'],
])('localizes %s receipt status %s', async (language, status, label) => {
  await i18n.changeLanguage(language); serverStatus = status;
  renderReceipt();
  expect(await screen.findByText(label, { exact: true })).toBeVisible();
  expect(screen.queryByRole('heading', { name: /Reserva Confirmada/ })).not.toBeInTheDocument();
  expect(postMessage).not.toHaveBeenCalled();
});

it('keeps fresh creation fast and emits one widget event only for the new confirmed receipt', async () => {
  renderReceipt(true);
  expect(await screen.findByRole('heading', { name: 'Reservation Confirmed' })).toBeVisible();
  expect(reads()).toHaveLength(0);
  await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
  expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'seatable-booking-confirmed',
    payload: expect.objectContaining({ reservation_id: receipt.id }) }), 'https://restaurant.example');
});

it('does not post a booking event for a confirmed receipt loaded without fresh creation proof', async () => {
  renderReceipt(false, 'confirmed', false);
  await waitFor(() => expect(reads()).toHaveLength(1));
  expect(await screen.findByRole('heading', { name: 'Reservation Confirmed' })).toBeVisible();
  expect(postMessage).not.toHaveBeenCalled();
});

it('does not post a widget booking event or offer reminders for a fresh cancelled receipt', async () => {
  queryClient.removeQueries();
  // The receipt returned by creation itself can never override a terminal status.
  renderReceipt(true, 'cancelled');
  expect(await screen.findByText('Cancelled', { exact: true })).toBeVisible();
  expectNoConfirmation();
  expect(postMessage).not.toHaveBeenCalled();
});

it('revalidates on Back after explicit portal cancellation instead of trusting consumed router data', async () => {
  renderReceipt(true);
  await screen.findByRole('heading', { name: 'Reservation Confirmed' });
  fireEvent.click(screen.getByRole('button', { name: /^Manage Reservation$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Look Up Reservation' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel Reservation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel reservation' }));
  await screen.findByText('Reservation cancelled successfully');
  let finish!: () => void;
  waitForRead = new Promise<void>(resolve => { finish = resolve; });
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expectNoConfirmation();
  expect(await screen.findByText('Checking reservation status…')).toBeVisible();
  await act(async () => { finish(); });
  expect(await screen.findByText('Cancelled', { exact: true })).toBeVisible();
  expectNoConfirmation();
  expect(reads()).toHaveLength(1);
  expect(postMessage).toHaveBeenCalledTimes(1);
});

it('shows cached details as unverified after GET failure, and explicit retry can recover the cancelled status', async () => {
  serverError = true;
  renderReceipt();
  expect(await screen.findByRole('button', { name: 'Retry status' })).toBeEnabled();
  expectNoConfirmation();
  expect(screen.getByText(receipt.id)).toBeVisible();
  expect(postMessage).not.toHaveBeenCalled();
  serverError = false; serverStatus = 'cancelled';
  fireEvent.click(screen.getByRole('button', { name: 'Retry status' }));
  expect(await screen.findByText('Cancelled', { exact: true })).toBeVisible();
  expect(reads()).toHaveLength(2);
  expectNoConfirmation();
});

it('shows a retryable unverified state for a first-load error without cached details', async () => {
  serverError = true;
  renderReceipt(false, 'confirmed', false, false);
  expect(await screen.findByRole('heading', { name: 'Status unavailable' })).toBeVisible();
  expect(screen.queryByText(receipt.id)).not.toBeInTheDocument();
  expectNoConfirmation();
  expect(postMessage).not.toHaveBeenCalled();
  serverError = false; serverStatus = 'pending';
  fireEvent.click(screen.getByRole('button', { name: 'Retry status' }));
  expect(await screen.findByText('Pending', { exact: true })).toBeVisible();
  expectNoConfirmation();
});
