# WhatsApp receiver isolation and retry safety — 2026-10-20

- [x] Confirm central production project and current schema without modifying data.
- [x] Confirm receiver ownership configuration, quarantine legacy sessions, and remove first-restaurant fallback.
- [x] Carry the verified receiving account into replies and demo phone linkage.
- [x] Move completion dedup after processing; return retryable status on transient failures.
- [x] Add focused A → B → A, unknown receiver, legacy/expired session, and failed-delivery tests.
- [x] Verify provider webhook retry responses, pre-send reservation and completion-store failure behavior in tests.
- [x] Review migration syntax, RLS, scoped sessions and rate function in disposable Postgres 16.
- [ ] Apply migration to the confirmed Seatable project before the code deploy.
- [x] Run focused/full backend, frontend and build verification; repeat after final fixes.
- [x] Address final independent release-safety review (provider ownership, rating recovery, PDF send boundary, demo route fingerprint).
- [ ] Create one scoped PR, verify checks, merge; confirm exact production SHA and safe smoke.

Production facts observed: Seatable Supabase is `ckforlwdhewexyqljsaf` and the
production `SUPABASE_URL` points there; no `CENTRAL_SUPABASE_URL` is configured.
There are 66 legacy sessions. Meta's configured restaurant is active. Twilio's
configured restaurant is inactive. WAHA has no restaurant mapping and no events
in the last 30 days. Do not send a real guest message for verification.

Verification checkpoint: 305 backend suites (4441 tests) and 138 frontend files
(1102 tests) passed; frontend build, JS syntax, fire-and-forget and phantom-column
audits passed. Subsequent focused tests for the final picker-group fingerprint,
demo retry and rating recovery also passed; the PR gate will repeat the full
backend run after the last test addition.
Disposable Postgres 16 accepted the amended migration, including inbound rating
keys; A/B sessions coexist for one guest, atomic A/A/B rate counts were 1/2/1,
and authenticated cannot execute the rate function or read the reply table.
Production has no `whatsapp_rate_bump` function today, so the current fallback
is per-Lambda memory. No production migration, deploy or real message yet.
