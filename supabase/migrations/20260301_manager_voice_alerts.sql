-- manager_alerts_log: dedup one alert per type per restaurant per day
CREATE TABLE IF NOT EXISTS manager_alerts_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL
    REFERENCES restaurant.restaurant_config(id) ON DELETE CASCADE,
  alert_type text NOT NULL
    CHECK (alert_type IN ('low_covers','high_noshows','late_cancellations')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (restaurant_id, alert_type, date)
);

CREATE INDEX IF NOT EXISTS idx_manager_alerts_log_restaurant
  ON manager_alerts_log(restaurant_id, date);

-- RLS: service role only (cron-accessed, no user RLS needed)
ALTER TABLE manager_alerts_log ENABLE ROW LEVEL SECURITY;
