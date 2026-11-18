BEGIN;

-- Deliberately keep the attempt if its reservation is deleted. A late Checkout
-- completion still needs its original binding to release the authorization.
CREATE TABLE public.hosted_reservation_deposits (
  id uuid PRIMARY KEY,
  restaurant_id uuid NOT NULL,
  booking_id uuid NOT NULL,
  reservation_code text NOT NULL,
  booking_date date NOT NULL,
  booking_time time NOT NULL,
  party_size integer NOT NULL CHECK (party_size > 0),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  destination text,
  livemode boolean NOT NULL,
  expires_at bigint NOT NULL,
  checkout_params jsonb,
  checkout_session_id text UNIQUE,
  payment_intent_id text UNIQUE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'attached', 'release_pending', 'released')),
  superseded_at timestamptz,
  CHECK (state = 'pending' OR (checkout_session_id IS NOT NULL AND payment_intent_id IS NOT NULL))
);

CREATE UNIQUE INDEX hosted_reservation_deposits_pending
  ON public.hosted_reservation_deposits (restaurant_id, booking_id)
  WHERE state = 'pending' AND superseded_at IS NULL;

-- Existing deposit flows can attach intents outside this ledger. An indexed
-- lookup enables the orphan-release guard without scanning all reservations.
CREATE INDEX hosted_deposit_reservation_intent_lookup
  ON public.reservations (deposit_payment_intent_id) WHERE deposit_payment_intent_id IS NOT NULL;

ALTER TABLE public.hosted_reservation_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hosted_reservation_deposits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.hosted_reservation_deposits TO service_role;

