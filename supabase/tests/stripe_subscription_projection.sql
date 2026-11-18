-- Run against a disposable database with the billing schema and migration applied.
BEGIN;

INSERT INTO restaurant.restaurant_config (id, metric_profile)
VALUES
  ('1171e435-2d9d-4fd8-b058-7d0ba1376050', '{"plan":"Free","other":"preserve"}'),
  ('15ded445-1b75-4941-ac9e-bb6689a25d50', '{"plan":"Growth"}');

INSERT INTO public.subscriptions
  (restaurant_id, subscription_id, customer_id, customer_email, plan_name, price_id, status)
VALUES
  ('1171e435-2d9d-4fd8-b058-7d0ba1376050', 'free_1171e435-2d9d-4fd8-b058-7d0ba1376050', 'local_user',
    'owner@example.test', 'Free', 'free', 'active'),
  ('15ded445-1b75-4941-ac9e-bb6689a25d50', 'trial_15ded445-1b75-4941-ac9e-bb6689a25d50', 'local_user',
    'owner@example.test', 'Growth', 'trial', 'trialing');

CREATE FUNCTION pg_temp.project(rid uuid, event_id text, sid text, observed timestamptz, event_status public.subscription_status)
RETURNS text LANGUAGE sql AS $$
  SELECT public.project_stripe_subscription(rid, event_id, 'customer.subscription.updated', observed,
    sid, 'cus_projection', 'billing@example.test', 'Growth', 'price_growth',
    event_status, '2026-11-18T12:00:00Z', '2026-12-02T12:00:00Z', NULL,
    CASE WHEN event_status = 'canceled' THEN observed END);
$$;

DO $$
DECLARE
  br constant uuid := '1171e435-2d9d-4fd8-b058-7d0ba1376050';
  es constant uuid := '15ded445-1b75-4941-ac9e-bb6689a25d50';
BEGIN
  ASSERT NOT has_function_privilege('authenticated',
    'public.project_stripe_subscription(uuid,text,text,timestamptz,text,text,text,text,text,public.subscription_status,timestamptz,timestamptz,timestamptz,timestamptz)',
    'EXECUTE');
  ASSERT pg_temp.project(br, 'evt_incomplete', 'sub_abandoned', '2026-11-18T12:00:00Z', 'unpaid') = 'applied';
  ASSERT NOT EXISTS (SELECT FROM public.subscriptions WHERE subscription_id = 'sub_abandoned');
  BEGIN
    PERFORM public.project_stripe_subscription(br, 'evt_failed_after_retiring_free', 'customer.subscription.created',
      '2026-11-18T12:01:00Z', 'sub_retry', 'cus_projection', 'billing@example.test', 'Growth', NULL,
      'active', '2026-11-18T12:00:00Z', '2026-12-02T12:00:00Z', NULL, NULL);
    RAISE EXCEPTION 'Expected the subscription write to fail';
  EXCEPTION WHEN not_null_violation THEN
    ASSERT (SELECT status FROM public.subscriptions WHERE subscription_id = 'free_' || br::text) = 'active';
    ASSERT NOT EXISTS (SELECT FROM public.stripe_webhook_events_processed WHERE event_id = 'evt_failed_after_retiring_free');
  END;
  ASSERT pg_temp.project(br, 'evt_br', 'sub_br', '2026-11-18T12:01:00Z', 'trialing') = 'applied';
  ASSERT pg_temp.project(es, 'evt_es', 'sub_es', '2026-11-18T12:01:00Z', 'active') = 'applied';
  ASSERT (SELECT count(*) FROM public.subscriptions WHERE status = 'canceled') = 2;
  ASSERT (SELECT metric_profile->>'other' FROM restaurant.restaurant_config WHERE id = br) = 'preserve';
  ASSERT (SELECT metric_profile->>'plan' FROM restaurant.restaurant_config WHERE id = br) = 'Growth';

  BEGIN
    PERFORM pg_temp.project(br, 'evt_other', 'sub_other', '2026-11-18T12:02:00Z', 'active');
    RAISE EXCEPTION 'Unexpected successful duplicate subscription';
  EXCEPTION WHEN unique_violation THEN
    ASSERT NOT EXISTS (SELECT FROM public.stripe_webhook_events_processed WHERE event_id = 'evt_other');
    ASSERT (SELECT status FROM public.subscriptions WHERE subscription_id = 'sub_br') = 'trialing';
  END;

  ASSERT pg_temp.project(br, 'evt_br', 'sub_br', '2026-11-18T12:03:00Z', 'active') = 'duplicate';
  ASSERT pg_temp.project(br, 'evt_cancel', 'sub_br', '2026-11-18T12:04:00Z', 'canceled') = 'applied';
  ASSERT pg_temp.project(br, 'evt_old', 'sub_br', '2026-11-18T12:02:00Z', 'active') = 'stale';
  ASSERT (SELECT status FROM public.subscriptions WHERE subscription_id = 'sub_br') = 'canceled';
  ASSERT pg_temp.project(br, 'evt_other', 'sub_other', '2026-11-18T12:05:00Z', 'active') = 'applied';
  ASSERT (SELECT status FROM public.subscriptions WHERE subscription_id = 'sub_other') = 'active';

  INSERT INTO public.stripe_webhook_events_processed(event_id,event_type)
    VALUES ('evt_legacy', 'customer.subscription.updated');
  ASSERT pg_temp.project(es, 'evt_legacy', 'sub_es', '2026-11-18T12:06:00Z', 'past_due') = 'applied';
  ASSERT (SELECT subscription_projected_at IS NOT NULL
    FROM public.stripe_webhook_events_processed WHERE event_id = 'evt_legacy');
END
$$;

ROLLBACK;
