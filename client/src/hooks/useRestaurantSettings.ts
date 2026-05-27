import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export interface BusinessHours {
  [day: string]: {
    is_open: boolean;
    open_time: string | null;
    close_time: string | null;
  };
}

export interface ReservationSettings {
  advance_booking_days?: number;
  buffer_time_minutes?: number;
  cancellation_policy?: string;
  max_party_size?: number;
  min_party_size?: number;
  allow_waitlist?: boolean;
  default_dining_duration?: number;
  auto_confirm?: boolean;
}

export interface RestaurantSettings {
  language: string;
  restaurant_name: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  business_hours: BusinessHours | null;
  timezone: string;
  reservation_settings: ReservationSettings | null;
}

async function fetchSettings(): Promise<RestaurantSettings> {
  const res = await api.get('/restaurant-settings');
  if (!res.data?.success || !res.data?.data) {
    throw new Error(res.data?.error || 'Failed to load restaurant settings');
  }
  return res.data.data;
}

export function useRestaurantSettings() {
  return useQuery({
    queryKey: ['restaurant-settings'],
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateRestaurantSettings() {
  const queryClient = useQueryClient();
  return useMutation<RestaurantSettings, Error, Partial<RestaurantSettings>>({
    mutationFn: async (updates) => {
      const res = await api.put('/restaurant-settings', updates);
      // Throw on { success:false } — the previous version only relied on
      // axios's HTTP-status throw, so a 200 + { success:false, error:'...' }
      // (which this endpoint can return) was rendering a green "Saved" toast
      // while the host's hours/policies/phone were silently discarded.
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Failed to save settings');
      }
      return res.data.data as RestaurantSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['restaurant-settings'] });
    },
  });
}
