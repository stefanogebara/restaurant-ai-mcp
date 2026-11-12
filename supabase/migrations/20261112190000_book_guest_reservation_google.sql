-- Google Booking (Reserve with Google, api/google-booking/server.js) joins the
-- shared admission rule of book_guest_reservation (20261112150000). Before this,
-- its CreateBooking ran a plain INSERT without hours or seats, read the slot in
-- UTC, and never set reservation_id (NOT NULL), so every booking failed; its
-- UpdateBooking moved any reservation by id. Repro:
-- scripts/auditoria-reservas/r5-google-parceiros.cjs.
--
-- Same signature and result as before, so the code already live keeps working.
-- Changes: 'google' is an accepted source, with the retry key
-- 'google:v1:<sha256 of the idempotency_token>'; a replayed key whose booking
-- was cancelled also returns the row id.
--
-- The partner webhook (api/external-booking-webhook.js) stays outside on
-- purpose: it imports bookings already confirmed on OpenTable, Resy and similar,
-- which must be recorded, not refused. Its plain INSERT still waits for this
-- function's FOR UPDATE and is counted by it.
CREATE OR REPLACE FUNCTION public.book_guest_reservation(
  p_restaurant_id uuid,
  p_source text,
  p_external_id text,
  p_reservation_id text,
  p_date date,
  p_time time without time zone,
  p_party_size integer,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text DEFAULT NULL,
  p_special_requests text DEFAULT NULL,
  p_table_ids text[] DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_deposit_payment_intent_id text DEFAULT NULL,
  p_deposit_amount numeric DEFAULT NULL
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
  v_tables text[] := coalesce(p_table_ids, '{}'::text[]);
  v_table_count integer;
  v_table_seats integer;
  v_capacity integer;
  v_reserved integer;
  v_duration integer;
  v_start timestamp without time zone;
  v_day date;
  v_hours jsonb;
  v_periods jsonb;
  v_period jsonb;
  v_open_text text;
  v_close_text text;
  v_open timestamp without time zone;
  v_close timestamp without time zone;
  v_inside boolean := false;
  v_admitted boolean := false;
BEGIN
  IF p_restaurant_id IS NULL
    OR p_source IS NULL OR p_source NOT IN ('whatsapp_ai', 'voice_ai', 'online_portal', 'google')
    -- Each channel's retry key: WhatsApp always has one, voice has one per
    -- verified call, Google one per idempotency_token (hashed, so its charset
    -- never matters), the booking page has none yet.
    OR (p_source = 'whatsapp_ai' AND (p_external_id IS NULL OR p_external_id !~ '^wa:v1:[0-9a-f]{64}$'))
    OR (p_source = 'voice_ai' AND p_external_id IS NOT NULL AND p_external_id !~ '^voice:[A-Za-z0-9_-]{6,128}$')
    OR (p_source = 'online_portal' AND p_external_id IS NOT NULL)
    OR (p_source = 'google' AND p_external_id IS NOT NULL AND p_external_id !~ '^google:v1:[0-9a-f]{64}$')
    OR nullif(btrim(p_reservation_id), '') IS NULL OR length(p_reservation_id) > 120
    OR p_date IS NULL OR p_time IS NULL
    OR p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 100
    OR nullif(btrim(p_customer_name), '') IS NULL OR length(p_customer_name) > 255
    OR nullif(btrim(p_customer_phone), '') IS NULL OR length(p_customer_phone) > 40
    OR length(coalesce(p_customer_email, '')) > 320
    OR length(coalesce(p_special_requests, '')) > 1000
    OR length(coalesce(p_notes, '')) > 500
    OR length(coalesce(p_deposit_payment_intent_id, '')) > 255
    OR p_deposit_amount < 0
    OR cardinality(v_tables) > 3
    OR array_position(v_tables, NULL) IS NOT NULL
    OR cardinality(v_tables) <> (SELECT count(DISTINCT id) FROM unnest(v_tables) AS ids(id))
  THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  -- Serializes every guest booking for this restaurant (same lock order as
  -- mutate_guest_reservation: the restaurant row first).
  SELECT c.* INTO v_config
    FROM restaurant.restaurant_config AS c
   WHERE c.id = p_restaurant_id AND c.is_active = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'restaurant_unavailable');
  END IF;

  -- A replay of a committed intent is resolved *before* availability: the
  -- booking itself may have filled the final seats.
  IF p_external_id IS NOT NULL THEN
    SELECT r.* INTO v_existing
      FROM public.reservations AS r
     WHERE r.restaurant_id = p_restaurant_id
       AND r.source = p_source
       AND r.external_id = p_external_id
     LIMIT 1;
    IF FOUND THEN
      IF v_existing.status = 'cancelled' THEN
        RETURN jsonb_build_object('status', 'cancelled_intent', 'id', v_existing.id,
          'reservation_id', v_existing.reservation_id);
      END IF;
      RETURN jsonb_build_object('status', 'existing', 'id', v_existing.id, 'reservation_id', v_existing.reservation_id,
        'date', v_existing.date, 'time', to_char(v_existing.time, 'HH24:MI'),
        'party_size', v_existing.party_size, 'customer_name', v_existing.customer_name);
    END IF;
  END IF;

  -- WhatsApp only (unchanged): a guest can repeat the same request in another
  -- message. Return their active booking, but allow a new one after cancellation.
  IF p_source = 'whatsapp_ai' THEN
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
      RETURN jsonb_build_object('status', 'existing', 'id', v_existing.id, 'reservation_id', v_existing.reservation_id,
        'date', v_existing.date, 'time', to_char(v_existing.time, 'HH24:MI'),
        'party_size', v_existing.party_size, 'customer_name', v_existing.customer_name);
    END IF;
  END IF;

  -- Date and time are wall times in the restaurant's zone.
  IF v_config.timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_config.timezone
  ) THEN
    RETURN jsonb_build_object('status', 'timezone_unavailable');
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

  -- This day's service, plus an overnight service opened yesterday. Each split
  -- service period is checked on its own; the last seating is 90 minutes
  -- before close (the rule of the JavaScript validator).
  FOR v_day IN SELECT p_date UNION ALL SELECT p_date - 1 LOOP
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
    RETURN jsonb_build_object('status', CASE WHEN v_inside THEN 'too_late' ELSE 'outside_hours' END);
  END IF;

  IF coalesce(v_config.reservation_settings->>'max_party_size', '') ~ '^[0-9]{1,5}$'
    AND p_party_size > (v_config.reservation_settings->>'max_party_size')::integer
  THEN
    RETURN jsonb_build_object('status', 'party_too_large');
  END IF;

  -- Aggregate seats: every seat-holding booking from every channel, with or
  -- without a table, overlapping the sitting (previous, same and next day).
  SELECT coalesce(sum(t.capacity), 0)::integer INTO v_capacity
    FROM public.tables AS t
   WHERE t.restaurant_id = p_restaurant_id AND t.is_active = true;
  v_duration := greatest(30, least(coalesce(v_config.average_dining_duration_minutes, 90), 360));
  SELECT coalesce(sum(r.party_size), 0)::integer INTO v_reserved
    FROM public.reservations AS r
   WHERE r.restaurant_id = p_restaurant_id
     AND lower(r.status) IN ('confirmed', 'seated', 'pending')
     AND r.date BETWEEN p_date - 1 AND p_date + 1
     AND (r.date + r.time) < v_start + v_duration * interval '1 minute'
     AND (r.date + r.time) + v_duration * interval '1 minute' > v_start;
  IF v_capacity <= 0 OR v_reserved + p_party_size > v_capacity THEN
    RETURN jsonb_build_object('status', 'unavailable',
      'seats_available', greatest(0, v_capacity - v_reserved));
  END IF;

  -- Tables the caller chose (voice) outside this lock. They must still exist,
  -- be active, seat the party and be free for the whole sitting; otherwise the
  -- caller chooses again with fresh data. Hold their metadata until commit.
  IF cardinality(v_tables) > 0 THEN
    PERFORM 1 FROM public.tables AS t
      WHERE t.restaurant_id = p_restaurant_id AND t.id::text = ANY(v_tables)
      ORDER BY t.id FOR SHARE;
    SELECT count(*)::integer, coalesce(sum(t.capacity), 0)::integer INTO v_table_count, v_table_seats
      FROM public.tables AS t
     WHERE t.restaurant_id = p_restaurant_id AND t.is_active = true
       AND t.capacity > 0 AND t.id::text = ANY(v_tables);
    IF v_table_count <> cardinality(v_tables) OR v_table_seats < p_party_size
      OR EXISTS (SELECT 1 FROM public.reservations AS r
        WHERE r.restaurant_id = p_restaurant_id
          AND lower(r.status) IN ('confirmed', 'seated', 'pending')
          AND r.date BETWEEN p_date - 1 AND p_date + 1
          AND (r.date + r.time) < v_start + v_duration * interval '1 minute'
          AND (r.date + r.time) + v_duration * interval '1 minute' > v_start
          AND r.table_ids::text[] && v_tables)
    THEN
      RETURN jsonb_build_object('status', 'table_taken');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.reservations (
      reservation_id, restaurant_id, external_id, source,
      date, time, party_size, customer_name, customer_phone,
      customer_email, special_requests, status, table_ids, notes,
      deposit_payment_intent_id, deposit_amount
    ) VALUES (
      p_reservation_id, p_restaurant_id, p_external_id, p_source,
      p_date, p_time, p_party_size, btrim(p_customer_name), p_customer_phone,
      nullif(btrim(p_customer_email), ''), p_special_requests, 'confirmed', p_table_ids, p_notes,
      nullif(btrim(p_deposit_payment_intent_id), ''), p_deposit_amount
    ) RETURNING * INTO v_created;
  EXCEPTION WHEN unique_violation THEN
    IF p_external_id IS NULL THEN RAISE; END IF;
    SELECT r.* INTO v_existing FROM public.reservations AS r
     WHERE r.restaurant_id = p_restaurant_id AND r.source = p_source
       AND r.external_id = p_external_id LIMIT 1;
    IF NOT FOUND THEN RAISE; END IF;
    RETURN jsonb_build_object('status', 'existing', 'id', v_existing.id, 'reservation_id', v_existing.reservation_id,
      'date', v_existing.date, 'time', to_char(v_existing.time, 'HH24:MI'),
      'party_size', v_existing.party_size, 'customer_name', v_existing.customer_name);
  END;

  RETURN jsonb_build_object('status', 'created', 'id', v_created.id, 'reservation_id', v_created.reservation_id,
    'date', v_created.date, 'time', to_char(v_created.time, 'HH24:MI'),
    'party_size', v_created.party_size, 'customer_name', v_created.customer_name,
    'reservation_status', v_created.status, 'table_ids', to_jsonb(v_created.table_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.book_guest_reservation(
  uuid, text, text, text, date, time without time zone, integer, text, text, text, text, text[], text, text, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_guest_reservation(
  uuid, text, text, text, date, time without time zone, integer, text, text, text, text, text[], text, text, numeric
) TO service_role;
