-- Phase Y.5: seed cron_config rows for the 3 crons newly wired with the
-- isCronEnabled() kill switch:
--   - sync-conversation-data  (every 15 min — pulls ElevenLabs transcripts)
--   - validate-conversations  (every 15 min — flags AI booking errors)
--   - health-alert            (daily — WhatsApp alert when other crons stale)
--
-- Before Y.5 these three were tracked in vercel.json but undocumented in
-- CLAUDE.md and had no operational kill switch. The first two fire 192×/48h
-- which made them the highest-leverage targets for the kill-switch fan-out.
-- ON CONFLICT DO NOTHING is safe to re-run.
INSERT INTO public.cron_config (job_name, enabled, notes) VALUES
  ('sync-conversation-data',  true, 'Every 15 min — pulls ElevenLabs transcripts before 48h retention window expires'),
  ('validate-conversations',  true, 'Every 15 min — flags AI booking errors for manager review'),
  ('health-alert',            true, 'Daily 10 UTC — WhatsApp alert when other crons are stale')
ON CONFLICT (job_name) DO NOTHING;
