-- Dedup log for manager briefings.
-- One row per (restaurant, type, date). INSERT fails if already sent today.
CREATE TABLE IF NOT EXISTS briefings_log (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id  uuid NOT NULL,
  briefing_type  text NOT NULL,
  sent_date      date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT briefings_log_dedup UNIQUE (restaurant_id, briefing_type, sent_date)
);
