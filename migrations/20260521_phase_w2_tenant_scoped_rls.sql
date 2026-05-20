-- Phase W.2: replace permissive `USING (true)` / `WITH CHECK (true)` policies
-- with tenant-scoped predicates.
--
-- Before W.2: any authenticated user with a JWT could SELECT / INSERT / UPDATE
-- ANY restaurant's reservations and service_records via PostgREST. The advisor
-- flagged this as ERROR-level. The web app uses supabaseAdmin (service_role)
-- everywhere, so tightening the authenticated-role policies is safe.
--
-- Reservations and service_records are the two most PII-heavy tables — names,
-- phones, dietary restrictions, party sizes, dates, table assignments.
-- They MUST be tenant-isolated. Same migration also drops the anon-insert
-- policy on sms_logs (server always writes via service_role; nothing legit
-- inserts anonymously).
--
-- Strategy: every replacement policy scopes by
--   restaurant_id = public.get_user_restaurant_id()
-- which is a SECURITY DEFINER helper that resolves the JWT subject to the
-- caller's tenant via restaurant.restaurant_config. The helper has search_path=''
-- already, so it's hardened against the function_search_path_mutable lint.

-- ============================================================================
-- restaurant.reservations
-- ============================================================================
DROP POLICY IF EXISTS authenticated_read_reservations  ON restaurant.reservations;
DROP POLICY IF EXISTS authenticated_insert_reservations ON restaurant.reservations;
DROP POLICY IF EXISTS authenticated_update_reservations ON restaurant.reservations;

CREATE POLICY authenticated_read_reservations
  ON restaurant.reservations
  FOR SELECT
  TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id());

CREATE POLICY authenticated_insert_reservations
  ON restaurant.reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

CREATE POLICY authenticated_update_reservations
  ON restaurant.reservations
  FOR UPDATE
  TO authenticated
  USING (restaurant_id = public.get_user_restaurant_id())
  WITH CHECK (restaurant_id = public.get_user_restaurant_id());

-- ============================================================================
-- restaurant.service_records
--
-- This table has no restaurant_id column and 22 historical rows with mostly
-- NULL reservation_ids — we cannot reliably tenant-scope it. The live data
-- lives in public.service_records (which already has tenant_isolation_*
-- policies). Treat the restaurant.* copy as service-role-only legacy storage:
-- drop the permissive policies, leave the service_role policy in place, do
-- NOT replace them. PostgREST will deny all authenticated traffic by default.
--
-- The web app does not read or write this table (verified via
-- `.from('service_records')` grep — all calls use the public schema).
-- ============================================================================
DROP POLICY IF EXISTS authenticated_read_service_records   ON restaurant.service_records;
DROP POLICY IF EXISTS authenticated_modify_service_records ON restaurant.service_records;

REVOKE ALL ON restaurant.service_records FROM anon, authenticated;

COMMENT ON TABLE restaurant.service_records IS
  'Phase W.2: legacy / stale copy. Live data lives in public.service_records. '
  'Service-role-only via RLS deny-all (no policies for anon/authenticated).';

-- ============================================================================
-- restaurant.sms_logs
-- The "Allow anonymous inserts" policy let any caller with the anon key spam
-- the table. The server inserts via service_role, so this policy is unused.
-- ============================================================================
DROP POLICY IF EXISTS "Allow anonymous inserts" ON restaurant.sms_logs;
