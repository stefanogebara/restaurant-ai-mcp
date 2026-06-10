
## 2026-06-10: git stash dance + concurrent session = silent loss of client-side work

**Context**: To verify a test failure was pre-existing, I ran `git stash push && vitest && git stash pop` while ANOTHER Claude session was actively committing to the same repo (the demo.js bisect / services→_services rename session). Between my push and pop, the other session committed `2a1ef96c`, which swept up my popped backend changes (good luck) — but its cleanup wiped ALL my uncommitted client-side onboarding fixes (~10 files). Had to redo them from context.

**Rules**:
- NEVER use a stash push/pop round-trip to test HEAD when a concurrent session may be active. Use `git worktree add` (isolated copy) or just accept the dirty-tree test result.
- When `git status` shows huge unexplained churn (hundreds of untracked files, renames you didn't make), ASSUME a concurrent session is active and commit your own work IMMEDIATELY with explicit `git add <my-files-only>`.
- Detection signals: HEAD hash changes between commands; stash list shows entries created on commits you don't recognize; system notes that files were "modified by user or linter" when you didn't run one.
- Commit early when working long multi-file changes — the cost of a WIP commit is near zero; redoing 10 files from context costs 30+ minutes.

**Cost**: ~40 minutes redoing client edits + verification.

## 2026-06-03: the single-project `supabase` MCP can be pointed at the wrong project

**Context**: spent ~2 hours debugging "PostgREST returns PGRST205 — table not in schema cache" for `restaurant.instagram_connections`. NOTIFY pgrst, DROP+CREATE, GRANTs, RLS policies — none helped. Eventually restarted the project. STILL got 404.

**Root cause**: the `mcp__supabase__*` tools (no project_id param — they're scoped to one project at MCP-init time) were silently pointed at a DIFFERENT project (`lurebwaudisfilhuhmnj`, probably twin-ai-learn), NOT the project I was working on (`ckforlwdhewexyqljsaf` = seatable-eu). Every `apply_migration` and `execute_sql` call landed in the wrong DB.

Misleading clues that made this hard to spot:
- `list_tables` showed `restaurant.pos_connections` + `restaurant_config` — looks like the right project. But twin-ai-learn ALSO has a `restaurant` schema with similar tables (it shares the seatable family of projects).
- Migrations succeeded silently. apply_migration returned `{success: true}`.
- `restart_project` "worked" but on the wrong project.
- The lurebwaudisfilhuhmnj appeared in `get_logs` output but I assumed it was log aggregation across projects, not the actual target.

**Fix**:
- Use `mcp__claude_ai_Supabase__*` (the multi-project variant) with explicit `project_id: 'ckforlwdhewexyqljsaf'` for anything touching seatable.
- Call `mcp__supabase__get_project_url` at the start of every Supabase MCP session — if the URL doesn't match `SUPABASE_URL` in `.env.local`, switch to the multi-project variant.
- When PGRST205 persists after migration + restart, suspect the migration didn't run where you think.

**Cost**: 5 commits chasing imaginary cache problems, one project restart on seatable that wasn't needed, ~2h of session time.

## 2026-06-02: sentinel string in a FK-shaped column is a time-bomb (campaigns)

**Context**: `retention_campaigns` was originally designed 1:1 — one row per (customer, win-back) pair. `customer_id` was `TEXT NOT NULL`, semantically the phone number of the recipient. When bulk segment WhatsApp campaigns were bolted on, ONE row represents N customers, so there's no single recipient to point at.

The pragmatic fix this session was to set `customer_id = 'segment:${segment}'` (e.g. `segment:all`, `segment:vip`). Combined with a `DROP NOT NULL` migration, this got the feature working without a schema redesign. Both the audit's security and reviewer agents flagged it as a smell.

**Why it's a time-bomb**:
- `customer_id` reads as a foreign key. Future me (or a teammate) will see it and assume `JOIN customer_ltv ON customer_id` works.
- That JOIN will silently produce zero rows for bulk campaigns — no error, just empty result sets that look like "no data" rather than "bad query".
- The sentinel prefix is invisible in dashboards, JSON dumps, and most SELECT * outputs.

**Why we deferred the cleanup**:
- Today, no code path actually JOINs against `retention_campaigns.customer_id` from a customer table. The risk is purely future-tense.
- A proper fix is non-trivial: NULL out existing sentinel rows in a migration, audit every callsite that reads `customer_id` back, and switch to a `kind: 'bulk' | '1:1'` column or repurpose `campaign_type` for that distinction.

**Rules**:
1. **At design review for any query that reads `retention_campaigns.customer_id`**: if it's being JOINed or compared against `customer_ltv.customer_id`, STOP and either filter by `customer_id LIKE 'segment:%'` to exclude bulk rows, or finally do the refactor.
2. **Never use a sentinel string in a column whose name suggests a FK.** If the column has to live, rename it (e.g. `customer_id` → `customer_id_or_segment_sentinel` — ugly but honest). Better: make the column nullable + add a discriminator column.
3. **When bolting a new use-case onto an existing table**, the cost of one migration to add `discriminator` is much lower than the cost of a year of "why are my JOINs empty for half the rows" debugging.

## 2026-05-29: "bad_signature" from Stripe was actually local clock drift — 6 hours of redirected debugging

**Symptom**: Live signed probes to the new `/api/stripe-connect-webhook` all returned HTTP 400 `{reason: "bad_signature"}`, despite:
- Local roundtrip (sign + verify with same secret) succeeding instantly
- `vercel env pull` confirming the secret was the rotated value
- Server-side SHA-256 fingerprint of `process.env.STRIPE_CONNECT_WEBHOOK_SECRET` exactly matching the local fingerprint
- Body length matching between what the client sent and what the server's stream reader collected

**What I missed**: My local Windows clock had drifted ~3h33m behind UTC (`date -u` showed 08:06, real UTC was 11:39). Stripe's `generateTestHeaderString` stamps `t={UnixSeconds}` onto the signature header. `constructEvent` on the server then rejects payloads whose `t` is more than 5 minutes outside the receiver's clock. The error string is literally `Timestamp outside the tolerance zone` but the SDK rethrows under the same `StripeSignatureVerificationError` constructor and our handler returned a generic `bad_signature`.

I spent 6+ hours chasing this through:
- 3 separate Stripe webhook secret rotations
- moving the file 3 times (`api/stripe-connect-webhook.js` → `api/stripe/connect/webhook.js` → back)
- adding/removing `module.exports.config = { api: { bodyParser: false } }`
- writing a stream-reader fallback
- pushing diag commits to read `secret_fp` out of Vercel runtime logs

The root cause was 4 lines of Node:
```js
console.log('local: ', Math.floor(Date.now()/1000));
console.log('actual:', Math.floor(new Date((await fetch('https://www.google.com',{method:'HEAD'})).headers.get('date')).getTime()/1000));
```

**Rules**:
1. **When signature verification fails, log the receiver's error message verbatim before assuming "bad secret"**. Stripe distinguishes "No signatures found matching the expected signature for payload" (secret/body mismatch) from "Timestamp outside the tolerance zone" (clock skew). Surface that distinction in the handler's catch.
2. **Compare clocks before chasing crypto**. Any HMAC scheme with a `t=` field will fail identically for clock drift and for wrong-key — and the fix is completely different. First thing to check on a signature failure is `Date.now()` vs an authoritative source.
3. **Signed-test scripts must use network time, not OS time.** `scripts/_lib/network-time.mjs` is the durable fix — every future signed probe imports `networkUnixSeconds()` and `warnIfDriftExceedsTolerance()` from there.

## 2026-05-28: "fixed" the auth race, missed the auth expiry — two distinct failure modes look identical from one screenshot

**Symptom**: Live E2E customer signup → Stripe Checkout → Santander 3DS sat for ~2h → return to `/subscription/success` → "Não foi possível confirmar o pagamento". The exact UI I thought I'd permanently fixed with the BUG #17 patch a session earlier.

**What I missed**: BUG #17 was the *race-on-mount* case — `authFetch` fired before `INITIAL_SESSION` resolved, sending no Authorization header → 401. My fix added `await authReady` so the call waited for Supabase to hydrate. Verified live, shipped, closed.

The screenshot from production looked identical, but the underlying mode was different: the user *had* a Supabase session for ~2 hours, then the JWT actually expired during the 3DS wait. `authReady` resolved instantly (it had long since fired). `getSession()` returned the stale token. `verify-session` got 401 with a real Authorization header. Same UI, completely different fix.

**Rule**: two screenshots that show the same error message don't necessarily share a root cause. When closing an auth/race bug, enumerate the failure modes explicitly:
1. Token *not yet present* (mount race) — the case I fixed
2. Token *expired* (long flow, idle session, etc.) — the case I missed
3. Token *invalid* (signed by wrong key, malformed, etc.) — separate

The fix for (1) is "wait for auth to be ready". The fix for (2) is "refresh before calling". They're orthogonal — handling (1) does not handle (2). My audit report celebrated 19/20 fixes and verified the race fix in prod; I never simulated a 2h-stale session.

**Verification recipe for long-flow auth**: if the fix involves auth tokens AND the user is redirected away from your app for an indeterminate amount of time, you MUST test the case where the token has expired between leaving and returning. Two ways:
1. Manually mutate `localStorage` (set the Supabase session's `expires_at` to 5 minutes ago) before triggering the return path.
2. Use a real long delay — Stripe Checkout with a 3DS step that you don't approve is a natural source.

The fix here was: refresh `supabase.auth.refreshSession()` before `authFetch`, retry once on 401, and even if the verify-session call ultimately fails, still set `LS_PAYMENT_VERIFIED_AT` and render the "Activating" state — because the URL having `session_id=` is itself proof that Stripe processed the customer. Don't let a backend-read failure render as a "payment failed" UX when the source of truth (Stripe) says otherwise.

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

## 2026-06-05 — PowerShell mass-replace corrupts UTF-8 multi-byte sequences

**Symptom:** Vercel build errors with `Invalid regular expression: /[\xCC\x80-\xCD\xAF]/g: Range out of order` and Portuguese text shows mojibake (`Previsão` → `PrevisÃ£o`).

**Root cause:** Used PowerShell's `Get-Content -Raw` + `Set-Content -NoNewline -Encoding UTF8` for mass-replace passes. On Windows, `Get-Content` reads as the default ANSI codepage (cp1252) when the file lacks a BOM, then writes back as UTF-8 — every non-ASCII byte sequence gets re-encoded into garbage.

**Prevention:** For mass-replace across many files, use Python (which always handles UTF-8 cleanly):
```python
with open(f, 'rb') as fp: raw = fp.read()
text = raw.decode('utf-8')
text = text.replace('bg-white', 'glass-card')  # etc
with open(f, 'wb') as fp: fp.write(text.encode('utf-8'))
```
Or use `iconv`/`sed` with explicit encoding flags. Never use Get-Content + Set-Content on files with non-ASCII content on Windows.

**Recovery:** If already corrupted, reverse via:
```python
repaired = corrupted_text.encode('cp1252').decode('utf-8')
```
Files containing PT-BR / accented chars often need this; pure-ASCII files are fine.


## 2026-06-10 — Vercel silently drops functions that require() sibling handlers

**Symptom:** `/api/demo` and `/api/contact` returned the api-not-found catch-all (404) in prod despite the files existing, passing `node --check`, and having a valid `module.exports = async (req,res)` signature. No error in the 19-min build log. `vercel inspect` showed 236 functions deployed vs 238 expected.

**Root cause:** `api/demo.js` had `require('./enrich-restaurant')` — a sibling handler file whose own export was `module.exports = httpHandler`. Vercel's NFT (per-function dependency tracer) treats a function-importing-a-function as a loop and silently DROPS the importing function from the deploy manifest. The 3-line diagnostic stub deployed fine, proving it was content/import-graph dependent, not the file path.

**Diagnosis method that worked:** bisect the handler over multiple deploys — stub the whole body (deployed → imports fine), restore body but stub one block at a time. Narrowed 660 lines → the `if(hasScrape)` block calling `enrichRestaurant` + `derivePersonalityFromScrape`.

**Prevention:** NEVER `require()` a sibling handler from another handler. Extract shared logic to `api/_lib/`. Both callers import the `_lib` module; neither imports the other.

**Detection:** `scripts/find-missing-funcs.mjs` curl-probes every expected `/api/<name>` and flags any returning the catch-all JSON. Run after big refactors.

## 2026-06-10 — Library code under api/ deploys as broken functions

**Symptom:** `/api/services/chartService` etc. returned FUNCTION_INVOCATION_FAILED (500) in prod; deploys traced + bundled 43 service files + 8 ml + 6 voice-server as serverless functions, ~146s wasted build.

**Root cause:** Vercel deploys every `.js` under `api/` as a function unless the dir starts with `_`. `api/services/`, `api/ml/`, `api/voice-server/` were all library code (`module.exports = {...}`) in function-eligible paths.

**Fix:** `git mv api/services api/_services` (and `_ml`, `_voice-server`); rewrite all `require('...services/...')` import paths. Underscore-prefixed dirs are bundled as deps for importing handlers but never deployed as standalone functions.

**Caveat:** A rename script that regex-rewrites `services/` imports will ALSO hit `client/src/services/` (an unrelated frontend tree). Scope the rewrite to `api/` + `scripts/` only, or revert `client/` afterward.

## 2026-06-10 — CRON_SECRET must never be embedded in third-party configs

**Symptom (security review):** `elevenlabsAgentService` put `CRON_SECRET` as a Bearer header in ElevenLabs agent tool definitions — stored on ElevenLabs's servers, and not tenant-scoped (any holder could act as any restaurant via the restaurant_id query param).

**Fix:** per-restaurant secret (`elevenlabs_webhook_secret` column, `el_whsec_<hex>`), validated in the webhook BY the claimed restaurant_id (tenant-bound). Rotation script re-pointed all 21 agents, then CRON_SECRET was rotated dead.

**Prevention:** Internal credentials (CRON_SECRET, service-role keys) NEVER leave our infra. Anything handed to a third party (webhook tool defs, embed snippets) gets a dedicated, rotatable, tenant-scoped secret.

**Vercel CLI gotcha:** `vercel env add` via piped stdin silently stored empty/garbage values and created write-only "sensitive" vars. Use the Vercel REST API (`POST /v10/projects/{id}/env`) with `decrypt=true` round-trip verification instead.
