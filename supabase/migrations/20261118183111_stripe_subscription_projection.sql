BEGIN;

ALTER TABLE public.subscriptions ADD COLUMN stripe_observed_at timestamptz;
ALTER TABLE public.stripe_webhook_events_processed ADD COLUMN subscription_projected_at timestamptz;

CREATE FUNCTION public.project_stripe_subscription(
  p_restaurant_id uuid,
  p_event_id text,
  p_event_type text,
  p_observed_at timestamptz,
  p_subscription_id text,
  p_customer_id text,
  p_customer_email text,
  p_plan text,
  p_price_id text,
  p_status public.subscription_status,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_trial_end timestamptz,
  p_canceled_at timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  previous public.subscriptions%ROWTYPE;
  access_plan text;
  old_rank integer;
  new_rank integer;
  grace_until timestamptz;
  first_stripe_record boolean;
BEGIN
  IF p_subscription_id IS NULL OR p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    OR p_customer_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9]+$'
    OR p_plan IS NULL OR p_plan NOT IN ('Starter', 'Growth', 'Scale')
    OR p_status IS NULL OR p_observed_at IS NULL THEN
    RAISE EXCEPTION 'Invalid Stripe subscription projection';
  END IF;

  -- A failed projection rolls back the event receipt as well as the plan.
  -- Old receipts without this marker can be repaired by replaying the event.
  INSERT INTO public.stripe_webhook_events_processed AS receipt
    (event_id, event_type, subscription_projected_at)
    VALUES (p_event_id, p_event_type, clock_timestamp())
  ON CONFLICT (event_id) DO UPDATE
    SET subscription_projected_at = excluded.subscription_projected_at
    WHERE receipt.subscription_projected_at IS NULL;
  IF NOT FOUND THEN
    RETURN 'duplicate';
  END IF;

  PERFORM 1 FROM restaurant.restaurant_config WHERE id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe subscription restaurant not found';
  END IF;

  SELECT * INTO previous FROM public.subscriptions WHERE subscription_id = p_subscription_id;
  IF FOUND AND previous.restaurant_id <> p_restaurant_id THEN
    RAISE EXCEPTION 'Stripe subscription belongs to a different restaurant';
  END IF;
  IF previous.stripe_observed_at > p_observed_at
    OR (previous.status = 'canceled' AND p_status <> 'canceled') THEN
    RETURN 'stale';
  END IF;
  first_stripe_record := previous.id IS NULL;

  -- A checkout started and abandoned must leave the current entitlement in
  -- effect. Stripe will send another event if the new subscription activates.
  IF first_stripe_record AND p_status NOT IN ('active', 'trialing')
    AND EXISTS (
      SELECT 1 FROM public.subscriptions WHERE restaurant_id = p_restaurant_id
        AND status IN ('active', 'trialing', 'past_due')
    ) THEN
    RETURN 'applied';
  END IF;

  IF p_status IN ('active', 'trialing') THEN
    -- Only retire plans seeded by onboarding. A second real Stripe
    -- subscription is a conflict and must not silently replace the first.
    UPDATE public.subscriptions
      SET status = 'canceled', canceled_at = (clock_timestamp() AT TIME ZONE 'UTC')::date
      WHERE restaurant_id = p_restaurant_id
        AND status IN ('active', 'trialing')
        AND subscription_id IN ('free_' || p_restaurant_id::text, 'trial_' || p_restaurant_id::text);
  END IF;

  old_rank := CASE lower(previous.plan_name) WHEN 'starter' THEN 1 WHEN 'growth' THEN 2
    WHEN 'professional' THEN 2 WHEN 'scale' THEN 3 END;
  new_rank := CASE p_plan WHEN 'Starter' THEN 1 WHEN 'Growth' THEN 2 WHEN 'Scale' THEN 3 END;
  grace_until := CASE WHEN p_status = 'canceled' THEN NULL
    WHEN old_rank > new_rank THEN p_period_end
    WHEN old_rank = new_rank THEN previous.downgrade_grace_until END;

  INSERT INTO public.subscriptions (
    restaurant_id, subscription_id, customer_id, customer_email, plan_name, price_id, status,
    current_period_start, current_period_end, trial_end, canceled_at, downgrade_grace_until, stripe_observed_at
  ) VALUES (
    p_restaurant_id, p_subscription_id, p_customer_id, p_customer_email, p_plan, p_price_id, p_status,
    (p_period_start AT TIME ZONE 'UTC')::date, (p_period_end AT TIME ZONE 'UTC')::date,
    (p_trial_end AT TIME ZONE 'UTC')::date, (p_canceled_at AT TIME ZONE 'UTC')::date, grace_until, p_observed_at
  )
  ON CONFLICT (subscription_id) DO UPDATE SET
    customer_id = excluded.customer_id, customer_email = excluded.customer_email,
    plan_name = excluded.plan_name, price_id = excluded.price_id, status = excluded.status,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    trial_end = excluded.trial_end, canceled_at = excluded.canceled_at,
    downgrade_grace_until = excluded.downgrade_grace_until, stripe_observed_at = excluded.stripe_observed_at
  WHERE subscriptions.restaurant_id = p_restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe subscription belongs to a different restaurant';
  END IF;

  IF p_status IN ('active', 'trialing', 'past_due') THEN
    access_plan := p_plan;
  ELSIF NOT first_stripe_record THEN
    SELECT plan_name INTO access_plan FROM public.subscriptions
      WHERE restaurant_id = p_restaurant_id AND status IN ('active', 'trialing', 'past_due')
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END, created_at DESC
      LIMIT 1;
    access_plan := coalesce(access_plan, 'Starter');
  END IF;

  IF access_plan IS NOT NULL THEN
    UPDATE restaurant.restaurant_config
      SET metric_profile = coalesce(metric_profile, '{}'::jsonb) ||
        jsonb_build_object('plan', access_plan, 'plan_updated_at', clock_timestamp()) ||
        CASE WHEN p_status IN ('active', 'trialing', 'past_due') AND p_customer_email <> ''
          THEN jsonb_build_object('customer_email', p_customer_email) ELSE '{}'::jsonb END
      WHERE id = p_restaurant_id;
  END IF;
  RETURN 'applied';
END;
$$;

REVOKE ALL ON FUNCTION public.project_stripe_subscription(
  uuid, text, text, timestamptz, text, text, text, text, text, public.subscription_status,
  timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.project_stripe_subscription(
  uuid, text, text, timestamptz, text, text, text, text, text, public.subscription_status,
  timestamptz, timestamptz, timestamptz, timestamptz
) TO service_role;

COMMIT;
