export type TableStatus = 'Available' | 'Occupied' | 'Being Cleaned' | 'Reserved';

export interface Table {
  id: string;
  table_number: string;
  capacity: number;
  location: string;
  status: TableStatus;
  current_service_id?: string;
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
  // ML Prediction fields
  no_show_risk_score?: number;  // 0-100 percentage
  no_show_risk_level?: 'low' | 'medium' | 'high' | 'very-high';
  prediction_confidence?: number;  // 0-100 percentage
  ml_model_version?: string;
  // Segovia-specific enhanced notes fields
  dietary_restrictions?: string[];  // ['vegetarian', 'gluten-free', 'vegan', etc.]
  language_preference?: string;     // 'Spanish', 'English', 'Chinese', 'French'
  seating_preference?: string;      // 'Terrace', 'Window', 'Indoor', 'Bar'
  special_occasion?: string;        // 'Birthday', 'Anniversary', 'Business', 'Tourism'
  customer_type?: string;           // 'Tourist', 'Local'
  accessibility_needs?: string;     // 'Wheelchair', 'High Chair', 'None'
  internal_notes?: string;          // Staff-only notes
  first_time_visitor?: boolean;     // Flag for first-time customers
}

export interface DashboardSummary {
  total_capacity: number;
  available_seats: number;
  occupied_seats: number;
  occupancy_percentage: number;
  active_parties: number;
  upcoming_reservations: number;
  estimated_wait_time?: number; // Minutes until next table available (0 if seats available)
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
