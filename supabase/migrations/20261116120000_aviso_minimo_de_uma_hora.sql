-- One hour of notice, in the one slot rule.
--
-- Until 16/11/2026 a guest could not book less than an hour ahead only on the
-- booking page and on voice: the JavaScript validator they run before booking
-- refused it (TOO_SOON, min_advance_hours 1, never configured per restaurant).
-- WhatsApp, Google and this rule had no notice, so every availability answer
-- offered a time 30 minutes away; the page and voice then refused it, WhatsApp
-- and Google booked it. Repro: scripts/auditoria-reservas/r11-aviso-minimo.cjs.
--
-- guest_slot_status now answers 'too_soon' for a start less than 60 minutes
-- after now in the restaurant's zone (exactly 60 minutes is accepted, as in the
-- validator). book_guest_reservation, book_whatsapp_reservation and
-- check_guest_slots call it, so the booking and every availability answer
-- change together. Guest changes (mutate_guest_reservation) keep their own
-- checks and never had a notice. Same signature; service role only.
CREATE OR REPLACE FUNCTION public.guest_slot_status(
  p_config restaurant.restaurant_config,
  p_date date,
  p_time time without time zone,
  p_party_size integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
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
  -- Date and time are wall times in the restaurant's zone. An unknown zone
  -- makes AT TIME ZONE raise; reading pg_timezone_names instead cost ~20 ms a
  -- call (it lists every zone), too slow for a 500-slot availability check.
  IF p_config.timezone IS NULL THEN
    RETURN jsonb_build_object('status', 'timezone_unavailable');
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE p_config.timezone;
  EXCEPTION WHEN invalid_parameter_value THEN
    RETURN jsonb_build_object('status', 'timezone_unavailable');
  END;
  v_start := p_date + p_time;
  IF v_start < (now() AT TIME ZONE p_config.timezone) THEN
    RETURN jsonb_build_object('status', 'past_slot');
  END IF;
  -- One hour of notice before the start, on every guest channel.
  IF v_start < (now() AT TIME ZONE p_config.timezone) + interval '60 minutes' THEN
    RETURN jsonb_build_object('status', 'too_soon');
  END IF;
  IF coalesce(p_config.reservation_settings->>'advance_booking_days', '') ~ '^[0-9]{1,5}$'
    AND p_date > (now() AT TIME ZONE p_config.timezone)::date
      + (p_config.reservation_settings->>'advance_booking_days')::integer
  THEN
    RETURN jsonb_build_object('status', 'too_far');
  END IF;

  -- This day's service, plus an overnight service opened yesterday. Each split
  -- service period is checked on its own; the last seating is 90 minutes
  -- before close (the rule of the JavaScript validator).
  FOR v_day IN SELECT p_date UNION ALL SELECT p_date - 1 LOOP
    v_hours := NULL;
    IF jsonb_typeof(p_config.business_hours) = 'array' THEN
      SELECT value INTO v_hours FROM jsonb_array_elements(p_config.business_hours) AS value
        WHERE lower(value->>'day') = lower(btrim(to_char(v_day, 'Day'))) LIMIT 1;
    ELSE
      v_hours := p_config.business_hours -> lower(btrim(to_char(v_day, 'Day')));
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

  IF coalesce(p_config.reservation_settings->>'max_party_size', '') ~ '^[0-9]{1,5}$'
    AND p_party_size > (p_config.reservation_settings->>'max_party_size')::integer
  THEN
    RETURN jsonb_build_object('status', 'party_too_large');
  END IF;

  -- Aggregate seats: every seat-holding booking from every channel, with or
  -- without a table, overlapping the sitting (previous, same and next day).
  SELECT coalesce(sum(t.capacity), 0)::integer INTO v_capacity
    FROM public.tables AS t
   WHERE t.restaurant_id = p_config.id AND t.is_active = true;
  v_duration := greatest(30, least(coalesce(p_config.average_dining_duration_minutes, 90), 360));
  SELECT coalesce(sum(r.party_size), 0)::integer INTO v_reserved
    FROM public.reservations AS r
   WHERE r.restaurant_id = p_config.id
     AND lower(r.status) IN ('confirmed', 'seated', 'pending')
     AND r.date BETWEEN p_date - 1 AND p_date + 1
     AND (r.date + r.time) < v_start + v_duration * interval '1 minute'
     AND (r.date + r.time) + v_duration * interval '1 minute' > v_start;
  IF v_capacity <= 0 OR v_reserved + p_party_size > v_capacity THEN
    RETURN jsonb_build_object('status', 'unavailable',
      'seats_available', greatest(0, v_capacity - v_reserved));
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'seats_available', v_capacity - v_reserved);
END;
$$;

REVOKE ALL ON FUNCTION public.guest_slot_status(restaurant.restaurant_config, date, time without time zone, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_slot_status(restaurant.restaurant_config, date, time without time zone, integer)
  TO service_role;
