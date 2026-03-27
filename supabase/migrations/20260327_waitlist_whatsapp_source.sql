-- Add WhatsApp source tracking to waitlist
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'walk_in',
  ADD COLUMN IF NOT EXISTS customer_whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

-- Index for filtered queries
CREATE INDEX IF NOT EXISTS idx_waitlist_source ON public.waitlist (restaurant_id, status, source);

-- Comment
COMMENT ON COLUMN public.waitlist.source IS 'How customer joined: walk_in, whatsapp, phone';
COMMENT ON COLUMN public.waitlist.customer_whatsapp IS 'WhatsApp number for notifications (E.164)';
COMMENT ON COLUMN public.waitlist.notified_at IS 'When table-ready notification was sent';
