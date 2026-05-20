-- Phase V.5: seed cron_config rows for the 6 crons newly wired with the
-- isCronEnabled() kill switch. Without these rows the helper still returns
-- true (fail-open) so the cron keeps running — but ops can't actually turn
-- them off until the row exists. ON CONFLICT DO NOTHING is safe to re-run.
INSERT INTO public.cron_config (job_name, enabled, notes) VALUES
  ('check-late-reservations',       true, 'Every 15 min — auto no-show 20+ min late'),
  ('cleanup-expired-demos',         true, 'Daily 3 AM — delete expired demo restaurants'),
  ('cleanup-waitlist',              true, 'Drop stale waitlist entries'),
  ('cleanup-whatsapp-dedup',        true, 'Prune WhatsApp inbound dedup cache'),
  ('refresh-restaurant-profiles',   true, 'Weekly — refresh Google Maps profile data'),
  ('warm-seo-cache',                true, 'Daily 2 AM — pre-warm SEO pages')
ON CONFLICT (job_name) DO NOTHING;

COMMENT ON TABLE public.cron_config IS 'Phase U.3 + V.5: per-cron kill switch. Set enabled=false to skip a misbehaving cron without redeploying.';
