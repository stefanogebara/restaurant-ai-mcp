-- WhatsApp Test Messages
-- Stores owner-initiated WhatsApp test sends so the dashboard can show the
-- latest delivery state and avoid accidental duplicate sends.

CREATE TABLE IF NOT EXISTS public.whatsapp_test_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  recipient_phone TEXT NOT NULL,
  template_name TEXT,
  template_language TEXT,
  whatsapp_message_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'accepted',
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_test_messages_restaurant_requested
  ON public.whatsapp_test_messages (restaurant_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_test_messages_recipient_requested
  ON public.whatsapp_test_messages (restaurant_id, recipient_phone, requested_at DESC);

ALTER TABLE public.whatsapp_test_messages ENABLE ROW LEVEL SECURITY;
