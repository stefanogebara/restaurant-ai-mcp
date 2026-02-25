/**
 * Supabase Realtime Subscription Hooks
 *
 * Replaces 30-second polling with real-time Postgres change notifications.
 * Uses Supabase Realtime channels to listen for INSERT, UPDATE, DELETE events
 * on restaurant-specific rows and invalidates the corresponding React Query caches.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

/**
 * Mapping from Supabase table names to their corresponding React Query cache keys.
 */
const TABLE_TO_QUERY_KEY: Record<string, string> = {
  reservations: 'reservations',
  tables: 'tables',
  waitlist: 'waitlist',
  service_records: 'serviceRecords',
};

/** The four dashboard tables that should be subscribed to in real time */
const DASHBOARD_TABLES = ['reservations', 'tables', 'waitlist', 'service_records'] as const;

/**
 * Subscribe to real-time Postgres changes on a specific table,
 * filtered by restaurant_id. Automatically cleans up on unmount.
 *
 * @example
 * ```tsx
 * useRealtimeSubscription('reservations', 'abc-123');
 * ```
 */
export function useRealtimeSubscription(
  table: string,
  restaurantId: string | undefined,
  onData?: (payload: unknown) => void,
): void {
  const queryClient = useQueryClient();
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!restaurantId) return;

    const channelName = `realtime:${table}:${restaurantId}`;

    const channel: RealtimeChannel = supabase.channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload: unknown) => {
          const queryKey = TABLE_TO_QUERY_KEY[table];
          if (queryKey) {
            queryClient.invalidateQueries({ queryKey: [queryKey] });
          }
          onDataRef.current?.(payload);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, restaurantId, queryClient]);
}

/**
 * Convenience hook that subscribes to all four dashboard tables
 * (reservations, tables, waitlist, service_records) for a given restaurant.
 *
 * On any change to any of these tables, the matching React Query cache key
 * is automatically invalidated, triggering a refetch in any component
 * that consumes that data. Also invalidates 'hostDashboard' key.
 *
 * @param restaurantId - The restaurant to subscribe to changes for
 *
 * @example
 * ```tsx
 * function Dashboard({ restaurantId }: { restaurantId: string }) {
 *   useRealtimeDashboard(restaurantId);
 *   const { data } = useHostDashboard();
 *   return <DashboardView data={data} />;
 * }
 * ```
 */
export function useRealtimeDashboard(restaurantId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!restaurantId) return;

    const channelName = `realtime:dashboard:${restaurantId}`;

    let channel: RealtimeChannel = supabase.channel(channelName);

    for (const table of DASHBOARD_TABLES) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          const queryKey = TABLE_TO_QUERY_KEY[table];
          if (queryKey) {
            queryClient.invalidateQueries({ queryKey: [queryKey] });
          }
          queryClient.invalidateQueries({ queryKey: ['hostDashboard'] });
          queryClient.invalidateQueries({ queryKey: ['simpleDashboard'] });
        },
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, queryClient]);
}
