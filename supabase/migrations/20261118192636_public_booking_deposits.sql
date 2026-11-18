ALTER TABLE public.reservations ADD COLUMN deposit_currency text
  CHECK (deposit_currency ~ '^[a-z]{3}$');

-- Keep the quote and the consumed Stripe intent after capture, release or a
-- reservation deletion, when the dashboard no longer has an active hold.
CREATE TABLE public.public_booking_deposits (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  booking_date date NOT NULL,
  booking_time time NOT NULL,
  party_size integer NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  guest_fingerprint text NOT NULL CHECK (guest_fingerprint ~ '^[0-9a-f]{64}$'),
  policy jsonb NOT NULL,
  country text,
  intent_id text UNIQUE NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  destination text,
  expires_at timestamptz NOT NULL,
  cleanup_after timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'attached', 'release_pending', 'released')),
  reservation_id uuid UNIQUE,
  refusal text,
  CHECK ((state = 'attached') = (reservation_id IS NOT NULL)),
  CHECK ((state IN ('release_pending', 'released')) = (refusal IS NOT NULL))
);

ALTER TABLE public.public_booking_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_booking_deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.public_booking_deposits TO service_role;
CREATE INDEX public_booking_deposits_cleanup_idx ON public.public_booking_deposits (cleanup_after)
  WHERE state IN ('open', 'release_pending');

CREATE FUNCTION public.book_portal_reservation(
  p_restaurant_id uuid,
  p_reservation_id text,
  p_date date,
  p_time time,
  p_party_size integer,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_special_requests text,
  p_quote_id uuid DEFAULT NULL,
  p_guest_fingerprint text DEFAULT NULL,
  p_authorized_intent text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_config restaurant.restaurant_config%ROWTYPE;
  v_quote public.public_booking_deposits%ROWTYPE;
  v_existing public.reservations%ROWTYPE;
  v_booking jsonb;
  v_status text;
BEGIN
  -- Same lock order as all guest booking functions. The nested booking call
  -- takes this lock again and uses the same transaction for the insert.
  SELECT * INTO v_config FROM restaurant.restaurant_config
   WHERE id = p_restaurant_id AND is_active AND onboarding_completed FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'restaurant_unavailable');
  END IF;

  IF p_quote_id IS NULL THEN
    IF v_config.deposit_config->'enabled' = 'true'::jsonb THEN
      RETURN jsonb_build_object('status', 'deposit_required');
    END IF;
    RETURN public.book_guest_reservation(p_restaurant_id, 'online_portal', NULL,
      p_reservation_id, p_date, p_time, p_party_size, p_customer_name, p_customer_phone,
      p_customer_email, p_special_requests);
  END IF;

  SELECT * INTO v_quote FROM public.public_booking_deposits
    WHERE id = p_quote_id AND restaurant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND OR v_quote.booking_date IS DISTINCT FROM p_date
    OR v_quote.booking_time IS DISTINCT FROM p_time
    OR v_quote.party_size IS DISTINCT FROM p_party_size
    OR v_quote.guest_fingerprint IS DISTINCT FROM p_guest_fingerprint THEN
    RETURN jsonb_build_object('status', 'deposit_invalid');
  END IF;

  IF v_quote.state = 'attached' THEN
    SELECT * INTO v_existing FROM public.reservations
      WHERE id = v_quote.reservation_id AND restaurant_id = p_restaurant_id;
    IF NOT FOUND OR v_existing.status = 'cancelled' THEN
      RETURN jsonb_build_object('status', 'deposit_consumed');
    END IF;
    RETURN jsonb_build_object('status', 'existing', 'id', v_existing.id,
      'reservation_id', v_existing.reservation_id, 'date', v_existing.date,
      'time', to_char(v_existing.time, 'HH24:MI'), 'party_size', v_existing.party_size,
      'customer_name', v_existing.customer_name, 'reservation_status', v_existing.status);
  END IF;
  IF v_quote.state = 'release_pending' THEN
    RETURN jsonb_build_object('status', v_quote.refusal, 'release_intent', v_quote.intent_id);
  END IF;
  IF v_quote.state = 'released' THEN
    RETURN jsonb_build_object('status', 'deposit_closed');
  END IF;
  IF v_quote.intent_id IS DISTINCT FROM p_authorized_intent THEN
    RETURN jsonb_build_object('status', 'deposit_invalid');
  END IF;

  IF v_quote.expires_at <= clock_timestamp()
    OR v_quote.policy IS DISTINCT FROM v_config.deposit_config
    OR v_quote.country IS DISTINCT FROM v_config.country::text THEN
    v_booking := jsonb_build_object('status', 'deposit_quote_changed');
  ELSE
    v_booking := public.book_guest_reservation(p_restaurant_id, 'online_portal', NULL,
      p_reservation_id, p_date, p_time, p_party_size, p_customer_name, p_customer_phone,
      p_customer_email, p_special_requests, NULL, NULL, v_quote.intent_id, v_quote.amount_minor / 100.0);
  END IF;
  v_status := v_booking->>'status';
  IF v_status = 'created' THEN
    UPDATE public.reservations SET deposit_currency = v_quote.currency
      WHERE id = (v_booking->>'id')::uuid AND restaurant_id = p_restaurant_id;
    UPDATE public.public_booking_deposits
       SET state = 'attached', reservation_id = (v_booking->>'id')::uuid
     WHERE id = p_quote_id;
  ELSIF v_status IN ('deposit_quote_changed', 'unavailable', 'past_slot', 'too_soon',
      'too_far', 'outside_hours', 'too_late', 'party_too_large', 'invalid_input', 'timezone_unavailable') THEN
    UPDATE public.public_booking_deposits
      SET state = 'release_pending', refusal = v_status, cleanup_after = clock_timestamp()
      WHERE id = p_quote_id;
    v_booking := v_booking || jsonb_build_object('release_intent', v_quote.intent_id);
  END IF;
  RETURN v_booking;
