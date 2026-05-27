
## 2026-05-27: bundle-grep + typecheck don't catch TDZ — load the page

**Symptom**: a BUG #24 fix added a `useEffect(() => {…}, [rawTimeSlots, selectedTime])` to BookingForm.tsx. I placed the new effect ABOVE the `useTimeSlots()` call that defines `rawTimeSlots`. TypeScript compiled clean. `npx tsc --noEmit` passed. Bundle-grep verified the new disabled-reason strings shipped to prod. Smoke-tests called "verified". For ~1 hour every visitor of `/book/:slug` hit the React error boundary ("Esta página encontrou um erro") because reading `rawTimeSlots` in the deps array threw `ReferenceError: Cannot access 'T' before initialization`.

**Why nothing caught it**:
- **TypeScript** can't see TDZ — `const` is hoisted-by-name, initialized at the binding site; tsc allows referencing a `const` before its declaration in the same scope. The runtime error is JavaScript semantics, not a type error.
- **Bundle-grep** found the new strings ("Pick a date to continue"), confirming the code shipped. But minified output contains the strings whether the surrounding code throws or not.
- **Vitest** is currently broken at the env-setup level on this repo (jsdom not loading in 377/394 files) — couldn't have helped here even if I'd run it.

**Rule**: any change that adds, reorders, or moves a hook/effect in a React component MUST be browser-verified by actually loading the affected page in Playwright before declaring the fix shipped. Bundle-grep + typecheck = necessary, not sufficient. The check is one extra `browser_navigate` + read `document.body.innerText` (look for "encontrou um erro" / "Caught error" / empty body) — costs seconds, catches every TDZ + render-time crash.

**Mechanical fix recipe**: in the BookingForm case the corrected ordering is:

```tsx
// All useState declarations first
// THEN useTimeSlots() etc. that produce `rawTimeSlots`
const { data: rawTimeSlots = [] } = useTimeSlots(...);

// THEN any useEffect that references `rawTimeSlots`
useEffect(() => { /* read rawTimeSlots */ }, [rawTimeSlots, ...]);
```

Always put effects that depend on a derived value *after* the line that creates it.

## 2026-05-18: /research's "5-layer 500" — missing GRANTs on new tables hide behind 4 other bugs

**Symptom**: Step 6 "Iniciar Entrevista" → `/api/restaurant-learning/research` returned `FUNCTION_INVOCATION_FAILED` on every fresh account, even after a full day of audit fixes. Took 5 sequential root-cause peels to fully unblock.

**The 5 layers, in order**:

1. **`restaurant.learning_interviews` table didn't exist** — code wrote to it but only `public.restaurant_intelligence` existed (empty orphan). Fixed in `20260518_restaurant_learning_tables.sql`.

2. **`restaurant_config.learning_status` column didn't exist** — code called `.update({ learning_status: 'scraping' })` to track interview progress. Fixed in `20260518_add_learning_status_column.sql`.

3. **Intelligence-gathering Promise.race chained past lambda budget** — Tier 1 (Google Places) + Tier 2 (website + LLM extract) + Tier 3 (Custom Search) timeouts could overlap to ~96s on a 60s lambda. Tried a 45s budget race; introduced an unhandled-rejection race.

4. **Detached fire-and-forget promise crashed the lambda** — Vercel kills serverless functions immediately after `res.json()` returns. The deferred gather's pending fetches got aborted mid-flight, raising an uncaught rejection that the runtime reported as FUNCTION_INVOCATION_FAILED (NOT the standard 500 my catch would have produced). Pinpointed by `?debug=1` short-circuit returning 200 cleanly while the full path still 500'd. Fix: drop the deferred gather entirely; backfill via cron or on-demand endpoint.

5. **service_role had no privileges on the new tables** — `CREATE TABLE` doesn't auto-GRANT to Supabase roles. Direct SQL via the dashboard worked (postgres superuser). supabase-js calls from the lambda returned "permission denied for table learning_interviews". Surfaced only by wrapping `startOrResumeInterview` in an isolated try/catch that included `error.message` in the response. Fixed in `20260518_grant_service_role_learning_tables.sql`.

