ALTER TABLE public.reservations
  ADD COLUMN deposit_release_pending_at timestamptz
    CHECK (deposit_release_pending_at IS NULL OR deposit_payment_intent_id IS NOT NULL),
  ADD COLUMN deposit_reauthorization_required boolean NOT NULL DEFAULT false;

-- Write the release request in the same transaction as the booking change.
-- This covers guest RPCs and direct reservation updates, including voice.
CREATE FUNCTION public.queue_changed_reservation_deposit_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.deposit_payment_intent_id IS NULL THEN
    NEW.deposit_release_pending_at := NULL;
  ELSIF lower(NEW.status) IN ('cancelled', 'canceled') THEN
    NEW.deposit_release_pending_at := coalesce(NEW.deposit_release_pending_at, statement_timestamp());
  ELSIF NEW.deposit_payment_intent_id IS DISTINCT FROM OLD.deposit_payment_intent_id THEN
    NEW.deposit_release_pending_at := NULL;
    NEW.deposit_reauthorization_required := false;
  ELSIF NEW.date IS DISTINCT FROM OLD.date
    OR NEW.time IS DISTINCT FROM OLD.time
    OR NEW.party_size IS DISTINCT FROM OLD.party_size THEN
    NEW.deposit_release_pending_at := statement_timestamp();
    NEW.deposit_reauthorization_required := true;
  END IF;

  IF NEW.deposit_captured_payment_intent_id IS NOT NULL OR lower(NEW.status) IN ('cancelled', 'canceled') THEN
    NEW.deposit_reauthorization_required := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER queue_changed_reservation_deposit_release
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.queue_changed_reservation_deposit_release();

REVOKE ALL ON FUNCTION public.queue_changed_reservation_deposit_release() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_changed_reservation_deposit_release() TO service_role;

-- Recover holds already attached to cancelled bookings from the previous flow.
UPDATE public.reservations
   SET deposit_release_pending_at = statement_timestamp()
 WHERE status IN ('cancelled', 'canceled') AND deposit_payment_intent_id IS NOT NULL;

CREATE INDEX reservations_pending_deposit_release_idx
  ON public.reservations (deposit_release_pending_at)
  WHERE deposit_release_pending_at IS NOT NULL;

CREATE FUNCTION public.list_cancelled_reservation_deposits(p_restaurant_id uuid)
RETURNS TABLE (
  reservation_id text, customer_name text, date date, "time" time without time zone,
  deposit_currency text, deposit_release_pending boolean, deposit_outstanding_amount numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT r.reservation_id::text, r.customer_name::text, r.date, r.time, r.deposit_currency::text,
         r.deposit_release_pending_at IS NOT NULL,
         CASE WHEN r.deposit_captured_payment_intent_id IS NOT NULL
           THEN nullif(greatest(r.deposit_amount - coalesce(r.deposit_refunded_amount, 0), 0), 0)
         END
    FROM public.reservations r
   WHERE r.restaurant_id = p_restaurant_id
     AND r.status IN ('cancelled', 'canceled')
     AND (r.deposit_release_pending_at IS NOT NULL OR
          (r.deposit_captured_payment_intent_id IS NOT NULL AND
           r.deposit_amount > coalesce(r.deposit_refunded_amount, 0)))
   ORDER BY r.date DESC, r.time DESC, r.id;
$$;

REVOKE ALL ON FUNCTION public.list_cancelled_reservation_deposits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_cancelled_reservation_deposits(uuid) TO service_role;

CREATE INDEX reservations_cancelled_deposits_by_restaurant_idx
  ON public.reservations (restaurant_id, date DESC, time DESC, id)
  WHERE status IN ('cancelled', 'canceled')
    AND (deposit_release_pending_at IS NOT NULL OR (deposit_captured_payment_intent_id IS NOT NULL AND
         deposit_amount > coalesce(deposit_refunded_amount, 0)));
