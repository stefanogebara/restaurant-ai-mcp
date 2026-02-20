-- Security Hardening Migration
-- Date: 2026-02-20
-- Description: Fixes CRITICAL RLS policy vulnerabilities and revokes unnecessary grants
--
-- Issues addressed:
--   1. restaurant.reservations: USING(true) allows public read of ALL reservation PII
--   2. restaurant.service_records: USING(true) allows public read of ALL service records
--   3. restaurant.customer_history: USING(true) allows public read of ALL customer history
--   4. public.agent_conversations: USING(true) allows public read of ALL AI conversations
--   5. public.users: USING(true) allows public read of ALL user data
--   6. Unnecessary anon GRANT on pos_connections, revenue_records, customer_ltv, usage_tracking
--   7. Overly broad GRANT SELECT ON ALL TABLES in restaurant schema to anon
--
-- IMPORTANT: Run this in Supabase SQL Editor. Test in staging first.
-- Rollback: Each section has a comment with rollback SQL.

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
-- ============================================================================
-- Remove dangerous public read policy
DROP POLICY IF EXISTS "Allow public read access to reservations" ON restaurant.reservations;
-- Remove dangerous public insert policy (API uses supabaseAdmin, not needed)
DROP POLICY IF EXISTS "Allow public insert access to reservations" ON restaurant.reservations;

-- Add authenticated-only read scoped by restaurant
CREATE POLICY "authenticated_read_own_restaurant_reservations"
  ON restaurant.reservations
  FOR SELECT TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id());

-- Add authenticated insert scoped by restaurant
CREATE POLICY "authenticated_insert_own_restaurant_reservations"
  ON restaurant.reservations
  FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- Add authenticated update scoped by restaurant
CREATE POLICY "authenticated_update_own_restaurant_reservations"
  ON restaurant.reservations
  FOR UPDATE TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id());

-- Rollback:
-- DROP POLICY IF EXISTS "authenticated_read_own_restaurant_reservations" ON restaurant.reservations;
-- DROP POLICY IF EXISTS "authenticated_insert_own_restaurant_reservations" ON restaurant.reservations;
-- DROP POLICY IF EXISTS "authenticated_update_own_restaurant_reservations" ON restaurant.reservations;
-- CREATE POLICY "Allow public read access to reservations" ON restaurant.reservations FOR SELECT TO public USING (true);
-- CREATE POLICY "Allow public insert access to reservations" ON restaurant.reservations FOR INSERT TO public WITH CHECK (true);

-- ============================================================================
-- 3. Fix restaurant.service_records RLS (CRITICAL - PII exposure)
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to service_records" ON restaurant.service_records;

CREATE POLICY "authenticated_read_own_restaurant_service_records"
  ON restaurant.service_records
  FOR SELECT TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id());

CREATE POLICY "authenticated_modify_own_restaurant_service_records"
  ON restaurant.service_records
  FOR ALL TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ============================================================================
-- 4. Fix restaurant.customer_history RLS (CRITICAL - PII exposure)
-- ============================================================================
DROP POLICY IF EXISTS "Allow public read access to customer_history" ON restaurant.customer_history;

CREATE POLICY "authenticated_read_own_restaurant_customer_history"
  ON restaurant.customer_history
  FOR SELECT TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id());

-- ============================================================================
-- 5. Fix restaurant.tables RLS (restrict to authenticated)
-- ============================================================================
-- Tables info is not as sensitive but should still be scoped
DROP POLICY IF EXISTS "Allow public read access to tables" ON restaurant.tables;

CREATE POLICY "authenticated_read_own_restaurant_tables"
  ON restaurant.tables
  FOR SELECT TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id());

-- ============================================================================
-- 6. Fix public.agent_conversations RLS (all conversations readable by anyone)
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated read access" ON public.agent_conversations;

CREATE POLICY "authenticated_read_own_restaurant_conversations"
  ON public.agent_conversations
  FOR SELECT TO authenticated
  USING (restaurant_id = ((current_setting('request.jwt.claims', true)::json->>'restaurant_id')::uuid));

