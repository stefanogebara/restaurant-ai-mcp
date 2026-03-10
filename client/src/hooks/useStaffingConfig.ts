import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface StaffingRole {
  name: string;
  covers_per_staff: number;
}

export interface StaffingConfig {
  roles: StaffingRole[];
}

async function fetchConfig(): Promise<StaffingConfig | null> {
  const res = await authFetch('/api/staffing-config');
  if (!res.ok) throw new Error('Failed to load staffing config');
  const json = await res.json() as { staffing_config: StaffingConfig | null };
  return json.staffing_config;
}

async function patchConfig(config: StaffingConfig): Promise<StaffingConfig> {
  const res = await authFetch('/api/staffing-config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error('Failed to save staffing config');
  const json = await res.json() as { staffing_config: StaffingConfig };
  return json.staffing_config;
}

export function useStaffingConfig() {
  return useQuery({
    queryKey: ['staffing-config'],
    queryFn: fetchConfig,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSaveStaffingConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchConfig,
    onSuccess: (updated) => {
      queryClient.setQueryData(['staffing-config'], updated);
      queryClient.invalidateQueries({ queryKey: ['staffing-forecast'] });
    },
  });
}
