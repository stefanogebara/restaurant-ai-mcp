-- Phase X.1 — RLS tenant-isolation proof.
--
-- Runnable verification that the tenant_isolation_* policies on
-- public.reservations actually deny cross-tenant CRUD. Designed to run
-- against any environment that has at least two tenants in
-- restaurant.restaurant_config — pass the two user_id + restaurant_id
-- pairs as fn args.
--
-- The function returns one row per assertion with a boolean `passed`
-- column. Wrap the call in BEGIN/ROLLBACK so the test reservation never
-- persists. Last verified on prod 2026-05-21: 6/6 PASS.
--
-- Usage:
--   BEGIN;
--   SELECT * FROM pg_temp.x1_proof(
--     'a1eba1b2-d235-4472-854e-45899e4923fd',  -- tenant_a_id
--     'b460d5df-3254-4801-8ccd-0752c2eaf4b4',  -- tenant_a_user
--     'e36998dd-ef53-493f-b42e-98f214c63774',  -- tenant_b_id
--     '4bc6295c-82e6-480a-84fc-f70c08e6cfa9'   -- tenant_b_user
--   );
--   ROLLBACK;

CREATE OR REPLACE FUNCTION pg_temp.x1_proof(
  tenant_a_id   uuid,
  tenant_a_user uuid,
  tenant_b_id   uuid,
  tenant_b_user uuid
) RETURNS TABLE(step text, passed boolean, detail text) LANGUAGE plpgsql AS $$
DECLARE
  res_a_id text := 'TEST-X-A-' || gen_random_uuid()::text;
  v_count  int;
  v_caught boolean;
BEGIN
  -- ===== Tenant A =====
  PERFORM set_config('request.jwt.claims',
    json_build_object(
      'sub',           tenant_a_user::text,
      'restaurant_id', tenant_a_id::text,
      'role',          'authenticated'
    )::text,
    true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.reservations (
    reservation_id, restaurant_id, customer_name, customer_phone,
    party_size, date, time, status
  ) VALUES (
    res_a_id, tenant_a_id, 'X-Test-A', '+10000000001',
    2, CURRENT_DATE + 30, '19:00', 'confirmed'
  );
  RETURN QUERY SELECT '1a-A-inserts-own', true, 'INSERT succeeded';

  v_caught := false;
  BEGIN
    INSERT INTO public.reservations (
      reservation_id, restaurant_id, customer_name, customer_phone,
      party_size, date, time, status
    ) VALUES (
      'TEST-X-A-CROSS', tenant_b_id, 'cross', '+1',
      1, CURRENT_DATE + 30, '19:00', 'confirmed'
    );
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_caught := true;
  END;
  RETURN QUERY SELECT '1b-A-cant-insert-B', v_caught,
    CASE WHEN v_caught THEN 'INSERT blocked by RLS' ELSE 'BUG: cross-tenant INSERT succeeded' END;

  SELECT COUNT(*) INTO v_count FROM public.reservations WHERE restaurant_id = tenant_b_id;
  RETURN QUERY SELECT '1c-A-sees-0-B-rows', v_count = 0,
    'Tenant A saw ' || v_count || ' Tenant-B rows (expected 0)';

  -- ===== Tenant B =====
  PERFORM set_config('request.jwt.claims',
    json_build_object(
      'sub',           tenant_b_user::text,
      'restaurant_id', tenant_b_id::text,
      'role',          'authenticated'
    )::text,
    true);

  SELECT COUNT(*) INTO v_count FROM public.reservations WHERE reservation_id = res_a_id;
  RETURN QUERY SELECT '2a-B-cant-see-A-by-id', v_count = 0,
    'Tenant B saw ' || v_count || ' rows of Tenant A by ID (expected 0)';

  UPDATE public.reservations SET customer_name = 'HIJACKED' WHERE reservation_id = res_a_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT '2b-B-cant-update-A', v_count = 0,
    'Tenant B''s UPDATE affected ' || v_count || ' rows (expected 0)';

  DELETE FROM public.reservations WHERE reservation_id = res_a_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT '2c-B-cant-delete-A', v_count = 0,
    'Tenant B''s DELETE affected ' || v_count || ' rows (expected 0)';
END $$;
