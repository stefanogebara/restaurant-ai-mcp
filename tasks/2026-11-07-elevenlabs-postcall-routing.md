# Seatable post-call routing

- [x] Confirm a provider call exists but is missing from `agent_conversations`.
- [x] Confirm the agent inherits a disabled workspace webhook for another product.
- [x] Create a Seatable-only HMAC endpoint without changing workspace defaults.
- [x] Set its signing secret and webhook ID in Vercel project configuration.
- [x] Require the Seatable webhook override on both agent creation paths.
- [x] Preserve provider call start time and caller number for webhook-only calls.
- [x] Run API tests, frontend tests, build, and syntax checks.
- [ ] Merge after PR checks pass and verify the production alias by exact SHA.
- [ ] Probe the production receiver with a signed non-call event.
- [ ] Set the per-agent override only for active Seatable agent IDs.
- [ ] Backfill the observed historical call and verify it in the dashboard.

## Review

The ElevenLabs workspace default is shared with other products. This change
deliberately leaves it alone. New Seatable agents will fail creation if the
Seatable-specific webhook ID is absent, before creating any provider tools.
The existing-agent repair and historical backfill are operational follow-ups;
neither is implied by this code change alone.
