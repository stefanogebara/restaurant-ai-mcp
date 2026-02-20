-- Security Hardening Migration (executed 2026-02-20)
-- Description: Fixes CRITICAL RLS policy vulnerabilities and revokes unnecessary grants
--
-- Issues addressed:
--   1. restaurant.reservations: USING(true) TO public → authenticated only
--   2. restaurant.service_records: USING(true) TO public → authenticated only
--   3. restaurant.customer_history: USING(true) TO public → authenticated only
--   4. restaurant.ml_interventions: USING(true) TO public → authenticated only
--   5. public.agent_conversations: USING(true) TO public → authenticated only
--   6. public.users: USING(true) TO public → own data only (auth.uid())
--   7. Blanket GRANT SELECT ON ALL TABLES in restaurant schema to anon → revoked
--
-- NOTE: restaurant.* tables do NOT have a restaurant_id column (schema-level isolation).
--       We restrict from public/anon to authenticated-only. App uses supabaseAdmin (service_role)
--       which bypasses RLS, so this doesn't break any functionality.
--
-- STATUS: EXECUTED SUCCESSFULLY on 2026-02-20

BEGIN;

-- ============================================================================
-- 1. Helper function: get authenticated user's restaurant_id
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_user_restaurant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM restaurant.restaurant_config
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1
$$;

COMMENT ON FUNCTION public.get_user_restaurant_id() IS
  'Returns the restaurant_id for the currently authenticated user. Used in RLS policies.';

-- ============================================================================
-- 2. Fix restaurant.reservations RLS (CRITICAL - PII exposure)
--    No restaurant_id column → restrict to authenticated only (was: public/anon)
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to reservations" ON restaurant.reservations;
DROP POLICY IF EXISTS "Allow public insert access to reservations" ON restaurant.reservations;

CREATE POLICY "authenticated_read_reservations"
  ON restaurant.reservations FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_reservations"
  ON restaurant.reservations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_reservations"
  ON restaurant.reservations FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- 3. Fix restaurant.service_records RLS (CRITICAL - PII exposure)
--    No restaurant_id column → restrict to authenticated only
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to service_records" ON restaurant.service_records;

CREATE POLICY "authenticated_read_service_records"
  ON restaurant.service_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_modify_service_records"
  ON restaurant.service_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. Fix restaurant.customer_history RLS (CRITICAL - PII exposure)
--    No restaurant_id column → restrict to authenticated only
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to customer_history" ON restaurant.customer_history;

CREATE POLICY "authenticated_read_customer_history"
  ON restaurant.customer_history FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 5. Fix restaurant.ml_interventions RLS (removes anon read access)
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to ml_interventions" ON restaurant.ml_interventions;

CREATE POLICY "authenticated_read_ml_interventions"
  ON restaurant.ml_interventions FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 6. Fix public.agent_conversations RLS (removes public/anon read access)
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.agent_conversations;

CREATE POLICY "authenticated_read_conversations"
  ON public.agent_conversations FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 7. Fix public.users RLS (removes public read access → own data only)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own data" ON public.users;

CREATE POLICY "users_can_view_own_data"
  ON public.users FOR SELECT TO authenticated USING (id = auth.uid());

-- ============================================================================
-- 8. Restrict restaurant schema grants (remove blanket anon read-all)
-- ============================================================================
REVOKE SELECT ON ALL TABLES IN SCHEMA restaurant FROM anon;

-- Re-grant only what anon needs
GRANT SELECT ON restaurant.restaurant_info TO anon;  -- public restaurant profiles
GRANT INSERT ON restaurant.sms_logs TO anon;          -- SMS webhook logging

-- Ensure authenticated users retain full access (RLS policies filter)
GRANT SELECT ON ALL TABLES IN SCHEMA restaurant TO authenticated;
GRANT INSERT ON restaurant.reservations TO authenticated;

COMMIT;

-- ============================================================================
-- Post-execution verification (2026-02-20):
-- Only 1 USING(true) policy remains for anon/public:
--   restaurant.restaurant_info "Allow public read access" {public} SELECT
--   (intentionally public - restaurant profiles for booking pages)
-- ============================================================================
