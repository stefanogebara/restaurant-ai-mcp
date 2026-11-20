ALTER TABLE public.reservations
  ADD COLUMN deposit_check_after timestamptz,
  ADD COLUMN deposit_capture_started_at timestamptz,
  ADD COLUMN deposit_authorization_expired_at timestamptz;

CREATE OR REPLACE FUNCTION public.queue_changed_reservation_deposit_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deposit_payment_intent_id IS NOT NULL THEN
      NEW.deposit_check_after := statement_timestamp();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deposit_payment_intent_id IS NULL THEN
    NEW.deposit_release_pending_at := NULL;
    NEW.deposit_check_after := NULL;
    NEW.deposit_capture_started_at := NULL;
  ELSIF NEW.checked_in_at IS NOT NULL OR lower(NEW.status) IN ('seated', 'cancelled', 'canceled') THEN
    NEW.deposit_release_pending_at := coalesce(NEW.deposit_release_pending_at, statement_timestamp());
  ELSIF NEW.deposit_payment_intent_id IS DISTINCT FROM OLD.deposit_payment_intent_id THEN
    NEW.deposit_release_pending_at := NULL;
    NEW.deposit_reauthorization_required := false;
    NEW.deposit_authorization_expired_at := NULL;
    NEW.deposit_capture_started_at := NULL;
    NEW.deposit_check_after := statement_timestamp();
  ELSIF NEW.date IS DISTINCT FROM OLD.date
    OR NEW.time IS DISTINCT FROM OLD.time
    OR NEW.party_size IS DISTINCT FROM OLD.party_size THEN
    NEW.deposit_release_pending_at := statement_timestamp();
    NEW.deposit_reauthorization_required := true;
  END IF;

  IF NEW.deposit_captured_payment_intent_id IS NOT NULL OR NEW.checked_in_at IS NOT NULL
    OR lower(NEW.status) IN ('seated', 'cancelled', 'canceled', 'no-show', 'no_show') THEN
    NEW.deposit_reauthorization_required := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER queue_changed_reservation_deposit_release ON public.reservations;
CREATE TRIGGER queue_changed_reservation_deposit_release
  BEFORE INSERT OR UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.queue_changed_reservation_deposit_release();

UPDATE public.reservations
   SET deposit_check_after = statement_timestamp()
 WHERE deposit_payment_intent_id IS NOT NULL AND deposit_release_pending_at IS NULL;

CREATE INDEX reservations_deposit_check_after_idx
  ON public.reservations (deposit_check_after, id)
  WHERE deposit_payment_intent_id IS NOT NULL AND deposit_release_pending_at IS NULL;