CREATE FUNCTION public.begin_hosted_reservation_deposit(
  p_id uuid, p_restaurant_id uuid, p_booking_id uuid, p_reservation_code text,
  p_date date, p_time time, p_party_size integer, p_amount_minor integer,
  p_currency text, p_destination text, p_livemode boolean, p_expires_at bigint,
  p_checkout_params jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  booking public.reservations%ROWTYPE;
  attempt public.hosted_reservation_deposits%ROWTYPE;
BEGIN
  SELECT * INTO booking FROM public.reservations
   WHERE id = p_booking_id AND restaurant_id = p_restaurant_id
   FOR UPDATE;
  IF NOT FOUND OR booking.reservation_id IS DISTINCT FROM p_reservation_code THEN
    RETURN jsonb_build_object('result', 'missing');
  END IF;
  -- Capture intentionally keeps the positive amount for reporting.
  IF booking.deposit_payment_intent_id IS NOT NULL OR booking.deposit_amount > 0 THEN
    RETURN jsonb_build_object('result', 'already_requested');
  END IF;
  IF lower(booking.status) IS NULL OR lower(booking.status) NOT IN ('confirmed', 'pending')
     OR ROW(booking.date, booking.time, booking.party_size) IS DISTINCT FROM ROW(p_date, p_time, p_party_size) THEN
    RETURN jsonb_build_object('result', 'reservation_changed');
  END IF;

  SELECT * INTO attempt FROM public.hosted_reservation_deposits
   WHERE restaurant_id = p_restaurant_id AND booking_id = p_booking_id
     AND state = 'pending' AND superseded_at IS NULL;
  IF FOUND THEN
    IF attempt.livemode IS DISTINCT FROM p_livemode THEN
      RETURN jsonb_build_object('result', 'mode_mismatch');
    END IF;
    IF attempt.expires_at > extract(epoch FROM clock_timestamp())
       AND ROW(attempt.booking_date, attempt.booking_time, attempt.party_size) = ROW(p_date, p_time, p_party_size)
       AND attempt.reservation_code = p_reservation_code THEN
      RETURN jsonb_build_object('result', 'pending', 'attempt', to_jsonb(attempt));
    END IF;
    UPDATE public.hosted_reservation_deposits SET superseded_at = clock_timestamp(), checkout_params = NULL
     WHERE id = attempt.id;
  END IF;

  INSERT INTO public.hosted_reservation_deposits
    (id, restaurant_id, booking_id, reservation_code, booking_date, booking_time, party_size,
     amount_minor, currency, destination, livemode, expires_at, checkout_params)
  VALUES (p_id, p_restaurant_id, p_booking_id, p_reservation_code, p_date, p_time, p_party_size,
     p_amount_minor, p_currency, p_destination, p_livemode, p_expires_at, p_checkout_params)
  RETURNING * INTO attempt;

  RETURN jsonb_build_object('result', 'pending', 'attempt', to_jsonb(attempt));
END;
$$;

CREATE FUNCTION public.settle_hosted_reservation_deposit(
  p_id uuid, p_session_id text, p_intent_id text, p_authorized_at bigint,
  p_capture_before bigint, p_observation text
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  booking public.reservations%ROWTYPE;
  attempt public.hosted_reservation_deposits%ROWTYPE;
  matches_booking boolean;
BEGIN
  SELECT * INTO attempt FROM public.hosted_reservation_deposits WHERE id = p_id;
  IF NOT FOUND THEN RETURN 'missing'; END IF;

  -- Lock in the same order as begin. A reschedule, cancellation or deposit
  -- attachment must serialize with the decision to attach or release.
  SELECT * INTO booking FROM public.reservations
   WHERE id = attempt.booking_id AND restaurant_id = attempt.restaurant_id
   FOR UPDATE;
  SELECT * INTO attempt FROM public.hosted_reservation_deposits WHERE id = p_id FOR UPDATE;

  IF (attempt.checkout_session_id IS NOT NULL AND attempt.checkout_session_id <> p_session_id)
     OR (attempt.payment_intent_id IS NOT NULL AND attempt.payment_intent_id IS DISTINCT FROM p_intent_id
         AND p_observation NOT IN ('open', 'expired')) THEN
    RETURN 'binding_conflict';
  END IF;
  IF attempt.state IN ('attached', 'released') THEN RETURN attempt.state; END IF;

  matches_booking := booking.id IS NOT NULL
    AND booking.reservation_id = attempt.reservation_code
    AND coalesce(lower(booking.status) IN ('confirmed', 'pending'), false)
    AND ROW(booking.date, booking.time, booking.party_size)
        = ROW(attempt.booking_date, attempt.booking_time, attempt.party_size);

  IF p_observation = 'expired' THEN
    IF attempt.state = 'pending' THEN
      UPDATE public.hosted_reservation_deposits
         SET checkout_session_id = p_session_id, checkout_params = NULL,
             superseded_at = coalesce(attempt.superseded_at, clock_timestamp())
       WHERE id = p_id;
    END IF;
    RETURN 'unavailable';
  END IF;

  IF p_observation = 'open' THEN
    UPDATE public.hosted_reservation_deposits SET checkout_session_id = p_session_id, checkout_params = NULL
     WHERE id = p_id;
    IF matches_booking AND attempt.state = 'pending' AND attempt.superseded_at IS NULL
       AND booking.deposit_payment_intent_id IS NULL AND coalesce(booking.deposit_amount, 0) <= 0
       AND attempt.expires_at > extract(epoch FROM clock_timestamp()) THEN
      RETURN 'open';
    END IF;
    RETURN 'unavailable';
  END IF;

  -- The application calls this function only with observations from Stripe.
  -- An existing reservation pointer always prevents releasing that intent.
  IF p_intent_id IS NULL OR p_observation IS NULL OR p_observation NOT IN ('hold', 'canceled') THEN
    RETURN 'binding_conflict';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reservations WHERE deposit_payment_intent_id = p_intent_id) THEN
    RETURN 'binding_conflict';
  END IF;

  IF p_observation = 'canceled' THEN
    UPDATE public.hosted_reservation_deposits
       SET state = 'released', checkout_session_id = p_session_id, payment_intent_id = p_intent_id, checkout_params = NULL
     WHERE id = p_id;
    RETURN 'released';
  END IF;

  IF matches_booking AND attempt.state = 'pending' AND attempt.superseded_at IS NULL
     AND booking.deposit_payment_intent_id IS NULL AND coalesce(booking.deposit_amount, 0) <= 0
     AND p_authorized_at <= attempt.expires_at
     AND p_capture_before > extract(epoch FROM clock_timestamp()) THEN
    UPDATE public.reservations
       SET deposit_payment_intent_id = p_intent_id, deposit_amount = attempt.amount_minor::numeric / 100
     WHERE id = booking.id AND restaurant_id = attempt.restaurant_id;
    UPDATE public.hosted_reservation_deposits
       SET state = 'attached', checkout_session_id = p_session_id, payment_intent_id = p_intent_id, checkout_params = NULL
     WHERE id = p_id;
    RETURN 'attached';
  END IF;

  UPDATE public.hosted_reservation_deposits
     SET state = 'release_pending', checkout_session_id = p_session_id, payment_intent_id = p_intent_id, checkout_params = NULL
   WHERE id = p_id;
  RETURN 'release_pending';
END;
$$;

REVOKE ALL ON FUNCTION public.begin_hosted_reservation_deposit(uuid, uuid, uuid, text, date, time, integer, integer, text, text, boolean, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_hosted_reservation_deposit(uuid, uuid, uuid, text, date, time, integer, integer, text, text, boolean, bigint, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.settle_hosted_reservation_deposit(uuid, text, text, bigint, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_hosted_reservation_deposit(uuid, text, text, bigint, bigint, text)
  TO service_role;

COMMIT;
