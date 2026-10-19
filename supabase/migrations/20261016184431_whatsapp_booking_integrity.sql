-- Admit WhatsApp bookings inside one PostgreSQL transaction. The caller is the
-- signed provider webhook, running with the service-role key; never expose this
-- function to a browser role. Other booking channels must join this admission
-- contract before capacity can be guaranteed across channels.
CREATE OR REPLACE FUNCTION public.book_whatsapp_reservation(
  p_restaurant_id uuid,
  p_external_id text,
  p_reservation_id text,
  p_date date,
  p_time time without time zone,
  p_party_size integer,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_special_requests text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_config restaurant.restaurant_config%ROWTYPE;
  v_existing public.reservations%ROWTYPE;
  v_created public.reservations%ROWTYPE;
  v_capacity integer;
  v_reserved integer;
  v_duration integer;
  v_start timestamp without time zone;
  v_day_date date;
  v_day_hours jsonb;
  v_open_text text;
  v_close_text text;
  v_open timestamp without time zone;
  v_close timestamp without time zone;
  v_open_at_requested_time boolean := false;
  v_inside_hours boolean := false;
BEGIN
  IF p_restaurant_id IS NULL
    OR p_external_id IS NULL OR p_external_id !~ '^wa:v1:[0-9a-f]{64}$'
    OR nullif(btrim(p_reservation_id), '') IS NULL OR length(p_reservation_id) > 120
    OR p_date IS NULL OR p_time IS NULL
    OR p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 100
    OR nullif(btrim(p_customer_name), '') IS NULL OR length(p_customer_name) > 255
    OR nullif(btrim(p_customer_phone), '') IS NULL OR length(p_customer_phone) > 40
    OR length(coalesce(p_special_requests, '')) > 1000
  THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  -- Serializes all WhatsApp admissions for this restaurant. A row lock, rather
  -- than a read-then-insert in JavaScript, survives concurrent Vercel functions.
  SELECT c.* INTO v_config
    FROM restaurant.restaurant_config AS c
   WHERE c.id = p_restaurant_id AND c.is_active = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'restaurant_unavailable');
  END IF;

  -- A replay of a committed intent must be resolved *before* availability:
  -- the booking itself may have filled the final seats.
  SELECT r.* INTO v_existing
    FROM public.reservations AS r
   WHERE r.restaurant_id = p_restaurant_id
     AND r.source = 'whatsapp_ai'
     AND r.external_id = p_external_id
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.status = 'cancelled' THEN
      RETURN jsonb_build_object('status', 'cancelled_intent');
    END IF;
    RETURN jsonb_build_object('status', 'existing', 'reservation_id', v_existing.reservation_id,
      'date', v_existing.date, 'time', to_char(v_existing.time, 'HH24:MI'),
      'party_size', v_existing.party_size, 'customer_name', v_existing.customer_name);
  END IF;

  -- A customer can explicitly repeat the same request in another message.
  -- Return their active booking, but allow a new one after cancellation.
  SELECT r.* INTO v_existing
    FROM public.reservations AS r
   WHERE r.restaurant_id = p_restaurant_id
     AND r.source = 'whatsapp_ai'
     AND r.customer_phone = p_customer_phone
     AND r.date = p_date AND r.time = p_time
     AND r.party_size = p_party_size
     AND lower(btrim(r.customer_name)) = lower(btrim(p_customer_name))
     AND r.status IN ('confirmed', 'seated')
   ORDER BY r.created_at DESC NULLS LAST, r.id DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'existing', 'reservation_id', v_existing.reservation_id,
      'date', v_existing.date, 'time', to_char(v_existing.time, 'HH24:MI'),
      'party_size', v_existing.party_size, 'customer_name', v_existing.customer_name);
  END IF;

  v_start := p_date + p_time;
  IF v_start < (now() AT TIME ZONE v_config.timezone) THEN
    RETURN jsonb_build_object('status', 'past_slot');
  END IF;
  IF coalesce(v_config.reservation_settings->>'advance_booking_days', '') ~ '^[0-9]{1,5}$'
    AND p_date > (now() AT TIME ZONE v_config.timezone)::date
      + (v_config.reservation_settings->>'advance_booking_days')::integer
  THEN
    RETURN jsonb_build_object('status', 'too_far');
  END IF;

  -- Check this day's service, plus an overnight service opened yesterday.
  FOR v_day_date IN SELECT p_date UNION ALL SELECT p_date - 1 LOOP
    IF jsonb_typeof(v_config.business_hours) = 'array' THEN
      SELECT value INTO v_day_hours
        FROM jsonb_array_elements(v_config.business_hours) AS value
       WHERE lower(value->>'day') = lower(btrim(to_char(v_day_date, 'Day')))
       LIMIT 1;
    ELSE
      v_day_hours := v_config.business_hours -> lower(btrim(to_char(v_day_date, 'Day')));
    END IF;
    v_open_text := coalesce(v_day_hours->>'open_time', v_day_hours->>'open',
      v_day_hours #>> '{periods,0,open}');
    v_close_text := coalesce(v_day_hours->>'close_time', v_day_hours->>'close',
      v_day_hours #>> '{periods,-1,close}');
    IF jsonb_typeof(v_day_hours) <> 'object'
      OR coalesce(v_day_hours->>'is_open', 'true') = 'false'
      OR coalesce(v_open_text, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      OR coalesce(v_close_text, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    THEN
      CONTINUE;
    END IF;
    v_open := v_day_date + v_open_text::time;
    v_close := v_day_date + v_close_text::time;
    IF v_close <= v_open THEN v_close := v_close + interval '1 day'; END IF;
    IF v_start >= v_open AND v_start < v_close THEN
      v_inside_hours := true;
    END IF;
    -- Match the existing reservation validator's last-seating rule.
    IF v_start >= v_open AND v_start + interval '90 minutes' <= v_close THEN
      v_open_at_requested_time := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT v_open_at_requested_time THEN
    RETURN jsonb_build_object('status', CASE WHEN v_inside_hours THEN 'too_late' ELSE 'outside_hours' END);
  END IF;

  IF coalesce(v_config.reservation_settings->>'max_party_size', '') ~ '^[0-9]+$'
    AND p_party_size > (v_config.reservation_settings->>'max_party_size')::integer
  THEN
    RETURN jsonb_build_object('status', 'party_too_large');
  END IF;

  SELECT coalesce(sum(t.capacity), 0)::integer INTO v_capacity
    FROM public.tables AS t
   WHERE t.restaurant_id = p_restaurant_id AND t.is_active = true;
  IF v_capacity = 0 OR p_party_size > v_capacity THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  v_duration := greatest(30, least(coalesce(v_config.average_dining_duration_minutes, 90), 360));
  SELECT coalesce(sum(r.party_size), 0)::integer INTO v_reserved
    FROM public.reservations AS r
   WHERE r.restaurant_id = p_restaurant_id
     AND r.status IN ('confirmed', 'seated')
     AND r.date BETWEEN p_date - 1 AND p_date + 1
     AND (r.date + r.time) < v_start + v_duration * interval '1 minute'
     AND (r.date + r.time) + v_duration * interval '1 minute' > v_start;
  IF v_reserved + p_party_size > v_capacity THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  BEGIN
    INSERT INTO public.reservations (
      reservation_id, restaurant_id, external_id, source,
      date, time, party_size, customer_name, customer_phone,
      customer_email, special_requests, status
    ) VALUES (
      p_reservation_id, p_restaurant_id, p_external_id, 'whatsapp_ai',
      p_date, p_time, p_party_size, btrim(p_customer_name), p_customer_phone,
      nullif(btrim(p_customer_email), ''), coalesce(p_special_requests, ''), 'confirmed'
    ) RETURNING * INTO v_created;
  EXCEPTION WHEN unique_violation THEN
    SELECT r.* INTO v_existing FROM public.reservations AS r
     WHERE r.restaurant_id = p_restaurant_id AND r.source = 'whatsapp_ai'
       AND r.external_id = p_external_id LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF;
    RETURN jsonb_build_object('status', 'existing', 'reservation_id', v_existing.reservation_id,
      'date', v_existing.date, 'time', to_char(v_existing.time, 'HH24:MI'),
      'party_size', v_existing.party_size, 'customer_name', v_existing.customer_name);
  END;

  RETURN jsonb_build_object('status', 'created', 'reservation_id', v_created.reservation_id,
    'date', v_created.date, 'time', to_char(v_created.time, 'HH24:MI'),
    'party_size', v_created.party_size, 'customer_name', v_created.customer_name);
END;
$$;

-- Functions in the exposed public schema receive EXECUTE for PUBLIC by default.
-- Keep this service-role-only even if project default grants are permissive.
REVOKE ALL ON FUNCTION public.book_whatsapp_reservation(
  uuid, text, text, date, time without time zone, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_whatsapp_reservation(
  uuid, text, text, date, time without time zone, integer, text, text, text, text
) TO service_role;
