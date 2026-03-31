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
  created_at: string;
  updated_at: string;
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
