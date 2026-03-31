-- Campaign Automations: automated trigger-based campaigns
-- Phase 4A: Database migration for automated campaign engine

CREATE TABLE IF NOT EXISTS restaurant.campaign_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'post_visit_thank_you',
    'birthday_reminder',
    'anniversary_reminder',
    'lapsed_30d',
    'lapsed_60d',
    'lapsed_90d',
    'review_request'
  )),
  enabled BOOLEAN DEFAULT false,
  channel TEXT DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp')),
  delay_minutes INTEGER DEFAULT 120,
  google_review_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(restaurant_id, trigger_type)
);

CREATE TABLE IF NOT EXISTS restaurant.campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID,
  name TEXT NOT NULL,
  trigger_type TEXT,
  subject TEXT,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant.automation_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  customer_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  period TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(restaurant_id, customer_id, trigger_type, period)
);

-- Enable RLS
ALTER TABLE restaurant.campaign_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant.automation_send_log ENABLE ROW LEVEL SECURITY;
