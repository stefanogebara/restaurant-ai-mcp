-- Phase CC: seed cron_config row for the new compress-memories cron.
INSERT INTO public.cron_config (job_name, enabled, notes) VALUES
  ('compress-memories', true, 'Weekly Saturdays 04:30 UTC — deactivates observations covered by newer reflections + low-signal / TTL-old rows')
ON CONFLICT (job_name) DO NOTHING;
