-- Phase U.2: Voice-note reminders are now opt-in per restaurant.
--
-- Before this column the send-reminders cron fired an ElevenLabs TTS
-- voice note for EVERY reservation at EVERY restaurant with a voice
-- config. At 5 reservations/day/restaurant that is $0.15/restaurant/day
-- in TTS cost -- $450/mo at 100 restaurants, $4,500/mo at 1,000. The
-- audit flagged this as the single biggest cost lever in the cron
-- portfolio.
--
-- Default FALSE -- existing restaurants keep getting the regular text
-- WhatsApp reminder (free intra-conversation, no quality loss). Owners
-- who actively want voice reminders flip the flag from the dashboard.
--
-- Applied to prod 2026-05-20 via Supabase MCP.

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS reminder_voice_notes_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN restaurant.restaurant_config.reminder_voice_notes_enabled IS
  'Opt-in for ElevenLabs TTS voice note reminders alongside the text reminder. Default false because TTS adds ~$0.03/reminder.';
