-- Proactive Comms Queue (C6)
-- ----------------------------------------------------------------------------
-- The weekly proactive-comms cron used to emit log lines and stop. This table
-- gives the cron a real destination — managers see opportunities in the
-- dashboard, approve/edit the draft message, and a "send" action dispatches it
-- via WhatsApp.
--
-- Lifecycle: pending → approved → sent
--              ↓
--           dismissed | expired

BEGIN;

CREATE TABLE IF NOT EXISTS restaurant.proactive_comms_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant scoping (matches restaurant_config.id, NOT auth.users)
  restaurant_id UUID NOT NULL,

  -- Why this opportunity exists
  type TEXT NOT NULL CHECK (type IN ('occasion', 'churn_risk', 'long_absent')),
  trigger_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- occasion: { occasion_date, content, importance }
    -- churn_risk: { churn_risk, customer_tier, total_visits, last_visit }
    -- long_absent: { last_visit, avg_frequency_days }

  -- Who to message
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  customer_id TEXT,  -- nullable — present for churn_risk (customer_ltv.customer_id)

  -- AI-drafted content the manager can edit before sending
  draft_message TEXT,
  suggested_action TEXT NOT NULL,   -- short summary for the inbox card

  -- Lifecycle state
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'sent', 'dismissed', 'expired')),
  approved_by UUID,                 -- user_id of approver (auth.users.id)
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  send_error TEXT,                  -- if last send attempt failed

  -- Expiry — pending items past expires_at get auto-cleaned by the next cron
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant-scoped queries hit this index
CREATE INDEX IF NOT EXISTS idx_pcq_restaurant_status
  ON restaurant.proactive_comms_queue (restaurant_id, status, created_at DESC);

-- Cron uses this to find & expire stale items
CREATE INDEX IF NOT EXISTS idx_pcq_expires_pending
  ON restaurant.proactive_comms_queue (expires_at)
  WHERE status = 'pending';

-- Dedupe — only one PENDING opportunity per (restaurant, type, phone) at a time.
-- The cron runs weekly; without this, every run would re-queue the same VIPs.
-- Once approved/sent/dismissed/expired the row no longer matches the partial
-- index, so a new opportunity can be queued.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pcq_active_dedup
  ON restaurant.proactive_comms_queue (restaurant_id, type, customer_phone)
  WHERE status = 'pending';

-- updated_at trigger
CREATE OR REPLACE FUNCTION restaurant.touch_proactive_comms_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pcq_updated_at ON restaurant.proactive_comms_queue;
CREATE TRIGGER trg_pcq_updated_at
  BEFORE UPDATE ON restaurant.proactive_comms_queue
  FOR EACH ROW
  EXECUTE FUNCTION restaurant.touch_proactive_comms_queue_updated_at();

-- RLS — service role bypasses, but we still set up policies for direct
-- per-user access through the API client (mirrors customer_ltv pattern).
ALTER TABLE restaurant.proactive_comms_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcq_service_all ON restaurant.proactive_comms_queue;
CREATE POLICY pcq_service_all
  ON restaurant.proactive_comms_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can only see their own restaurant's queue.
DROP POLICY IF EXISTS pcq_authenticated_read ON restaurant.proactive_comms_queue;
CREATE POLICY pcq_authenticated_read
  ON restaurant.proactive_comms_queue
  FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurant.restaurant_config WHERE user_id = auth.uid()
    )
  );

-- Grants — same pattern as customer_ltv (caught by missing-grant audit before).
GRANT SELECT, INSERT, UPDATE, DELETE ON restaurant.proactive_comms_queue TO service_role;
GRANT SELECT ON restaurant.proactive_comms_queue TO authenticated;
GRANT USAGE ON SCHEMA restaurant TO authenticated, service_role;

COMMIT;
