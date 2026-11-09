import { useQuery } from '@tanstack/react-query';
import { hostAPI } from '../services/api';
import type { UpcomingReservation } from '../types/host.types';

// Realtime is an optional acceleration: a connected channel does not prove
// the database publishes events. Keep a foreground fallback for active hosts.
export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: hostAPI.getDashboard,
    refetchInterval: query => {
      const reservations: UpcomingReservation[] = query.state.data?.data?.upcoming_reservations || [];
      const recentPending = reservations.some(reservation => {
        const receipt = reservation.whatsapp_confirmation;
        if (!receipt || !['requested', 'accepted', 'sent', 'unknown'].includes(receipt.status)) return false;
        const age = Date.now() - Date.parse(receipt.requested_at || '');
        return Number.isFinite(age) && age >= 0 && age < 5 * 60 * 1000;
      });
      return recentPending ? 15_000 : 60_000;
    },
    refetchIntervalInBackground: false,
  });
}
