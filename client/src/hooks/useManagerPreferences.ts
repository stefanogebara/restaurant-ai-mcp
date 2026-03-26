import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface NotificationPreferences {
  morning_briefing?: boolean;
  end_of_day_briefing?: boolean;
  briefing_channel?: 'text' | 'voice_note' | 'phone_call';
  alert_low_covers?: boolean;
  alert_high_noshows?: boolean;
  alert_late_cancellations?: boolean;
  pre_reservation_upsell?: boolean;
  analytics_briefing_enabled?: boolean;
  analytics_briefing_phone?: string;
}

async function fetchPreferences(): Promise<NotificationPreferences> {
  const res = await authFetch('/api/manager-preferences');
  if (!res.ok) throw new Error('Failed to load notification preferences');
  const json = await res.json();
  return json.notification_preferences || {};
}

async function patchPreferences(updates: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const res = await authFetch('/api/manager-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to save notification preferences');
  const json = await res.json();
  return json.notification_preferences;
}

export function useManagerPreferences() {
  return useQuery({
    queryKey: ['manager-preferences'],
    queryFn: fetchPreferences,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveManagerPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPreferences,
    onSuccess: (updated) => {
      queryClient.setQueryData(['manager-preferences'], updated);
    },
  });
}
