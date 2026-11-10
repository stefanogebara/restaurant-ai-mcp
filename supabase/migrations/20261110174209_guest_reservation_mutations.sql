-- Service adapters supply the verified tenant, transport phone and exact full
-- reservation code. Never expose this RPC to browser roles. Lock order matches
-- book_whatsapp_reservation: restaurant first, then the owned reservation.
CREATE OR REPLACE FUNCTION public.mutate_guest_reservation(
  p_restaurant_id uuid, p_customer_phone text, p_reservation_id text,
  p_action text, p_changes jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_config restaurant.restaurant_config%ROWTYPE;
  v_row public.reservations%ROWTYPE;
  v_error text;
  v_changed boolean := false;
  v_date date;
  v_time time without time zone;
  v_party integer;
  v_start timestamp without time zone;
  v_day date;
  v_hours jsonb;
  v_period jsonb;
  v_periods jsonb;
  v_open_text text;
  v_close_text text;
  v_open timestamp without time zone;
  v_close timestamp without time zone;
  v_inside boolean := false;
  v_admitted boolean := false;
  v_capacity bigint;
  v_reserved bigint;
  v_duration integer;
BEGIN
  <<work>>
  BEGIN
    IF p_restaurant_id IS NULL OR p_customer_phone IS NULL
      OR p_customer_phone !~ '^[1-9][0-9]{7,14}$'
      OR nullif(p_reservation_id, '') IS NULL OR length(p_reservation_id) > 120
      OR p_reservation_id ~ '[[:space:]]'
    THEN v_error := 'verification_failed'; EXIT work; END IF;
    -- Check type separately: planner evaluation order must not allow
    -- jsonb_object_keys to throw for a scalar or array from a direct caller.
    IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
      v_error := 'invalid_input'; EXIT work;
    END IF;
    IF p_action IS NULL OR p_action NOT IN ('verify', 'modify', 'cancel')
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_changes) AS k(key)
        WHERE k.key NOT IN ('date', 'time', 'party_size'))
      OR (p_action <> 'modify' AND p_changes <> '{}'::jsonb)
      OR (p_action = 'modify' AND p_changes = '{}'::jsonb)
    THEN v_error := 'invalid_input'; EXIT work; END IF;

    SELECT c.* INTO v_config FROM restaurant.restaurant_config c
      WHERE c.id = p_restaurant_id AND c.is_active = true FOR UPDATE;
    IF NOT FOUND THEN v_error := 'restaurant_unavailable'; EXIT work; END IF;

    BEGIN
      SELECT r.* INTO STRICT v_row FROM public.reservations r
        WHERE r.restaurant_id = p_restaurant_id AND r.reservation_id = p_reservation_id
          AND length(r.customer_phone) <= 40 AND r.customer_phone ~ '^\+?[0-9 ().-]+$'
          AND regexp_replace(r.customer_phone, '[^0-9]', '', 'g') = p_customer_phone
        FOR UPDATE;
    EXCEPTION WHEN no_data_found OR too_many_rows THEN
      v_error := 'verification_failed'; EXIT work;
    END;
    IF p_action = 'verify' THEN EXIT work; END IF;
    IF p_action = 'cancel' AND lower(v_row.status) = 'cancelled' THEN EXIT work; END IF;
    IF v_row.status IS NULL OR lower(v_row.status) NOT IN ('confirmed', 'pending') THEN
      v_error := 'invalid_status'; EXIT work;
    END IF;
    IF p_action = 'cancel' THEN
      UPDATE public.reservations SET status = 'cancelled', table_ids = '{}'
        WHERE id = v_row.id AND restaurant_id = p_restaurant_id RETURNING * INTO v_row;
      v_changed := true; EXIT work;
    END IF;

    v_date := v_row.date; v_time := v_row.time; v_party := v_row.party_size;
    IF p_changes ? 'date' THEN
      IF jsonb_typeof(p_changes->'date') IS DISTINCT FROM 'string'
        OR (p_changes->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN v_error := 'invalid_date'; EXIT work; END IF;
      BEGIN v_date := (p_changes->>'date')::date;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        v_error := 'invalid_date'; EXIT work;
      END;
    END IF;
    IF p_changes ? 'time' THEN
      IF jsonb_typeof(p_changes->'time') IS DISTINCT FROM 'string'
        OR length(p_changes->>'time') <> 5
        OR (p_changes->>'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      THEN v_error := 'invalid_time'; EXIT work; END IF;
      v_time := (p_changes->>'time')::time;
    END IF;
    IF p_changes ? 'party_size' THEN
      IF jsonb_typeof(p_changes->'party_size') NOT IN ('number', 'string')
        OR coalesce(p_changes->>'party_size', '') !~ '^[0-9]{1,3}$'
      THEN v_error := 'invalid_party_size'; EXIT work; END IF;
      v_party := (p_changes->>'party_size')::integer;
      IF v_party < 1 OR v_party > 100 THEN
        v_error := 'invalid_party_size'; EXIT work;
      END IF;
    END IF;
    IF v_date IS NULL OR v_time IS NULL OR v_party IS NULL OR v_party < 1 OR v_party > 100 THEN
      v_error := 'invalid_input'; EXIT work;
    END IF;
    -- A retry of the committed change is a read-only success, even if the
    -- booking now occupies the last seats or its start time has since passed.
    IF v_date = v_row.date AND v_time = v_row.time AND v_party = v_row.party_size THEN EXIT work; END IF;
    IF v_config.timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_config.timezone
    ) THEN v_error := 'timezone_unavailable'; EXIT work; END IF;
    v_start := v_date + v_time;
    IF v_start < (now() AT TIME ZONE v_config.timezone) THEN v_error := 'past_slot'; EXIT work; END IF;
    IF coalesce(v_config.reservation_settings->>'advance_booking_days', '') ~ '^[0-9]{1,5}$'
      AND v_date > (now() AT TIME ZONE v_config.timezone)::date
        + (v_config.reservation_settings->>'advance_booking_days')::integer
    THEN v_error := 'too_far'; EXIT work; END IF;

    -- Date/time are local wall times, including services opened yesterday.
    -- Each split service period is checked separately; lunch gaps stay closed.
    FOR v_day IN SELECT v_date UNION ALL SELECT v_date - 1 LOOP
      v_hours := NULL;
      IF jsonb_typeof(v_config.business_hours) = 'array' THEN
        SELECT value INTO v_hours FROM jsonb_array_elements(v_config.business_hours) AS value
          WHERE lower(value->>'day') = lower(btrim(to_char(v_day, 'Day'))) LIMIT 1;
      ELSE
        v_hours := v_config.business_hours -> lower(btrim(to_char(v_day, 'Day')));
      END IF;
      IF jsonb_typeof(v_hours) IS DISTINCT FROM 'object'
        OR coalesce(v_hours->>'is_open', v_hours->>'isOpen', 'true') = 'false' THEN CONTINUE; END IF;
      v_periods := CASE WHEN jsonb_typeof(v_hours->'periods') = 'array'
        THEN v_hours->'periods' ELSE jsonb_build_array(v_hours) END;
      FOR v_period IN SELECT value FROM jsonb_array_elements(v_periods) AS value LOOP
        v_open_text := coalesce(v_period->>'open_time', v_period->>'open');
        v_close_text := coalesce(v_period->>'close_time', v_period->>'close');
        IF coalesce(v_open_text, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          OR coalesce(v_close_text, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN CONTINUE; END IF;
        v_open := v_day + v_open_text::time; v_close := v_day + v_close_text::time;
        IF v_close <= v_open THEN v_close := v_close + interval '1 day'; END IF;
        IF v_start >= v_open AND v_start < v_close THEN v_inside := true; END IF;
        IF v_start >= v_open AND v_start + interval '90 minutes' <= v_close THEN v_admitted := true; EXIT; END IF;
      END LOOP;
      IF v_admitted THEN EXIT; END IF;
    END LOOP;
    IF NOT v_admitted THEN
      v_error := CASE WHEN v_inside THEN 'too_late' ELSE 'outside_hours' END; EXIT work;
    END IF;
    IF coalesce(v_config.reservation_settings->>'max_party_size', '') ~ '^[0-9]{1,5}$'
      AND v_party > (v_config.reservation_settings->>'max_party_size')::integer
    THEN v_error := 'party_too_large'; EXIT work; END IF;

    SELECT coalesce(sum(t.capacity), 0) INTO v_capacity FROM public.tables t
      WHERE t.restaurant_id = p_restaurant_id AND t.is_active = true;
    v_duration := greatest(30, least(coalesce(v_config.average_dining_duration_minutes, 90), 360));
    SELECT coalesce(sum(r.party_size), 0) INTO v_reserved FROM public.reservations r
      WHERE r.restaurant_id = p_restaurant_id AND r.id <> v_row.id
        AND lower(r.status) IN ('confirmed', 'seated', 'pending')
        AND r.date BETWEEN v_date - 1 AND v_date + 1
        AND (r.date + r.time) < v_start + v_duration * interval '1 minute'
        AND (r.date + r.time) + v_duration * interval '1 minute' > v_start;
    IF v_capacity <= 0 OR v_reserved + v_party > v_capacity THEN v_error := 'unavailable'; EXIT work; END IF;

    -- Retain identity and guest data. Release stale table references; this
    -- aggregate-seat contract does not invent physical table combinations.
    UPDATE public.reservations SET date = v_date, time = v_time, party_size = v_party, table_ids = '{}'
      WHERE id = v_row.id AND restaurant_id = p_restaurant_id RETURNING * INTO v_row;
    v_changed := true;
  END work;

  IF v_error IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'changed', false, 'reservation', NULL,
      'error', jsonb_build_object('code', v_error));
  END IF;
  RETURN jsonb_build_object('success', true, 'changed', v_changed, 'error', NULL, 'reservation', jsonb_build_object(
    'id', v_row.id, 'reservation_id', v_row.reservation_id, 'restaurant_id', v_row.restaurant_id,
    'customer_name', v_row.customer_name, 'customer_phone', v_row.customer_phone,
    'date', v_row.date, 'time', to_char(v_row.time, 'HH24:MI'), 'party_size', v_row.party_size,
    'status', v_row.status, 'table_ids', coalesce(to_jsonb(v_row.table_ids), '[]'::jsonb),
    'special_requests', v_row.special_requests));
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_guest_reservation(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_guest_reservation(uuid, text, text, text, jsonb) TO service_role;
