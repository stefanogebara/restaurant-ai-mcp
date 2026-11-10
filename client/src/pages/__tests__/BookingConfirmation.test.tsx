import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from 'i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BookingConfirmation from '../BookingConfirmation';
import type { ReservationData } from '../../hooks/useBooking';

// The real portal summary has no guest email or delivery receipt. The guest
// booked without email and the restaurant has WhatsApp disabled.
const reservation: ReservationData = {
  id: 'QA-booking-receipt', name: 'Booking Guest', party_size: 2,
  date: '2026-11-11', time: '19:30', status: 'confirmed', restaurant_name: 'Cantina Test',
};
const restaurant = {
  id: 'restaurant-test', name: 'Cantina Test', slug: 'cantina-test',
  city: 'São Paulo', country: 'BR', phone: '+551100000000', whatsapp_enabled: false,
  cancellation_policy: 'cancellationPreset:cancelFree2h',
};
const fetchMock = vi.fn<typeof fetch>();
let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname !== '/api/portal') throw new Error(`Unexpected request: ${url.pathname}`);
    if (url.searchParams.get('action') === 'restaurant') {
      return new Response(JSON.stringify({ success: true, data: restaurant }));
    }
    if (url.searchParams.get('action') === 'reservation') {
      return new Response(JSON.stringify({ success: true, reservation }));
    }
    throw new Error('Unexpected portal action');
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en');
});

const locales = [
  ['en', 'Your reservation is recorded. The details are below.', 'Save this confirmation and your reservation ID.'],
  ['pt-BR', 'Sua reserva foi registrada. Os detalhes estão abaixo.', 'Guarde este comprovante e o código da sua reserva.'],
  ['es', 'Tu reserva está registrada. Los detalles aparecen abajo.', 'Guarda esta confirmación y el código de tu reserva.'],
];

for (const fromState of [true, false]) {
  describe(`BookingConfirmation with no email or WhatsApp (${fromState ? 'after booking' : 'page reload'})`, () => {
    it.each(locales)('renders a recorded reservation and localized save instructions in %s', async (language, recorded, save) => {
      await i18n.changeLanguage(language);
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[{
            pathname: '/book/cantina-test/confirmed',
            search: `?id=${reservation.id}&rid=${restaurant.id}`,
            state: fromState ? { reservation, restaurant_id: restaurant.id } : null,
          }]}>
            <Routes>
              <Route path="/book/:slug/confirmed" element={<BookingConfirmation />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(await screen.findByText(reservation.id)).toBeVisible();
      // Wait for the real restaurant query, not only router-state reservation data.
      expect(await screen.findByRole('link', { name: restaurant.phone })).toHaveAttribute('href', `tel:${restaurant.phone}`);
      expect(screen.getByText(recorded)).toBeVisible();
      expect(screen.getByText(save)).toBeVisible();
      expect(i18n.getResource(language, 'translation', 'reservations.confirmation.saveConfirmation')).toBe(save);
      const main = screen.getByRole('main');
      expect(main).not.toHaveTextContent(/We've sent a confirmation|Enviamos uma confirmação|Hemos enviado una confirmación/i);
      expect(main).not.toHaveTextContent(/WhatsApp/i);
      if (language !== 'en') expect(main).not.toHaveTextContent('Save this confirmation');
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const actions = fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').searchParams.get('action'));
      expect(actions).toEqual(fromState ? ['restaurant'] : ['reservation', 'restaurant']);
    });
  });
}
