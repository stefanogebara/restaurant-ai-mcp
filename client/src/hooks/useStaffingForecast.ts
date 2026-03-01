import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../services/api';

export interface StaffingRole {
  name: string;
  recommended: number;
}

export interface ForecastDay {
  date: string;
  day: string;
  expected_covers: number;
  roles: StaffingRole[];
}

async function fetchForecast(): Promise<ForecastDay[]> {
  const res = await authFetch('/staffing-forecast');
  if (!res.ok) throw new Error('Failed to load staffing forecast');
  const json = await res.json() as { forecast: ForecastDay[] };
  return json.forecast;
}

export function useStaffingForecast() {
  return useQuery({
    queryKey: ['staffing-forecast'],
    queryFn: fetchForecast,
    staleTime: 10 * 60 * 1000,
  });
}
