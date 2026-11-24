-- WAHA pipeline observability: event log for WhatsApp message processing
-- Used by /api/waha-status to expose pipeline health metrics

CREATE TABLE IF NOT EXISTS waha_events (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id    text,
  sender_phone  text,
  restaurant_id uuid,
  event_type    text NOT NULL, -- 'received', 'processed', 'failed', 'duplicate', 'rate_limited', 'sig_invalid'
  provider      text DEFAULT 'waha',
  duration_ms   integer,
  error_msg     text,
  meta          jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waha_events_created_at_idx ON waha_events (created_at DESC);
CREATE INDEX IF NOT EXISTS waha_events_event_type_idx ON waha_events (event_type);
CREATE INDEX IF NOT EXISTS waha_events_restaurant_id_idx ON waha_events (restaurant_id);

-- Retention: auto-delete events older than 30 days (keep table lean)
-- Run manually or via pg_cron if available:
-- DELETE FROM waha_events WHERE created_at < now() - interval '30 days';
