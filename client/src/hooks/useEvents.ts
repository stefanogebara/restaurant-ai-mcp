import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api as apiClient } from '../services/api';

export interface EventItem {
  id: string;
  restaurant_id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  duration_minutes: number;
  max_capacity: number;
  current_bookings: number;
  price: number;
  is_active: boolean;
  refund_policy: string | null;
  cover_image_url: string | null;
  menu_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventBooking {
  id: string;
  restaurant_id: string;
  event_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string;
  party_size: number;
  total_amount: number;
  stripe_payment_intent_id: string | null;
  payment_status: 'pending' | 'paid' | 'refunded' | 'failed';
  booking_status: 'confirmed' | 'cancelled' | 'no_show' | 'completed';
  refund_amount: number;
  special_requests: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventBookingsSummary {
  total_bookings: number;
  paid_bookings: number;
  total_revenue: number;
  total_refunded: number;
  net_revenue: number;
}

export function useEventList() {
  return useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const res = await apiClient.get('/events?action=list');
      return res.data.data.events as EventItem[];
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      event_date: string;
      event_time: string;
      duration_minutes: number;
      max_capacity: number;
      price: number;
      refund_policy?: string;
      cover_image_url?: string;
      menu_description?: string;
    }) => {
      const res = await apiClient.post('/events?action=create', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      event_id: string;
      title?: string;
      description?: string;
      event_date?: string;
      event_time?: string;
      duration_minutes?: number;
      max_capacity?: number;
      price?: number;
    }) => {
      const res = await apiClient.post('/events?action=update', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useDeactivateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiClient.post('/events?action=deactivate', { event_id: eventId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

export function useEventBookings(eventId: string | null) {
  return useQuery({
    queryKey: ['event-bookings', eventId],
    queryFn: async () => {
      const res = await apiClient.get(`/events?action=bookings&event_id=${eventId}`);
      return res.data.data as {
        bookings: EventBooking[];
        summary: EventBookingsSummary;
      };
    },
    enabled: !!eventId,
    staleTime: 30 * 1000,
  });
}

export function useRefundEventBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await apiClient.post('/event-refund', { booking_id: bookingId });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}