END;
$$;

REVOKE ALL ON FUNCTION public.book_portal_reservation(uuid,text,date,time,integer,text,text,text,text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_portal_reservation(uuid,text,date,time,integer,text,text,text,text,uuid,text,text)
  TO service_role;

CREATE FUNCTION public.abandon_public_booking_deposit(p_id uuid, p_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_state text;
BEGIN
  SELECT state INTO v_state FROM public.public_booking_deposits
    WHERE id = p_id AND restaurant_id = p_restaurant_id FOR UPDATE;
  IF v_state = 'open' THEN
    UPDATE public.public_booking_deposits
       SET state = 'release_pending', refusal = 'deposit_closed', cleanup_after = clock_timestamp()
     WHERE id = p_id;
    v_state := 'release_pending';
  END IF;
  RETURN jsonb_build_object('status', coalesce(v_state, 'invalid'));
END;
$$;

-- A crashed worker leaves the row recoverable. An attachment and a cleanup
-- lease both lock the quote, so the Stripe cancel step can only see losers.
CREATE FUNCTION public.claim_public_booking_deposit_cleanup()
RETURNS TABLE (id uuid, restaurant_id uuid, intent_id text)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH due AS (
    SELECT q.id FROM public.public_booking_deposits q
    WHERE q.state IN ('open', 'release_pending') AND q.cleanup_after <= now()
      AND (q.state = 'release_pending' OR q.expires_at <= now())
    ORDER BY q.cleanup_after
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.public_booking_deposits q
     SET state = 'release_pending', refusal = coalesce(q.refusal, 'deposit_closed'),
         cleanup_after = now() + interval '1 hour'
    FROM due
    WHERE q.id = due.id
    RETURNING q.id, q.restaurant_id, q.intent_id;
$$;

REVOKE ALL ON FUNCTION public.abandon_public_booking_deposit(uuid, uuid),
  public.claim_public_booking_deposit_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abandon_public_booking_deposit(uuid, uuid),
  public.claim_public_booking_deposit_cleanup() TO service_role;
