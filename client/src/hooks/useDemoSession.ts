import { useQuery } from '@tanstack/react-query';
import type { Table, UpcomingReservation } from '../types/host.types';
import type { ScrapedRestaurantData } from '../components/demo/RealRestaurantCard';

interface DemoRestaurant {
  id: string;
  restaurant_name: string;
  restaurant_type: string;
  city: string;
  country: string;
  demo_expires_at: string;
  demo_token: string;
  business_hours: Record<string, unknown>;
  max_party_size: number;
  slug?: string;
  // Full Google Places scrape payload persisted at demo creation. Drives the
  // "wow card" on the dashboard even after refresh (where router state is lost)
  // and powers richer onboarding pre-fill on conversion.
  scraped_data?: ScrapedRestaurantData | null;
}

export interface DemoSession {
  restaurant: DemoRestaurant;
  tables: Table[];
  reservations: UpcomingReservation[];
  daysLeft: number;
}

export function useDemoSession(token: string | undefined) {
  return useQuery<DemoSession>({
    queryKey: ['demo-session', token],
    queryFn: async () => {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await fetch(`${apiBase}/demo/session?token=${encodeURIComponent(token!)}`);
      const data = await res.json();
      if (!data.success) throw new Error('This demo link is invalid or has expired.');
      return data;
    },
    enabled: !!token,
    staleTime: Infinity,
    retry: false,
  });
}
