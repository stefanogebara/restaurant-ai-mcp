-- Fix: pos_connections table missing service_role GRANTs.
-- Symptom: GET /api/square/sync?action=status returns 500 with
-- "permission denied for table pos_connections" because supabaseAdmin
-- (service_role) couldn't read the table even with no RLS active.
--
-- Other restaurant.* tables (customer_ltv, restaurant_config) work fine
-- because their migrations included GRANT lines. The 20260412 migration
-- omitted them.

GRANT USAGE ON SCHEMA restaurant TO service_role, authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON restaurant.pos_connections TO service_role;
GRANT SELECT ON restaurant.pos_connections TO authenticated;

-- Defense in depth: enable RLS but allow service_role bypass via policy.
-- Service role bypasses RLS by default in Supabase but explicit policies
-- make intent clear and survive future config drift.
ALTER TABLE restaurant.pos_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON restaurant.pos_connections;
CREATE POLICY "service_role full access" ON restaurant.pos_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "owner reads own pos connections" ON restaurant.pos_connections;
CREATE POLICY "owner reads own pos connections" ON restaurant.pos_connections
  FOR SELECT TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurant.restaurant_config WHERE user_id = auth.uid()
    )
  );