**Rule for new Supabase tables outside the default `public` schema**:
Every migration that creates a table in a non-public schema MUST end with:
```sql
GRANT USAGE ON SCHEMA <schema> TO service_role, authenticated, anon;
GRANT ALL ON <schema>.<table> TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA <schema> TO service_role;
```
Otherwise supabase-js from the lambda fails with "permission denied" — but if a higher-level catch swallows it, you'll see FUNCTION_INVOCATION_FAILED or a generic re-thrown error, and spend hours chasing the wrong layer.

**Rule for diagnosing FUNCTION_INVOCATION_FAILED on Vercel**:
The standard 500-with-body path is bypassed; this means an unhandled rejection or a runtime kill. Don't trust `res.json({error: 'generic'})` — wrap the suspected await in its own try/catch and include `err.message` directly in the response body. Then bisect by adding `?debug=N` short-circuits that return 200 at known checkpoints. The probe that returns 200 immediately above the first failing one identifies the throw.

**Rule for detached promises in serverless**:
Never do `Promise.resolve().then(...)` fire-and-forget in a Vercel function. The runtime kills the process when the response sends and pending I/O surfaces as a failed-invocation rather than a logged warning. Either complete the work synchronously, defer via a queue/cron, or use `context.waitUntil()` if you're on Edge.

**Caught by**: Full E2E onboarding audit — clicking "Iniciar Entrevista" on a freshly-created account. Took 9 commits + 3 migrations to fully resolve.

---

## 2026-05-17: Demo create silently aborted by adblock filters — three layered bugs in one button

**Symptom**: User on Brave clicked "Iniciar meu demo" → saw "Falha ao criar demo. Tente novamente." Vercel logs showed ZERO POST requests reaching `/api/demo?action=create` from that IP. curl from CLI worked. The failure mode looked like a backend bug; it was three independent client-side problems stacked.

**Bug 1 — Open-redirect guard rejected absolute URLs from our own backend** (`e8203b4a`):
`DemoSetupPage.tsx` had a safety check `demo_url.startsWith('/') && !demo_url.startsWith('//')` to prevent backend-injected phishing redirects. But `api/demo.js` returned `https://seatable.one/demo/<token>` (absolute, for use in the welcome email). Same URL was reused for the browser redirect → guard rejected it → generic createFailed toast. The user's first failure had nothing to do with adblock.

**Rule**: When the same value powers both an email link (must be absolute) and a browser redirect (must be relative per safety guard), DON'T conflate them. Emit two fields, or keep relative in the response and have the email handler prefix `BASE_URL`. Anti-pattern: `return res.json({ demo_url: demoUrl })` where `demoUrl` is whichever the email needed.

**Bug 2 — i18n country picker only matched English names** (`6f1310d8`):
`LocationSelector.tsx` filtered countries by `country.name.toLowerCase().includes(query)`. The data file stores English names ("Brazil", "Spain"). A pt-BR user typing "Brasil" got "Nenhum país encontrado" — the natural localized spelling failed in the localized UI.

**Rule**: When you have a fixed English data set rendered in a localized UI, the search filter MUST include `Intl.DisplayNames([i18n.language], { type: 'region' })` (or equivalent for other taxonomies) so users typing the native term hit results. Also normalize for diacritics (`.normalize('NFD').replace(/[̀-ͯ]/g, '')`) — "espana" should match "España", "brasilia" should match "Brasília". Search inputs that don't strip combining marks are broken for half the planet.

**Bug 3 — `?action=create` query pattern aborted by adblock filters** (`ce2ba6c3`):
`/api/demo?action=create` is shaped exactly like a tracking pixel URL. Aggressive uBlock Origin / Brave Shields filter lists match the `*?action=*` family heavily. User's Brave silently aborted the POST before it hit the network — Vercel never saw the request. Default Brave with stock Shields was fine; the user had a more aggressive extension or list. Renamed to RESTful `/api/demo/{create,session,convert}` via three `vercel.json` rewrites — backend code unchanged, old paths kept working for cached bundles.

