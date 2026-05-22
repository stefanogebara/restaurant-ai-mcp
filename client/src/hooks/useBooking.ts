import { useQuery, useMutation } from '@tanstack/react-query';
import type { RestaurantInfo, TimeSlot } from '../components/booking/BookingForm';
import reservationContract from '../../../shared/reservation-contract.js';
import type { ReservationCreateInput, ReservationSummary } from '../../../shared/reservation-contract.js';

const PORTAL_API = '/api/portal';
const { normalizeReservationCreateInput } = reservationContract;

// ─── Restaurant ───────────────────────────────────────────────────────────────

export function useRestaurantBySlug(slug: string | undefined) {
  return useQuery<RestaurantInfo>({
    queryKey: ['restaurant-booking', slug],
    queryFn: async () => {
      const res = await fetch(`${PORTAL_API}?action=restaurant&slug=${encodeURIComponent(slug!)}`);
      // EE.3 — check res.ok before parsing JSON. A 500 returning HTML
      // threw "Unexpected token <" instead of a meaningful error.
      if (!res.ok) throw new Error(`Restaurant lookup failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !data.data) throw new Error('Restaurant not found');
      return data.data;
    },
    enabled: !!slug,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}

// ─── Reservation detail ───────────────────────────────────────────────────────

export type ReservationData = ReservationSummary;

export function useReservationById(id: string | null, initialData?: ReservationData) {
  return useQuery<ReservationData>({
    queryKey: ['reservation', id],
    queryFn: async () => {
      const res = await fetch(`${PORTAL_API}?action=reservation&id=${encodeURIComponent(id!)}`);
      // EE.3 — guard against non-OK HTML responses.
      if (!res.ok) throw new Error(`Reservation lookup failed (${res.status})`);
      const data = await res.json();
      if (!data.success || !data.reservation) throw new Error('Reservation not found');
      return data.reservation;
    },
    enabled: !initialData && !!id,
    initialData,
    staleTime: Infinity,
    retry: false,
  });
}

// ─── Availability ─────────────────────────────────────────────────────────────

export function useTimeSlots(restaurantId: string, date: string, partySize: number) {
  return useQuery<TimeSlot[]>({
    queryKey: ['time-slots', restaurantId, date, partySize],
    queryFn: async () => {
      const params = new URLSearchParams({
        action: 'availability',
        restaurant_id: restaurantId,
        date,
        party_size: String(partySize),
      });
      const res = await fetch(`${PORTAL_API}?${params}`);
      // EE.3 — throw on non-OK so the calling component can show an
      // error state instead of "no availability." Previously a 5xx was
      // indistinguishable from a real "no slots open" response.
      if (!res.ok) throw new Error(`Availability lookup failed (${res.status})`);
      const data = await res.json();
      return data.success && data.slots ? data.slots : [];
    },
    enabled: !!date && !!partySize,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Create reservation ───────────────────────────────────────────────────────

type ReservationInput = ReservationCreateInput;

export function useCreateReservation() {
  return useMutation<{ reservation: ReservationData }, Error, ReservationInput>({
    mutationFn: async (input) => {
      const payload = normalizeReservationCreateInput(input, { requireRestaurantId: true });
      const res = await fetch(`${PORTAL_API}?action=reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message || 'Could not complete reservation');
      return data;
    },
  });
}
