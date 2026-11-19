-- Run with psql -X -f on a fresh, disposable PostgreSQL database.
\set ON_ERROR_STOP on

BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  reservation_id text NOT NULL,
  customer_name text NOT NULL DEFAULT 'Fixture Guest',
  date date NOT NULL DEFAULT current_date + 1,
  time time NOT NULL DEFAULT '18:00',
  party_size integer NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'confirmed',
  notes text,
  deposit_payment_intent_id text,
  deposit_captured_payment_intent_id text,
  deposit_amount numeric,
  deposit_currency text,
  deposit_refunded_amount numeric
);
GRANT SELECT, UPDATE ON public.reservations TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

INSERT INTO public.reservations (restaurant_id, reservation_id, status, deposit_payment_intent_id,
  deposit_captured_payment_intent_id, deposit_amount, deposit_currency, deposit_refunded_amount)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'legacy-cancel', 'cancelled', 'pi_legacy', NULL, 18, 'eur', NULL),
  ('11111111-1111-4111-8111-111111111111', 'reschedule', 'confirmed', 'pi_old', NULL, 18, 'eur', NULL),
  ('11111111-1111-4111-8111-111111111111', 'paid', 'confirmed', NULL, 'pi_paid', 18, 'eur', 3),
  ('11111111-1111-4111-8111-111111111111', 'fully-refunded', 'cancelled', NULL, 'pi_refunded', 18, 'eur', 18),
  ('22222222-2222-4222-8222-222222222222', 'other-tenant', 'cancelled', NULL, 'pi_other', 18, 'eur', NULL);

\ir ../migrations/20261119221236_reservation_deposit_changes.sql

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.list_cancelled_reservation_deposits(uuid)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.list_cancelled_reservation_deposits(uuid)', 'EXECUTE')
  THEN RAISE EXCEPTION 'financial query must only be callable by the service role'; END IF;
END;
$$;

SET ROLE service_role;
DO $$
DECLARE
  tenant constant uuid := '11111111-1111-4111-8111-111111111111';
BEGIN
  UPDATE public.reservations SET notes = 'fixture', time = time WHERE reservation_id = 'reschedule';
  IF EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id = 'reschedule'
    AND (deposit_release_pending_at IS NOT NULL OR deposit_reauthorization_required))
  THEN RAISE EXCEPTION 'notes and no-op edits must retain the authorization'; END IF;

  UPDATE public.reservations SET party_size = 3 WHERE reservation_id = 'reschedule';
  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id = 'reschedule'
    AND deposit_release_pending_at IS NOT NULL AND deposit_reauthorization_required)
  THEN RAISE EXCEPTION 'a reschedule must queue release and require new authorization'; END IF;

  UPDATE public.reservations SET deposit_payment_intent_id = NULL WHERE reservation_id = 'reschedule';
  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id = 'reschedule'
    AND deposit_release_pending_at IS NULL AND deposit_reauthorization_required)
  THEN RAISE EXCEPTION 'the replacement requirement must survive release'; END IF;

  UPDATE public.reservations SET deposit_payment_intent_id = 'pi_new' WHERE reservation_id = 'reschedule';
  IF EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id = 'reschedule' AND deposit_reauthorization_required)
  THEN RAISE EXCEPTION 'a replacement authorization must clear the requirement'; END IF;

  UPDATE public.reservations SET date = date + 1, status = 'cancelled' WHERE reservation_id = 'paid';
  IF NOT EXISTS (SELECT 1 FROM public.reservations WHERE reservation_id = 'paid'
    AND deposit_captured_payment_intent_id = 'pi_paid' AND deposit_release_pending_at IS NULL)
  THEN RAISE EXCEPTION 'a captured payment must stay attached for explicit refund'; END IF;

  IF (SELECT count(*) FROM public.list_cancelled_reservation_deposits(tenant)) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.list_cancelled_reservation_deposits(tenant)
                   WHERE reservation_id = 'legacy-cancel' AND deposit_release_pending)
    OR NOT EXISTS (SELECT 1 FROM public.list_cancelled_reservation_deposits(tenant)
                   WHERE reservation_id = 'paid' AND deposit_outstanding_amount = 15)
  THEN RAISE EXCEPTION 'cancelled deposit list includes wrong holds, amounts, or tenants'; END IF;
END;
$$;
RESET ROLE;
ROLLBACK;
