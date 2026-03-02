export type TableStatus = 'Available' | 'Occupied' | 'Being Cleaned' | 'Reserved';
export type TableShape = 'round' | 'square' | 'rectangle' | 'oval' | 'booth' | 'bar-stool';

// Default dimensions for each table shape (in grid units)
export const TABLE_DIMENSIONS: Record<TableShape, { width: number; height: number }> = {
  'round': { width: 1, height: 1 },
  'square': { width: 1, height: 1 },
  'rectangle': { width: 2, height: 1 },
  'oval': { width: 2, height: 1 },
  'booth': { width: 2, height: 1 },
  'bar-stool': { width: 1, height: 1 },
};

// Calculate table size based on shape and capacity
export function getTableSize(shape: TableShape, capacity: number): { width: number; height: number } {
  const base = TABLE_DIMENSIONS[shape];

  // Bar stools stay small regardless of capacity
  if (shape === 'bar-stool') {
    return base;
  }

  // Small tables (2-4 people)
  if (capacity <= 4) {
    return base;
  }

  // Medium tables (5-6 people)
  if (capacity <= 6) {
    if (shape === 'rectangle' || shape === 'oval') {
      return { width: 2, height: 1 };
    }
    return { width: Math.ceil(base.width * 1.5), height: base.height };
  }

  // Large tables (7-8 people)
  if (capacity <= 8) {
    if (shape === 'rectangle') {
      return { width: 2, height: 1 };
    }
    return { width: 2, height: 2 };
  }

  // Extra large tables (9+ people) - long table
  return { width: 3, height: 1 };
}

export interface Table {
  id: string;
  table_number: string;
  capacity: number;
  location: string;
  status: TableStatus;
  current_service_id?: string;

  // Shape configuration
  shape: TableShape;
  is_fixed_seating: boolean;      // Booths, sofas - can't move chairs

  // Joinable table configuration
  is_joinable: boolean;           // Can this table be combined?
  joinable_with: string[];        // IDs of tables it can link with

  // Floor plan positioning (grid units)
  position_x: number;
  position_y: number;
  width: number;                  // Grid units wide (default 1)
  height: number;                 // Grid units tall (default 1)
  rotation: number;               // 0, 90, 180, 270 degrees

  // Legacy fields (keep for backwards compatibility)
  is_fixed?: boolean;
  min_capacity?: number;
  max_capacity?: number;
  adjacent_tables?: string[];
  combination_group?: string;
}

export interface ActiveParty {
  service_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  tables: string[];
  seated_at: string;
  estimated_departure: string;
  time_elapsed_minutes: number;
  time_remaining_minutes: number;
  is_overdue: boolean;
  is_vip?: boolean;
  special_occasion?: string;
}

export interface UpcomingReservation {
  reservation_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  date: string;
  time: string;
  reservation_time: string;
  special_requests?: string;
  checked_in: boolean;
  checked_in_at?: string;
  status?: string;
  record_id?: string;
  table_ids?: string[];  // Assigned tables for this reservation
  // ML Prediction fields (from Supabase reservations table)
  ml_risk_score?: number;  // 0-100 percentage
  ml_risk_level?: 'low' | 'medium' | 'high' | 'very-high';
  ml_confidence?: number;  // 0-100 percentage
  ml_model_version?: string;
  ml_risk_factors?: Array<{  // Detailed risk factor breakdown for staff explanations
    factor: string;          // e.g., 'new_customer', 'large_party', 'far_advance'
    impact: number;          // +/- points
    description: string;     // Human-readable description
  }>;
  // Intervention tracking
  intervention_taken?: boolean;
  // Legacy field names (deprecated, use ml_* fields above)
  no_show_risk_score?: number;  // 0-100 percentage
  no_show_risk_level?: 'low' | 'medium' | 'high' | 'very-high';
  prediction_confidence?: number;  // 0-100 percentage
  // Segovia-specific enhanced notes fields
  dietary_restrictions?: string[];  // ['vegetarian', 'gluten-free', 'vegan', etc.]
  language_preference?: string;     // 'Spanish', 'English', 'Chinese', 'French'
  seating_preference?: string;      // 'Terrace', 'Window', 'Indoor', 'Bar'
  special_occasion?: string;        // 'Birthday', 'Anniversary', 'Business', 'Tourism'
  customer_type?: string;           // 'Tourist', 'Local'
  accessibility_needs?: string;     // 'Wheelchair', 'High Chair', 'None'
  internal_notes?: string;          // Staff-only notes
  first_time_visitor?: boolean;     // Flag for first-time customers
  // Deposit fields (Phase 10)
  deposit_amount?: number;
  deposit_payment_intent_id?: string;
}

export interface DashboardSummary {
  total_capacity: number;
  available_seats: number;
  occupied_seats: number;
  occupancy_percentage: number;
  active_parties: number;
  upcoming_reservations: number;
  estimated_wait_time?: number; // Minutes until next table available (0 if seats available)
  // Flexible table metrics
  max_single_party_size?: number;     // Largest party we can accommodate right now
  flexible_tables_available?: number; // Number of available flexible (combinable) tables
  fixed_tables_available?: number;    // Number of available fixed (non-combinable) tables
}

export interface DashboardData {
  summary: DashboardSummary;
  tables: Table[];
  active_parties: ActiveParty[];
  upcoming_reservations: UpcomingReservation[];
}

export interface TableRecommendation {
  tables: string[];
  total_capacity: number;
  match_quality: 'perfect' | 'good' | 'acceptable' | 'waste';
  score: number;
  reason: string;
}

export interface CheckInResponse {
  success: boolean;
  reservation: UpcomingReservation;
  recommendation: TableRecommendation;
  all_options: TableRecommendation[];
  next_step: string;
}

export interface SeatPartyRequest {
  type: 'reservation' | 'walk-in';
  reservation_id?: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  table_ids: string[];
  special_requests?: string;
}

export interface SeatPartyResponse {
  success: boolean;
  service_record_id: string;
  tables_assigned: string[];
  estimated_departure: string;
  message: string;
}

/** Data passed to SeatPartyModal from WalkInModal, CheckInModal, or WaitlistSeatModal */
export interface SeatModalData {
  type: 'walk-in' | 'reservation' | 'waitlist';
  customer_name: string;
  customer_phone: string;
  party_size: number;
  table_ids: string[];
  table_numbers?: string[];
  special_requests?: string;
  // reservation-specific
  reservation_id?: string;
  // waitlist-specific
  waitlist_id?: string;
  waitlist_entry_id?: string;
  // seating result
  recommendations?: { recommendation?: { total_capacity?: number } };
}
