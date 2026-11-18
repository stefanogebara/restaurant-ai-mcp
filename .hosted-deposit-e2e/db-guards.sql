BEGIN;
DO $$
DECLARE
  v_restaurant uuid := gen_random_uuid();
  v_booking uuid := gen_random_uuid();
  v_other_booking uuid := gen_random_uuid();
  v_attempt uuid := gen_random_uuid();
  v_replacement uuid := gen_random_uuid();
  v_result text;
  v_now bigint := extract(epoch FROM now())::bigint;
BEGIN
  INSERT INTO restaurant.restaurant_config (id, business_hours) VALUES (v_restaurant, '{}');
  INSERT INTO public.reservations (id, restaurant_id, reservation_id, customer_name, status, date, time, deposit_amount)
    VALUES (v_booking, v_restaurant, 'GUARD', 'Sandbox Guest', 'confirmed', current_date, '19:00', 25),
           (v_other_booking, v_restaurant, 'GUARD-OTHER', 'Sandbox Guest', 'confirmed', current_date, '19:00', NULL);

  -- Exercise the service-only RPC directly. The API's fast check cannot hide a
  -- positive previously captured amount from the locked check.
  v_result := public.begin_hosted_reservation_deposit(v_attempt, v_restaurant, v_booking, 'GUARD',
    current_date, '19:00', 2, 2500, 'brl', NULL, false, v_now + 3600, '{}')->>'result';
  IF v_result <> 'already_requested' THEN RAISE EXCEPTION 'Capture guard returned %', v_result; END IF;
  UPDATE public.reservations SET deposit_amount = NULL WHERE id = v_booking;
  v_result := public.begin_hosted_reservation_deposit(v_attempt, v_restaurant, v_booking, 'GUARD',
    current_date, '19:00', 2, 2500, 'brl', NULL, false, v_now + 3600, '{}')->>'result';
  IF v_result <> 'pending' THEN RAISE EXCEPTION 'Released booking could not start a new deposit'; END IF;

  UPDATE public.reservations SET deposit_payment_intent_id = 'pi_other_finalized' WHERE id = v_other_booking;
  v_result := public.settle_hosted_reservation_deposit(v_attempt, 'cs_test_guard', 'pi_other_finalized',
    v_now, v_now + 7200, 'hold');
  IF v_result <> 'binding_conflict' THEN RAISE EXCEPTION 'Existing intent was allowed to attach or release'; END IF;

  UPDATE public.reservations SET time = '21:00' WHERE id = v_booking;
  PERFORM public.begin_hosted_reservation_deposit(v_replacement, v_restaurant, v_booking, 'GUARD',
    current_date, '21:00', 2, 2500, 'brl', NULL, false, v_now + 3600, '{}');
  UPDATE public.reservations SET time = '19:00' WHERE id = v_booking;
  v_result := public.settle_hosted_reservation_deposit(v_attempt, 'cs_test_guard', 'pi_superseded',
    v_now, v_now + 7200, 'hold');
  IF v_result <> 'release_pending' THEN RAISE EXCEPTION 'Superseded attempt attached after restoration'; END IF;

  UPDATE public.reservations SET time = '21:00' WHERE id = v_booking;
  v_result := public.settle_hosted_reservation_deposit(v_replacement, 'cs_test_replacement', 'pi_late',
    v_now + 3601, v_now + 7200, 'hold');
  IF v_result <> 'release_pending' THEN RAISE EXCEPTION 'Authorization after checkout expiry attached'; END IF;

  v_attempt := gen_random_uuid();
  PERFORM public.begin_hosted_reservation_deposit(v_attempt, v_restaurant, v_booking, 'GUARD',
    current_date, '21:00', 2, 2500, 'brl', NULL, false, v_now + 3600, '{}');
  v_result := public.settle_hosted_reservation_deposit(v_attempt, 'cs_test_deadline', 'pi_deadline',
    v_now - 60, v_now - 1, 'hold');
  IF v_result <> 'release_pending' THEN RAISE EXCEPTION 'Expired card hold attached'; END IF;
  IF EXISTS (SELECT 1 FROM public.reservations WHERE id = v_booking AND deposit_payment_intent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Unsafe authorization attached to reservation';
  END IF;
END;
$$;
ROLLBACK;
