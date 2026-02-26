import { useQuery, useMutation } from '@tanstack/react-query';
import type { RestaurantInfo, TimeSlot } from '../components/booking/BookingForm';

const PORTAL_API = '/api/portal';

// ─── Restaurant ───────────────────────────────────────────────────────────────

export function useRestaurantBySlug(slug: string | undefined) {
  return useQuery<RestaurantInfo>({
    queryKey: ['restaurant-booking', slug],
    queryFn: async () => {
      const res = await fetch(`${PORTAL_API}?action=restaurant&slug=${encodeURIComponent(slug!)}`);
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

export interface ReservationData {
  id: string;
  name: string;
  party_size: number;
  date: string;
  time: string;
  status: string;
  restaurant_name: string;
}

export function useReservationById(id: string | null, initialData?: ReservationData) {
  return useQuery<ReservationData>({
    queryKey: ['reservation', id],
    queryFn: async () => {
      const res = await fetch(`${PORTAL_API}?action=reservation&id=${encodeURIComponent(id!)}`);
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
      const data = await res.json();
      return data.success && data.slots ? data.slots : [];
    },
    enabled: !!date && !!partySize,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Create reservation ───────────────────────────────────────────────────────

interface ReservationInput {
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  party_size: number;
  date: string;
  time: string;
  special_requests?: string;
}

export function useCreateReservation() {
  return useMutation<{ reservation: ReservationData }, Error, ReservationInput>({
    mutationFn: async (input) => {
      const res = await fetch(`${PORTAL_API}?action=reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Could not complete reservation');
      return data;
    },
  });
}