CREATE FUNCTION public.seat_booked_party(
  p_restaurant_id uuid, p_reservation_id text, p_service_id text, p_table_ids uuid[],
  p_seated_at timestamptz, p_estimated_departure timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  booking public.reservations%ROWTYPE;
  existing_service public.service_records%ROWTYPE;
  -- service_records stores table numbers as text, including existing rows.
  chosen_tables text[];
  tables_available boolean;
BEGIN
  -- A repeat seating request reuses the first service record.
  SELECT * INTO booking FROM public.reservations r
   WHERE r.restaurant_id = p_restaurant_id AND r.reservation_id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  IF booking.deposit_capture_started_at > statement_timestamp() - interval '2 minutes' THEN
    RETURN jsonb_build_object('state', 'capture_in_progress');
  END IF;
  IF booking.status NOT IN ('confirmed', 'pending', 'waitlist', 'no-show', 'no_show', 'seated') THEN
    RETURN jsonb_build_object('state', 'invalid_status');
  END IF;
  SELECT * INTO existing_service FROM public.service_records s
   WHERE s.restaurant_id = p_restaurant_id AND s.reservation_id = p_reservation_id
     AND s.status = 'active' ORDER BY s.seated_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.reservations SET status = 'seated', checked_in_at = coalesce(checked_in_at, existing_service.seated_at)
     WHERE id = booking.id;
    RETURN jsonb_build_object('state', 'seated', 'reservation_id', booking.id,
      'service_id', existing_service.service_id, 'estimated_departure', existing_service.estimated_departure,
      'table_ids', (SELECT coalesce(jsonb_agg(t.id ORDER BY t.id), '[]'::jsonb) FROM public.tables t
                     WHERE t.restaurant_id = p_restaurant_id AND t.table_number::text = ANY(existing_service.table_ids)));
  END IF;
  IF booking.status = 'seated' OR booking.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('state', 'invalid_status');
  END IF;

  SELECT array_agg(t.table_number::text ORDER BY t.id), bool_and(t.status = 'available' AND t.is_active IS TRUE)
    INTO chosen_tables, tables_available
    FROM (SELECT id, table_number, status, is_active FROM public.tables
           WHERE restaurant_id = p_restaurant_id AND id = ANY(p_table_ids) ORDER BY id FOR UPDATE) t;
  IF tables_available IS DISTINCT FROM true OR cardinality(chosen_tables) <> cardinality(p_table_ids) THEN
    RETURN jsonb_build_object('state', 'tables_unavailable');
  END IF;

  INSERT INTO public.service_records (restaurant_id, service_id, reservation_id, customer_name, customer_phone,
    party_size, table_ids, seated_at, estimated_departure, special_requests, status)
  VALUES (p_restaurant_id, p_service_id, p_reservation_id, booking.customer_name, booking.customer_phone,
    booking.party_size, chosen_tables, p_seated_at, p_estimated_departure, booking.special_requests, 'active');

  UPDATE public.tables SET status = 'occupied', current_service_id = NULL
   WHERE restaurant_id = p_restaurant_id AND id = ANY(p_table_ids);
  UPDATE public.reservations SET status = 'seated', checked_in_at = p_seated_at WHERE id = booking.id;

  RETURN jsonb_build_object('state', 'seated', 'reservation_id', booking.id, 'service_id', p_service_id,
    'estimated_departure', p_estimated_departure, 'table_ids', to_jsonb(p_table_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.seat_booked_party(uuid, text, text, uuid[], timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seat_booked_party(uuid, text, text, uuid[], timestamptz, timestamptz) TO service_role;

CREATE FUNCTION public.list_no_show_reservation_deposits(p_restaurant_id uuid)
RETURNS TABLE (
  reservation_id text, customer_name text, date date, "time" time without time zone,
  deposit_amount numeric, deposit_currency text, deposit_state text, deposit_outstanding_amount numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT r.reservation_id::text, r.customer_name::text, r.date, r.time, r.deposit_amount, r.deposit_currency::text,
         CASE WHEN r.deposit_captured_payment_intent_id IS NOT NULL THEN 'captured'
              WHEN r.deposit_payment_intent_id IS NOT NULL THEN 'held'
              ELSE 'expired' END,
         CASE WHEN r.deposit_captured_payment_intent_id IS NOT NULL
              THEN r.deposit_amount - coalesce(r.deposit_refunded_amount, 0) END
    FROM public.reservations r
   WHERE r.restaurant_id = p_restaurant_id AND r.checked_in_at IS NULL
     AND r.status IN ('no-show', 'no_show')
     AND ((r.deposit_payment_intent_id IS NOT NULL AND r.deposit_release_pending_at IS NULL)
       OR (r.deposit_captured_payment_intent_id IS NOT NULL AND r.deposit_amount > coalesce(r.deposit_refunded_amount, 0))
       OR r.deposit_authorization_expired_at >= statement_timestamp() - interval '7 days')
   ORDER BY (r.deposit_payment_intent_id IS NOT NULL OR r.deposit_captured_payment_intent_id IS NOT NULL) DESC,
            r.date DESC, r.time DESC, r.id
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.list_no_show_reservation_deposits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_no_show_reservation_deposits(uuid) TO service_role;

CREATE INDEX reservations_no_show_deposits_by_restaurant_idx
  ON public.reservations (restaurant_id, date DESC, time DESC, id)
  WHERE checked_in_at IS NULL AND status IN ('no-show', 'no_show')
    AND (deposit_payment_intent_id IS NOT NULL OR deposit_captured_payment_intent_id IS NOT NULL OR
         deposit_authorization_expired_at IS NOT NULL);
