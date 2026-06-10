-- Per-restaurant webhook secret for ElevenLabs agent tool calls.
--
-- Why: agent tool definitions embed a Bearer token in request_headers,
-- and that token is stored on ElevenLabs's servers. Previously we used
-- the global CRON_SECRET there — meaning (a) a third party held our
-- internal cron credential, and (b) the token wasn't tenant-scoped, so
-- any holder could act as ANY restaurant by changing the restaurant_id
-- query param. A per-restaurant secret fixes both: leaking one secret
-- only exposes that restaurant, and the webhook validates the secret
-- against the restaurant_id it claims.
--
-- Secrets are generated lazily by elevenlabsAgentService on agent
-- creation, and backfilled for existing agents by
-- scripts/rotate-elevenlabs-secrets.mjs.

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS elevenlabs_webhook_secret TEXT;

COMMENT ON COLUMN restaurant.restaurant_config.elevenlabs_webhook_secret IS
  'Per-restaurant Bearer token embedded in ElevenLabs agent tool definitions. Validated by api/elevenlabs-webhook.js. NOT the global CRON_SECRET.';
