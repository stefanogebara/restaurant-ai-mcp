export interface WeeklyReportData {
  period: {
    start: string;
    end: string;
    label: string;
  };
  summary: {
    total_covers: number;
    previous_covers: number;
    covers_change_percent: number;
    total_reservations: number;
    reservation_count: number;
    walk_in_count: number;
    avg_party_size: number;
    cancellation_rate: number;
    cancelled_count: number;
  };
  busiest: {
    days: Array<{ day: string; covers: number }>;
    times: Array<{ time: string; covers: number }>;
  };
  demographics: {
    tourist_count: number;
    local_count: number;
    tourist_percentage: number;
    first_time_visitors: number;
    repeat_customers: number;
  };
  preferences: {
    dietary_restrictions: Record<string, number>;
    languages: Record<string, number>;
    seating: Record<string, number>;
    occasions: Record<string, number>;
  };
}
