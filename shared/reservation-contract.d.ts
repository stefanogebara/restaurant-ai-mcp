export interface ReservationCreateInput {
  restaurant_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  party_size?: number | string;
  date?: string;
  time?: string;
  special_requests?: string;
  source?: string;
  deposit_payment_intent_id?: string;
  deposit_amount?: number | string;
}

export interface ReservationModifyInput {
  reservation_id?: string;
  date?: string;
  time?: string;
  party_size?: number | string;
  special_requests?: string;
}

export interface ReservationSummary {
  id: string;
  name: string;
  party_size: number;
  date: string;
  time: string;
  status: string;
  restaurant_name: string;
}

export interface NormalizeReservationCreateOptions {
  requireRestaurantId?: boolean;
}

declare const reservationContract: {
  getMissingReservationCreateFields(
    input?: Partial<ReservationCreateInput>,
    options?: NormalizeReservationCreateOptions
  ): string[];
  isValidReservationDate(value: string): boolean;
  isValidReservationTime(value: string): boolean;
  mapReservationSummary(record: Record<string, unknown>, extras?: { restaurant_name?: string }): ReservationSummary;
  normalizeReservationCreateInput(
    input?: Partial<ReservationCreateInput>,
    options?: NormalizeReservationCreateOptions
  ): ReservationCreateInput & { party_size?: number; deposit_amount?: number };
  normalizeReservationModifyInput(
    input?: Partial<ReservationModifyInput>
  ): ReservationModifyInput & { party_size?: number };
};

export default reservationContract;