**Rule**: Same-origin API endpoints should NOT use URL shapes that resemble ad/tracker pixels:
- ❌ `/api/X?action=create` (matches `*?action=*` filters)
- ❌ `/api/X?event=...` or `/api/track/...` (obvious)
- ❌ `/api/X?type=pixel|beacon|track|ping`
- ✅ `/api/X/create` (path-based verb, RESTful — safe across filter lists)

If you must keep the query-string form for legacy callers, add a path-based rewrite in `vercel.json` and migrate the frontend to the path version. Old bundles in users' caches don't break (additive change), new bundles dodge the filter.

**Diagnosis**: Vercel `get_runtime_logs` showed zero `/api/demo` hits while user was actively clicking. That gap (button clicked, no server log) was the smoking gun pointing at client-side blocking. Reproduced by launching Playwright against the real Brave executable (`scripts/brave-repro.mjs`), watched the request abort in `requestfailed` events. Stock Brave didn't reproduce it — only after adding aggressive filter rules did `/api/demo?action=create` get aborted, confirming the URL pattern as the trigger.

**Caught by**: User report → Vercel runtime logs filter on `/api/demo` showed zero requests in 90 min while user was actively retrying. Verification: `scripts/brave-full-verify.mjs` exercises all three fixes against real Brave in CI-runnable form.

---

## 2026-05-09: M3 status pill — 3 commits because I kept fixing the wrong renderer

**Mistake**: Audit flagged tables page rendering raw English DB enum ("Available") in PT-BR UI. Took 3 commits to actually fix:

1. `d4a885f6` — fixed `client/src/components/host/TableCard.tsx` with `STATUS_I18N_KEY` map but used wrong i18n path `tableStatus.X`. Real path is `settings.tableStatus.X`. `t()` silently fell back to the canonical English string. **Production unchanged.**

2. `28d12e06` — corrected the i18n path. Capacity label now translated ("X assentos" ✓), but status pill on `/host-dashboard/tables` still showed "Available". Reason: `/host-dashboard/tables` is rendered by `client/src/pages/TableConfigPage.tsx`, NOT `TableCard.tsx`. Different file, different inline component. **Production still showed "Available".**

3. `35e1915f` — fixed `TableConfigPage.tsx` (the actual renderer), with two sub-bugs:
   - Color comparisons (`table.status === 'available'`) checked lowercase but DB stores capitalized enum (`'Available'`) → always fell to amber default
   - i18n lookup `t(\`settings.tableStatus.${table.status}\`)` interpolated raw `'Available'` but JSON keys are lowercase

**Final fix pattern (reusable)**:
```tsx
const lower = (table.status || '').toLowerCase();
const statusKey = lower === 'being cleaned' ? 'cleaning' : lower;  // DB enum → JSON key
// Use `statusKey` for BOTH color switch and i18n lookup
```

**Rules**:
1. **Identify the renderer first.** Before fixing UI bugs, grep the route file for the component name actually mounted on that route, then trace its children. `/host-dashboard/tables` → `TableConfigPage.tsx`, not the obviously-named `TableCard.tsx`.

2. **DB enums and JSON keys must agree on case.** Any `t(\`namespace.${dbValue}\`)` lookup is a bug if `dbValue` is from a DB enum and the JSON keys are lowercase. Normalize at the boundary.

3. **Verify production bundle, not just commits.** Probe: `curl /assets/<chunk>.js | grep <fix-pattern>`. Bundle hash changes = new deploy. Confirms code shipped without needing an authenticated browser session.

4. **Diff bundles before re-running visual tests.** If the bundle hasn't changed, the fix isn't live — don't waste a Playwright run.

**Verification toolkit** (saved for next time):
- `Invoke-WebRequest /assets/index-X.js` then regex for asset chunk names → find the route's lazy chunk
- Grep chunk for fix-distinctive strings (e.g., the literal `"being cleaned"?"cleaning"` mapping)
- Grep main bundle for i18n catalog: `[regex]::Matches($c, 'tableStatus:\{[^}]+\}')` returned all 3 locales (en/pt-BR/es) in one shot

---

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
