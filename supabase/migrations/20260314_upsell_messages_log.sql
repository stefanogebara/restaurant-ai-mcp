-- Upsell Messages Log
-- Tracks pre-reservation upsell WhatsApp messages for dedup + analytics.

CREATE TABLE IF NOT EXISTS public.upsell_messages_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  reservation_id TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'pre_reservation_upsell',
  message_content TEXT,
  whatsapp_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_upsell_reservation_type UNIQUE (reservation_id, message_type)
);

CREATE INDEX IF NOT EXISTS idx_upsell_restaurant_sent
  ON public.upsell_messages_log (restaurant_id, sent_at);

-- RLS: only service role (cron jobs) can access this table
ALTER TABLE public.upsell_messages_log ENABLE ROW LEVEL SECURITY;
