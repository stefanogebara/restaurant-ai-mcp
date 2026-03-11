-- Add reminder tracking columns to reservations table
-- Required by the send-reminders cron job (api/cron/send-reminders.js)

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Index for efficient cron query (find reminders not yet sent for today)
CREATE INDEX IF NOT EXISTS idx_reservations_reminder_sent
  ON public.reservations(date, reminder_sent)
  WHERE reminder_sent = FALSE;

COMMENT ON COLUMN public.reservations.reminder_sent IS 'Whether a reminder WhatsApp message has been sent for this reservation';
COMMENT ON COLUMN public.reservations.reminder_sent_at IS 'Timestamp when the reminder was last sent';