-- ============================================================================
-- 7. Fix public.users RLS (all user data readable by anyone)
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own data" ON public.users;

-- Users can only view their own record
CREATE POLICY "users_can_view_own_data"
  ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Service role policy already exists for FK validation

-- ============================================================================
-- 8. Revoke unnecessary anon GRANTs on sensitive tables
-- ============================================================================
-- pos_connections: Contains OAuth access_token, refresh_token, webhook_signature_key
REVOKE SELECT, INSERT, UPDATE, DELETE ON pos_connections FROM anon;

-- revenue_records: Contains customer financial data
REVOKE SELECT, INSERT, UPDATE, DELETE ON revenue_records FROM anon;

-- customer_ltv: Contains customer lifetime value and churn data
REVOKE SELECT, INSERT, UPDATE, DELETE ON customer_ltv FROM anon;

-- usage_tracking: Contains billing usage data
REVOKE SELECT, INSERT, UPDATE, DELETE ON usage_tracking FROM anon;

-- Grant these to authenticated instead (RLS will still filter by restaurant_id)
GRANT SELECT ON pos_connections TO authenticated;
GRANT SELECT ON revenue_records TO authenticated;
GRANT SELECT ON customer_ltv TO authenticated;
GRANT SELECT ON usage_tracking TO authenticated;

-- ============================================================================
-- 9. Restrict restaurant schema grants (remove anon read-all)
-- ============================================================================
-- Revoke the blanket SELECT on ALL restaurant schema tables from anon
REVOKE SELECT ON ALL TABLES IN SCHEMA restaurant FROM anon;

-- Re-grant only what anon actually needs:
-- restaurant_info: public restaurant profiles (name, hours, logo) - intentionally public
GRANT SELECT ON restaurant.restaurant_info TO anon;
-- sms_logs: anon insert for SMS webhook logging
GRANT INSERT ON restaurant.sms_logs TO anon;

-- Ensure authenticated users retain access (RLS policies will filter rows)
GRANT SELECT ON ALL TABLES IN SCHEMA restaurant TO authenticated;
GRANT INSERT ON restaurant.reservations TO authenticated;

-- ============================================================================
-- 10. Add tenant isolation policies for pos_connections and revenue_records
-- ============================================================================
-- These tables only had service_role policies. Add authenticated policies.
CREATE POLICY "authenticated_read_own_restaurant_pos"
  ON pos_connections
  FOR SELECT TO authenticated
  USING (restaurant_id = ((current_setting('request.jwt.claims', true)::json->>'restaurant_id')::uuid));

CREATE POLICY "authenticated_read_own_restaurant_revenue"
  ON revenue_records
  FOR SELECT TO authenticated
  USING (restaurant_id = ((current_setting('request.jwt.claims', true)::json->>'restaurant_id')::uuid));

CREATE POLICY "authenticated_read_own_restaurant_ltv"
  ON customer_ltv
  FOR SELECT TO authenticated
  USING (restaurant_id = ((current_setting('request.jwt.claims', true)::json->>'restaurant_id')::uuid));

COMMIT;

-- ============================================================================
-- Verification queries (run after migration to confirm)
-- ============================================================================
-- Check no USING(true) policies remain on sensitive tables:
--
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE qual = 'true'
--   AND tablename IN ('reservations', 'service_records', 'customer_history', 'users', 'agent_conversations')
-- ORDER BY schemaname, tablename;
--
-- Expected: No rows (all USING(true) policies removed)
--
-- Check anon grants are revoked:
--
-- SELECT grantee, table_schema, table_name, privilege_type
-- FROM information_schema.table_privileges
-- WHERE grantee = 'anon'
--   AND table_name IN ('pos_connections', 'revenue_records', 'customer_ltv', 'usage_tracking')
-- ORDER BY table_name;
--
-- Expected: No rows
