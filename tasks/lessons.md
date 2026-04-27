
## 2026-04-27: WAHA pipeline — false-alarm investigation, real lesson is the gate

**Investigation**: Vercel logs showed ~15 `[WAHAAdapter] WAHA webhook: invalid X-Api-Key` errors/day. `waha_events` table showed 660 sig_invalid in recent history vs only 125 successful (received+processed), with the most recent `processed` event on 2026-04-24. Initial conclusion: 3-day silent regression from key drift between Vercel and Fly.io.

**Actual state**: All 3 key sources are byte-identical (`seatable-waha-key-2026`) — verified by hex compare:
- Local `.env.local` (22 bytes)
- `vercel env pull` (22 bytes)
- WAHA's session config from `GET seatable-waha.fly.dev/api/sessions/default` (22 bytes)

A direct probe (`POST /api/waha-webhook` with the matching header + non-group payload) successfully fired a `received` row, proving the auth chain is intact today.

The historical `sig_invalid` events were likely a mix of: (a) probe traffic / scanners, (b) retries from a since-fixed misconfig, (c) my own debug probes. We can't distinguish from the data because `logWahaEvent('sig_invalid')` is called with no metadata.

**Rules (still load-bearing)**:
1. When rotating a webhook auth secret, do it on SENDER + RECEIVER atomically. The window where they disagree = silent message loss.
2. Always log enough metadata on signature failures to distinguish probe traffic from real misconfig (at minimum `headers['user-agent']` or remote IP).

**CI gate**: `scripts/audit-waha-health.js` (real value, regardless of false alarm). Fails if 24h has `sig_invalid >= 5` AND zero `received`/`processed`. Skips when traffic is zero. Currently passes.

**Diagnostic toolkit** (saved for next investigation):
- `flyctl secrets list -a seatable-waha`
- `flyctl config show -a seatable-waha`  (env vars are here, not in secrets)
- `npx vercel env pull` (after `vercel link`)
- `GET ${WAHA_URL}/api/sessions/default` (reveals webhook config including X-Api-Key value)

---

## 2026-04-26: Migration files in repo aren't auto-applied to prod

**Mistake**: `supabase/migrations/20260411_whatsapp_test_messages.sql` and `20260316_voice_experiments.sql` shipped in the repo but were never executed against the live DB. Code that reads/writes those tables silently failed: WhatsApp test cooldown protection was disabled (real test messages dispatched without rate limiting), and `/api/voice-experiments.js` had 4 broken queries.

**Rule**: Every migration MUST be applied to the live DB. Vercel builds don't auto-run them. Either run `supabase db push` (requires `SUPABASE_ACCESS_TOKEN`) or paste the SQL into Supabase Studio. Then `npm run audit:migrations` to verify.

**CI gate**: `scripts/audit-migrations-applied.js` parses every CREATE TABLE in `supabase/migrations/`, probes each via PostgREST, fails if any are missing in prod. Wired into `live-smoke.yml`.

**Caught by**: WhatsApp Send Test E2E (`scripts/test-whatsapp-send-test.js`) — the seed insert failed with "Could not find the table" pointing at the drift. Audit script then surfaced the second one (voice_experiments).

---

## 2026-04-25: Title-Case keys silently dropped in Supabase migration

**Mistake**: When migrating from Airtable to Supabase, `api/services/dashboard/party-actions.js` and `table-actions.js` kept passing Airtable-shape Title-Case keys (`'Service ID'`, `'Customer Name'`, `'Status'`, `'Actual Departure'`) to the new snake_case DB layer (`createServiceRecord`, `updateTable`, `updateServiceRecord`). The DB functions read `fields.service_id` etc. — every Title-Case key became `undefined`. seat-party returned 500 (NULL constraint), complete-service / mark-table-clean / update-table-status silently no-op'd. Tests asserted the broken Title-Case shape, locking in the bug.

**Rule**: After any Airtable→Supabase migration, the caller MUST use the same casing as the DB layer reads. Audit pattern:

```bash
grep -rnE "'[A-Z][a-zA-Z ]+':\s" api/services/ api/host-dashboard.js
```

When writing tests, assert against the snake_case shape that actually hits the DB. If a test passes Title-Case to a snake_case-reading function, the test is wrong.

**Caught by**: `scripts/test-walkin-lifecycle.js` — the first E2E that actually hit prod and asserted DB state. Unit tests with mocked DB layers couldn't catch it because they were asserting the broken contract.

**Fix commit**: `2f99f82d`.

---

## 2026-04-20: WAHA test webhooks send real messages
**Mistake**: Sent curl test webhooks to the production WAHA pipeline without suppressing sendMessage — bot replied to fake/random phone numbers via the user's real WhatsApp account.

**Rule**: ALL curl/E2E test webhooks to `/api/waha-webhook` MUST include `X-Test-Mode: true` header. This runs the full AI pipeline (session, routing, AI response) but suppresses the actual WhatsApp send.

**Example**:
```bash
curl -X POST https://seatable.one/api/waha-webhook \
  -H "x-api-key: seatable-waha-key-2026" \
  -H "X-Test-Mode: true" \
  -H "Content-Type: application/json" \
  -d '{"event":"message","session":"default","payload":{"id":"test-001","from":"5511977665544@c.us","fromMe":false,"body":"...","type":"chat","hasMedia":false}}'
```
