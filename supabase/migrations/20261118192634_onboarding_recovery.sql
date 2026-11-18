BEGIN;

CREATE TABLE public.onboarding_setup_steps (
  restaurant_id uuid NOT NULL REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  step text NOT NULL CHECK (step IN ('whatsapp_registry', 'voice_agent', 'knowledge_base', 'subscription')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'failed', 'working', 'reconcile', 'ok')),
  started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  attempt_id uuid,
  lease_until timestamptz,
  create_started boolean NOT NULL DEFAULT false,
  resource_id text,
  initial_free boolean,
  customer_email text,
  PRIMARY KEY (restaurant_id, step)
);
ALTER TABLE public.onboarding_setup_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_setup_steps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_setup_steps TO service_role;

-- The service supplies a validated restaurant and the table layout. Keep DB
-- defaults on columns omitted by the current onboarding form.
CREATE FUNCTION public.create_onboarding_restaurant(p_config jsonb, p_tables jsonb, p_customer_email text)
RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_owner uuid := (p_config->>'user_id')::uuid;
  v_restaurant uuid := (p_config->>'id')::uuid;
  v_columns text;
BEGIN
  IF v_owner IS NULL OR v_restaurant IS NULL OR p_customer_email IS NULL THEN
    RAISE EXCEPTION 'Missing onboarding identity';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_owner::text, 119));
  IF EXISTS (SELECT 1 FROM restaurant.restaurant_config WHERE user_id = v_owner) THEN
    RETURN NULL;
  END IF;

  SELECT string_agg(format('%I', key), ', ' ORDER BY key)
    INTO v_columns FROM jsonb_object_keys(p_config) AS key;

  EXECUTE format(
    'INSERT INTO restaurant.restaurant_config (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::restaurant.restaurant_config, $1)',
    v_columns
  ) USING p_config;

  INSERT INTO public.tables (
    restaurant_id, table_number, capacity, location, status, is_active,
    current_service_id, is_fixed, shape, is_joinable, is_fixed_seating
  )
  SELECT v_restaurant, table_number, capacity, location, status, is_active,
         current_service_id, is_fixed, shape, is_joinable, is_fixed_seating
  FROM jsonb_populate_recordset(NULL::public.tables, p_tables);

  INSERT INTO public.onboarding_setup_steps (restaurant_id, step, initial_free, customer_email)
  SELECT v_restaurant, step,
    CASE WHEN step = 'subscription' THEN p_config->>'country' = 'BR' END,
    CASE WHEN step = 'subscription' THEN p_customer_email END
  FROM unnest(ARRAY['whatsapp_registry', 'voice_agent', 'knowledge_base', 'subscription']) AS step;
  RETURN v_restaurant;
END;
$$;

-- These DB-only steps are idempotent and share the restaurant row lock used by
-- the Stripe projection. An existing registry or any billing history wins.
CREATE FUNCTION public.apply_onboarding_database_step(p_restaurant_id uuid, p_step text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_config restaurant.restaurant_config%ROWTYPE;
  v_step public.onboarding_setup_steps%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_start date;
  v_end date;
  v_alias text;
  v_expired boolean;
BEGIN
  SELECT * INTO STRICT v_config FROM restaurant.restaurant_config
    WHERE id = p_restaurant_id AND is_active AND NOT is_demo FOR UPDATE;
  SELECT * INTO STRICT v_step FROM public.onboarding_setup_steps
    WHERE restaurant_id = p_restaurant_id AND step = p_step;

  SELECT * INTO v_subscription FROM public.subscriptions
    WHERE restaurant_id = p_restaurant_id
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 WHEN 'past_due' THEN 2 ELSE 3 END,
      created_at DESC, id DESC
    LIMIT 1;

  BEGIN
    IF p_step = 'subscription' THEN
      IF v_subscription.id IS NULL AND v_step.state <> 'ok' THEN
        v_start := (v_step.started_at AT TIME ZONE 'UTC')::date;
        v_end := CASE WHEN v_step.initial_free THEN DATE '2099-12-31' ELSE v_start + 14 END;
        v_expired := NOT v_step.initial_free AND v_end <= (statement_timestamp() AT TIME ZONE 'UTC')::date;
        INSERT INTO public.subscriptions (
          restaurant_id, subscription_id, customer_id, customer_email, plan_name, price_id,
          status, current_period_start, current_period_end, trial_end, canceled_at
        ) VALUES (
          p_restaurant_id,
          (CASE WHEN v_step.initial_free THEN 'free_' ELSE 'trial_' END) || p_restaurant_id::text,
          v_config.user_id::text, v_step.customer_email,
          CASE WHEN v_step.initial_free THEN 'Free' ELSE 'Growth' END,
          CASE WHEN v_step.initial_free THEN 'free' ELSE 'trial' END,
          (CASE WHEN v_step.initial_free THEN 'active' WHEN v_expired THEN 'canceled' ELSE 'trialing' END)::public.subscription_status,
          v_start, v_end, CASE WHEN NOT v_step.initial_free THEN v_end END,
          CASE WHEN v_expired THEN v_end END
        ) RETURNING * INTO v_subscription;
        IF v_expired THEN
          UPDATE public.restaurant_registry SET subscription_status = 'canceled'
            WHERE id = p_restaurant_id AND plan_name = 'growth' AND subscription_status = 'trialing';
        END IF;
      END IF;
    ELSIF p_step = 'whatsapp_registry' THEN
      v_alias := lower(btrim(v_config.restaurant_name));
      INSERT INTO public.restaurant_registry (
        id, restaurant_name, restaurant_aliases, customer_email, language, timezone,
        plan_name, subscription_status, is_active
      )
      SELECT
        p_restaurant_id, v_config.restaurant_name,
        ARRAY(SELECT DISTINCT alias FROM unnest(ARRAY[v_alias, btrim(regexp_replace(v_alias, '[[:space:]-]+[0-9]+$', ''))]) AS alias WHERE alias <> ''),
        v_config.email, COALESCE(v_config.agent_language, 'en'), v_config.timezone,
        COALESCE(lower(v_subscription.plan_name), CASE WHEN initial_plan.initial_free THEN 'free' ELSE 'growth' END),
        COALESCE(v_subscription.status::text, CASE
          WHEN initial_plan.initial_free THEN 'active'
          WHEN (initial_plan.started_at AT TIME ZONE 'UTC')::date + 14 <= (statement_timestamp() AT TIME ZONE 'UTC')::date THEN 'canceled'
          ELSE 'trialing' END), true
      FROM public.onboarding_setup_steps AS initial_plan
      WHERE initial_plan.restaurant_id = p_restaurant_id AND initial_plan.step = 'subscription'
      ON CONFLICT (id) DO NOTHING;
    ELSE
      RAISE EXCEPTION 'Invalid onboarding database step';
    END IF;

    UPDATE public.onboarding_setup_steps SET state = 'ok'
      WHERE restaurant_id = p_restaurant_id AND step = p_step;
    RETURN jsonb_build_object('status', 'ok', 'subscription', to_jsonb(v_subscription));
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.onboarding_setup_steps SET state = 'failed'
      WHERE restaurant_id = p_restaurant_id AND step = p_step AND state <> 'ok';
    RETURN jsonb_build_object('status', 'failed');
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_onboarding_restaurant(jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_onboarding_database_step(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_onboarding_restaurant(jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_onboarding_database_step(uuid, text) TO service_role;

COMMIT;
