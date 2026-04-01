import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export interface EventCheckoutInput {
  event_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_email: string;
  party_size: number;
  special_requests?: string;
}

export interface EventCheckoutResult {
  client_secret: string;
  payment_intent_id: string;
  booking_id: string;
  total_amount: number;
}

export function useEventCheckout() {
  return useMutation({
    mutationFn: async (data: EventCheckoutInput): Promise<EventCheckoutResult> => {
      // Public endpoint — no auth token needed
      const res = await axios.post(`${API_BASE}/event-checkout`, data, {
        headers: { 'Content-Type': 'application/json' },
      });
      return res.data as EventCheckoutResult;
    },
  });
}

export interface EventBookingConfirmInput {
  booking_id: string;
  payment_intent_id: string;
}

export function useEventBookingConfirm() {
  return useMutation({
    mutationFn: async (data: EventBookingConfirmInput) => {
      const res = await axios.post(`${API_BASE}/event-booking-confirm`, data, {
        headers: { 'Content-Type': 'application/json' },
      });
      return res.data;
    },
  });
}
