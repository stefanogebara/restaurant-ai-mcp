
## 2026-07-27 — Push verde no git não é deploy verde: o curinga do vercel.json come a entrada seguinte
Descobri por acidente, esperando um deploy que nunca ficava pronto: os QUATRO últimos
deploys do Seatable falharam e ninguém viu. Produção estava servindo o build de 25/jul
23:18 enquanto o repositório seguia em frente — o ETL de CNPJ, a cerca geográfica da
descoberta, a captura de fatos da Olímpia e uma correção de vazamento entre
restaurantes: nenhum estava no ar.
Causa: no bloco `functions` do vercel.json, a entrada `"api/cron/prospect-enrich.js"`
foi acrescentada DEPOIS do curinga `"api/**/*.js"`. A Vercel casa os padrões em ORDEM;
o curinga já havia reivindicado todas as funções, então a entrada específica ficou sem
par e o build morreu com `unused_function`. O arquivo existia, estava no git, exportava
handler válido e tinha sintaxe ok — o erro era a POSIÇÃO da linha no JSON. As outras 11
entradas específicas já estavam acima do curinga.
Regra: entrada nova em `functions` vai SEMPRE antes de qualquer curinga. E, mais
importante que a regra: depois de `git push`, CONFIRME o estado do deploy antes de
declarar qualquer coisa entregue — a mensagem de sucesso do git não diz nada sobre a
Vercel. Teste novo em `api/__tests__/vercel-config.test.js` faz a suíte falhar antes do
push (curinga tem que ser a última entrada; toda entrada específica aponta pra arquivo
existente; todo cron tem handler).

## 2026-07-27 — Sonda de saúde que grita sem emergência é pior que sonda nenhuma
Construí um diagnóstico ao vivo das integrações e a primeira execução em produção
devolveu "vermelho, 2 quebradas". Conferi uma a uma contra o fornecedor: DOIS dos três
alarmes eram erro meu.
(1) Resend: a chave de produção é de ENVIO (menor privilégio, que é o correto), então
`GET /domains` responde 401 "restricted to only send emails". O 401 vinha da PERMISSÃO,
não da autenticação — a chave estava perfeita e os e-mails saindo.
(2) Anthropic: sondei o fallback achando que era o primário. O cérebro do agente é o
OpenRouter (`ai-client.js:213`); a Anthropic só entra se ele cair. Pintei o sistema de
vermelho enquanto o agente atendia cliente normalmente.
Regra: antes de sondar uma dependência, leia o código pra saber QUAL é a primária, e
saiba o que cada 4xx daquele fornecedor significa — 401 de escopo ≠ 401 de auth. E
classifique por consequência real: falha de reserva é ATENÇÃO com o detalhe do que de
fato quebra (aqui, o `upsell-generator`, que usa o SDK direto e não tem fallback), não
FALHA. Mesma família do radar do Racha contando teste como cliente: métrica que exagera
treina o dono a ignorá-la, e aí ela não serve de nada no dia em que estiver certa.

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

## 2026-06-28 — "Redis unreliable on Vercel" was TWO stacked bugs (newline + dead DB)

**Symptom:** rate-limit.js + dedup/lock fallbacks had logged Redis as unreliable for months
(the April `dbsize=0` note). Prod logs showed, on every request:
`[Upstash Redis] The redis url/token contains whitespace or newline` +
`[RateLimit] Failed to initialize Redis, falling back to in-memory: ... invalid URL`.

**Root cause — bug 1 (newline):** both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
in Vercel had a trailing `\n` (URL 40→39 chars, token 64→63). `new Redis()` THREW on the
malformed URL → `redis=null` → whole app on per-instance in-memory fallback. Vercel's env
edit field even labels it: "This value starts and ends with whitespace and has return
characters." Fixed by re-entering the clean URL; for the secret token, trimmed the
pre-filled field value in-browser (`.trim()` via the native setter + dispatched `input`
event) so the secret was never typed/read — only its length/whitespace flags.

**Root cause — bug 2 (dead DB), revealed AFTER fixing bug 1:** init then succeeded
(`Using Upstash Redis store`) but the first `redis.incr()` failed with `error: 'fetch failed'`.
The DB host `inviting-dingo-55680.upstash.io` returns **NXDOMAIN** from both my machine AND
Vercel (`console.upstash.com` resolves fine → not a DNS fluke). A *paused* Upstash DB keeps
its DNS; NXDOMAIN = the database was **deleted**. The newline-throw-on-init had masked this
for months (init died before any fetch).

**Lessons:**
- Fixing a config bug can UNMASK a deeper one — always test the actual operation, not just
  "deploy succeeded." The init log "Using Upstash Redis store" is NOT proof Redis works;
  `new Redis()` doesn't validate connectivity. The real signal is a successful `incr`/`get`.
- A whitespace/newline in an env value is invisible in rendered UIs. Verify byte-for-byte:
  `JSON.stringify(value)` / check `.length`, not the rendered string.
- Counter-intuitive: fixing the newline made per-request cost slightly WORSE until a live DB
  exists — before, init threw so requests skipped Redis; after, every request attempts the
  dead DB → failed fetch → fallback. Either provision a real DB or remove the vars.
- Dedup + processing locks already use Supabase as PRIMARY (Redis is fallback only), so a
  dead Redis does NOT risk WhatsApp message-doubling — only weakens global rate-limiting
  (becomes per-instance) and no-ops the abuse failure-counters.

## 2026-07-03 — Workflow `args` payloads
Large payloads passed via the Workflow tool's `args` parameter arrived empty in
the agent prompt (cycle 6: coach reconstructed v7 from memory, dropping the
battle-tested objection rules). Same failure class as the cycle-2 literal
`${VAR}` bug. Rule: embed payloads (style pack bodies, briefs) INLINE in the
workflow script as JSON.stringify'd consts; use `args` only for small scalars —
and have the agent echo back a marker confirming it received the payload.

## 2026-07-14 — PostgREST: UPDATE com filtro or= → 42703 "coluna não existe"
O PostgREST do seatable-eu rejeita QUALQUER UPDATE que carregue filtro `or=`
com `42703: column prospect_leads.<coluna-do-or> does not exist` — a coluna
EXISTE, o mesmo `or=` funciona em GET, e `NOTIFY pgrst, 'reload schema'` não
muda nada. Custou caro duas vezes antes do diagnóstico: claimInbound (or
last_in_wamid) falhou em TODO inbound por 12 dias (degrade-open mascarou) e o
claim do resgate (or snoozed_until) NUNCA venceu → zero resgates na história.
**Lições:**
- "column X does not exist" com a coluna existente = suspeite da COMBINAÇÃO
  operação+filtro do PostgREST, não do schema. Reproduza com PATCH no-op
  (id=eq.uuid-inexistente) isolando cada parte: body-only, filtro-only, combo.
- Claim atômico condicional (UPDATE ... WHERE ... OR ...) → RPC SQL
  (security definer, service-role only). Não use `.update().or()` neste projeto.
- SEMPRE cheque `error` de um claim antes de tratar data vazio como "perdi a
  corrida" — erro silencioso vira "skipped" e o sintoma some do log.
- Degrade-open esconde falha crônica: se um guard "nunca" dispara (0 resgates,
  0 claims), teste o caminho real na produção em vez de confiar no verde local.

## 2026-07-20 — Envio falhado armazenado como turno = thread zumbi permanente
Meta WhatsApp instável (#131000) + timeouts deixaram 7 threads ativas mudas em
horário de pico. Duas armadilhas compostas:
- `sendReply` armazenava a parte cujo ENVIO falhou como turno 'out' → o
  histórico "acha" que respondeu, o guard `last_message_is_ours` bloqueia
  retry pra sempre, e o modelo nunca repete a mensagem que o lead não recebeu.
  **Regra: só mensagem ENTREGUE entra no histórico da conversa.** Um registro
  de tentativa é log/telemetria, nunca turno.
- Requeue por classe de erro (o fix do incidente 2026-07-06 cobria só "erro
  LLM") deixa TODA outra morte (timeout pré-claim, crash pós-claim, send 5xx)
  sem retry. **Regra: além dos requeues pontuais, ter UMA rede de varredura
  idempotente no cron ("último turno não-sys é do lead + X min sem resposta +
  dentro da janela → re-enfileira"), uma vez por inbound com re-arme** — cobre
  os modos de morte que ninguém previu. Idioma do marcador: coluna `*_em`
  comparada a `last_in_at` (mesmo padrão do nudge_em).
- Diagnóstico que funcionou: contagem por direção no DB (out parou? não —
  intermitente), get_runtime_errors do Vercel MCP (clusters agregados acham o
  #131000 na hora), e query por lead-id nos logs escopada por deploymentId.

## 2026-07-21 — Racha na Vercel NÃO tem integração Git (deploy é via API)
Push no github.com/stefanogebara/racha nunca cria deployment — todos os
deploys do racha sempre foram via REST API (meta "actor: claude-code" +
githubDeployment forjado pelo gitSource). Um push ficou 20 min "deployando"
até perceber. **Regras:**
- Racha: `git push && node scripts/deploy.mjs` (driver com gitSource + poll).
  Fix definitivo é o dono conectar o repo no dashboard (Settings → Git).
- Token do Vercel CLI local expira em ~8h (`auth.json` tem expiresAt em
  SEGUNDOS). O CLI instalado NÃO renova sozinho em `whoami` — o
  refresh_token + client_id público do bundle renovam via
  `vercel.com/.well-known/openid-configuration` → token_endpoint
  (grant_type=refresh_token). O deploy.mjs do racha faz isso automático.
- "Deploy não apareceu" ≠ "build lento": liste deployments por projectId
  ANTES de esperar — 0 deployments novos = trigger quebrado, não fila.

## 2026-07-21 — IDs de API têm formato REAL; não assuma o prefixo
Racha/Pagar.me: o adapter assumia que o id do recebedor começava com `rp_`
(chute do dia que escrevi o adapter, sem nunca ter criado um recebedor real).
Quando o Pagar.me finalmente liberou a criação no sandbox, a chamada retornava
2xx com `status:"active"` — recebedor CRIADO — mas o adapter REJEITAVA a
resposta válida porque o id real é `re_...` (ex.: `re_cmrv0eg8u...`), não `rp_`.
Custou 3 ciclos de deploy+diagnóstico até dumpar a resposta crua e ver o `re_`.
**Lições:**
- Nunca hardcode/regex um formato de id de API sem ter visto a resposta REAL
  de uma chamada de sucesso. Prefixos (`re_` vs `rp_`, `ch_`, `or_`, `cus_`…)
  são convenção do provedor, não adivinhável.
- Quando uma chamada "sem erro HTTP" falha na validação DO SEU código, dumpe a
  resposta crua ANTES de teorizar (embarquei `JSON.stringify(r)` no erro →
  achei o `re_` em 1 run). Erro de validação interna ≠ erro do gateway.
- "action_forbidden: not allowed to create a recipient" → "email is required"
  → "resposta sem rp_": cada erro DIFERENTE é progresso (o gate caiu, depois a
  validação, depois o meu bug). Ler a MUDANÇA da mensagem guia o próximo passo.
- Aceitar ambos os prefixos (`/^r[ep]_/`) cobre o real (`re_`) + mock/legado
  (`rp_`) sem quebrar nada.

## 2026-07-21 — deploy.mjs do racha: push ANTES do deploy (gitSource)
`scripts/deploy.mjs` deploya `origin/main` (o gitSource sobe o que está no
GitHub). `git commit && node scripts/deploy.mjs` SEM push no meio deploya o
commit ANTERIOR — tropecei 2x na mesma sessão (o dump de diagnóstico não
aparecia porque o deploy era do commit velho). Fix: o deploy.mjs agora faz
`git push origin HEAD:main` antes de resolver o sha. Regra geral: se um script
de deploy usa a ref remota, ele tem que garantir que a ref remota está em dia.

## 2026-07-22 — Marketing visuals must match the shipping product, not invent a look
Correction: for Racha teaser #1, the marketing pipeline (mkt-creative-director)
invented an off-brand visual system (dark-ink #16130F, coral #FF5436, receipt-paper,
geometric grotesk, "Pix teal") because racha-brand-voice said "no approved design
system yet." The real Racha app ships Seatable's **Warm Glass** system (DESIGN.md is
canon; apps/web/src/styles.css inherits it): warm-white #FAFAF9 + 4 warm orbs, burgundy
#9F1239 for action, emerald #10B981 for "paid" status (NO teal anywhere), Instrument
Serif / DM Sans / JetBrains Mono, glassmorphism.
Rule: before designing ANY marketing asset, read the product's DESIGN.md + the app's
actual stylesheet and match it. A brand-voice "no design system yet" note is a prompt to
GO READ THE CODE, not license to invent. Fixed racha-brand-voice SKILL.md to codify Warm
Glass. Lesson also: when the user says "look like what the product is," the source of
truth is the repo (website/github) + the parent design language (Claude), not taste.

## 2026-07-23 — A silent-state lead can SWALLOW an opt-out; resurrecting it must re-run the responder
Building the Olímpia handoff digest + reclaim, a code-review caught an LGPD hole:
`prospect-responder.js` gates on `deveResponder(state)` (SILENT_STATES: optout, handoff,
agendado, pausada) and returns BEFORE the deterministic `detectarOptout` check. So a
lead already in `handoff` who types "sai da lista" is stored as an inbound but NEVER
recorded as opt-out — harmless only because handoff was excluded from every proactive
selector (opt-out honored by accident). Any feature that RESURRECTS a silent-state lead
(my reclaim flipping handoff→conversando) removes that accidental protection: the
reengage template can then hit someone who asked to stop.
Rule: when un-muting/reactivating a lead that sat in a SILENT_STATE, do NOT just flip the
state — re-run the FULL responder on the pending inbound (set `reply_apos=now` +
`last_in_wamid=null` so `selectDueFlush` picks it up; selectDueFlush has no 24h window,
unlike resgate). The responder runs opt-out/recusa detection deterministically AND
actually answers the lead. Flip-only relies on the resgate 24h window and leaks on the
aged/weekend path. General: deterministic safety floors (LGPD opt-out) that live DOWNSTREAM
of a state gate are silently skipped for any state that short-circuits that gate — audit
every silent-state for what checks it bypasses before you re-open it.

---

## 2026-07-29 — Quatro formas de "verde local, quebrado em produção"

**1. `*-test.js` no .gitignore engole handlers.** Criei `api/demo-whatsapp-test.js` (item
7). A regra `*-test.js` (linha 21 do .gitignore, feita para scripts ad-hoc) casou com o
nome. O `git add` avisou, o commit seguiu com os outros 6 arquivos, e o handler ficou de
fora — em produção o botão chamaria um endpoint 404 enquanto tudo passava verde no local.
Regra: handler NUNCA termina em `-test.js`. Ao commitar arquivo novo, confirme que entrou:
`git diff --cached --name-only | grep <arquivo>`. O aviso de "ignored file" se perde no
meio dos warnings de CRLF.

**2. Campo novo em `restaurant_config` precisa de COLUNA — e o mock não pega.** Adicionei
`menu_url` ao payload do onboarding sem criar a coluna. O PostgREST REJEITA coluna
desconhecida (PGRST204, não ignora), então o passo FINAL do onboarding falhava: o dono
preenchia seis passos e não conseguia concluir. Nenhum dos 2744 testes pegou, porque a
suíte mocka o Supabase e mock aceita qualquer chave.
Regra: campo novo em tabela = migração versionada em `supabase/migrations/` ANTES do
código que grava. Guarda criada em `api/__tests__/onboarding-config-columns.test.js`
(compara chaves do payload com as colunas reais e exige a migração no repo). A lista de
colunas foi LIDA do `information_schema` — escrita de memória, acusou 6 falsos positivos.
Corolário: coluna JSONB (`metric_profile`) aceita chave nova sem migração. Foi por isso
que `cnpj`/`razao_social`/`socio_confirmado` não quebraram — só o `menu_url`, que foi
para coluna dedicada.

**3. Pushes em sequência criam fila de build de ~13 min cada.** Fiz 5 pushes seguidos
(a42a576e → 294f3027). O bundle em produção avançou, mas para um commit intermediário —
uma hora depois o último ainda não havia deployado, e não consegui verificar o que
acabara de escrever.
Regra: o CLAUDE.md já diz "batch commits, push once" por CUSTO. Vale igualmente por
VERIFICABILIDADE: quem empurra 5 vezes não confirma nada em produção no mesmo turno.

**4. Antes de recomendar trabalho, verifique se ele já existe.** Recomendei o item 6
(instrumentação PostHog) afirmando que o funil estava cego. Errado duas vezes: o grep
`track\(` só pegava a definição, não as 14 chamadas; e a chave `phc_` está embutida no
bundle de produção (o branch "not initialized" não sobrevive à minificação). Sem checar o
bundle, teria construído instrumentação duplicada.
Regra: "X não existe" exige a mesma prova que "X está quebrado". Grep de chamada usa o
NOME da função (`trackDemoFunnel`), não um padrão genérico.

## 2026-07-31 — PATCH de lead SÓ por id, nunca por name=like
Duas vezes em 24h o filtro largo por nome corrompeu estado de lead: (1)
`name=like.La Braciera*` parqueou a unidade Higienópolis junto com a Morumbi —
e a Higienópolis tinha um HUMANO engajado respondendo discovery do Racha,
silenciado por ~1 dia; (2) o script de conserto usou `*Higien*` e marcou
"Busger Higienópolis" (0 mensagens) como 'conversando'. Havia 6 restaurantes
com "Higien" no nome. Regra: mutação de prospect_leads sempre por id=eq.<uuid>;
name/like é só para LER e descobrir o id. E script de conserto de dado nunca
herda o filtro do erro que ele conserta.

## 2026-08-01 — furar uma trava obriga a rastrear o que ela protegia
Disparei 5 intros num sábado com `force:true` porque a janela de disparo é
seg-sex. Julguei só o envio ("sábado de manhã é hora razoável pra dono de
restaurante") e não rastreei o outro lado: a janela de RESPOSTA também era
seg-sex, então qualquer um dos 5 que respondesse ficaria até 22h sem resposta —
eu tinha acabado de mandar 5 convites para uma conversa que a agente não podia
manter. A trava de disparo estava, sem eu saber, acoplada à de resposta.
Regra: ao usar force/bypass, listar o que a trava protegia e verificar cada
consequência ANTES — não só a ação que estou liberando. Quando duas políticas
compartilham o mesmo primitivo (aqui, `dias` em prospect-hours), afrouxar uma
mexe na outra; separar explicitamente faz parte do conserto.
Efeito colateral bom: o defeito era real e antigo — todo lead que respondia no
fim de semana já esperava 22h. O force só o tornou visível.

## 2026-08-01 — espera de deploy cuja condição é trivialmente verdadeira
Escrevi um loop "espera o deploy" que checava (a) prod respondendo 200 e (b)
`git rev-parse HEAD` igual ao commit — ambos verdadeiros no instante do push,
porque (a) a prod VELHA responde 200 e (b) o git é LOCAL. O loop saiu em 15s,
dormi 2min e testei contra o build antigo; o resultado "nenhuma mensagem" quase
virou "o responder está quebrado". O build deste repo leva ~13min.
Regra: esperar deploy é comparar um marcador que SÓ o build novo produz —
`/api/admin-health` devolve `VERCEL_GIT_COMMIT_SHA`; pollar até bater com
`git rev-parse HEAD`. Condição de espera que já é verdadeira antes do trabalho
começar não é espera, é `sleep` disfarçado.

## Antes de DDL, provar a identidade do banco (01/08/2026)

Duas vezes o MCP do Supabase apontou para um projeto que NÃO era produção. Em
29/07 uma migration foi dada como aplicada e não estava — o cabeçalho do arquivo
afirmava "já aplicada via MCP" e a coluna nunca existiu. Em 01/08 o MCP default
desta sessão também não era produção (`public.prospect_leads` nem existia nele).

As ferramentas não avisam: `apply_migration` devolve `{"success":true}` no banco
errado com a mesma cara de sucesso.

REGRA: antes de qualquer DDL, rodar uma consulta de identidade com marcador
conhecido e conferir contra um valor apurado antes — contagem de
`prospect_leads`, nº de colunas de `restaurant.restaurant_config` (64), linhas
de `cron_runs`. Só depois escrever. E verificar DEPOIS pelo efeito observável
(o endpoint que estava quebrado voltando a responder), não pelo retorno da
ferramenta.

## Teste em produção: medir o "antes" e conferir o "depois" (02/08/2026)

Rodei o onboarding de ponta a ponta contra o banco de produção para provar que
menu_url chegava na coluna. O teste passou — e no caminho eu APAGUEI uma linha
real de `restaurant.restaurant_info` (o registro de trial de fevereiro do
fundador). Não foi o teste que apagou: foi o rollback do próprio handler, que
adota a primeira linha da tabela (`.limit(1).single()` sem filtro) e depois a
deleta quando o passo seguinte falha.

Dois erros meus, distintos:

1. **Não medi o estado antes.** Eu sabia de uma consulta anterior que
   restaurant_info tinha 1 linha, mas por acaso, não por checagem deliberada.
   Se não tivesse sabido, teria reportado "teste passou, limpeza ok" sem
   perceber a perda. ANTES de qualquer teste que escreve em produção: contar as
   linhas das tabelas que o fluxo toca e guardar o número.

2. **A limpeza não rodou e eu só percebi porque olhei.** Li os ids em
   `res.corpo.restaurant_id`, mas a resposta os aninha em
   `res.corpo.restaurant.restaurant_id` — os ids vieram null e o `finally`
   deletou nada, em silêncio. Limpeza que não confirma o que apagou é limpeza
   que não aconteceu. Sempre imprimir a contagem de linhas removidas e conferir
   contra o esperado.

Regra: teste que escreve em produção precisa de censo antes, censo depois, e
prova de que a limpeza removeu exatamente o que criou — nem mais, nem menos.

## Dado que veio de terceiro nao e dado verificado (04/08/2026)

O fundador mandou eu escrever, do numero pessoal dele, para a "Adriana" do
Capim Santo. O numero tinha vindo num cartao de contato compartilhado pelo
proprio restaurante. Escrevi. Nao era a Adriana: o numero e de uma amiga dele,
que levou um pitch frio.

O payload da Meta estava integro, o parser leu certo, e eu mandei exatamente
para o numero do cartao. Nada quebrou. Mesmo assim uma pessoa errada recebeu
mensagem, porque a premissa embaixo de tudo estava errada.

O erro e meu e e de raciocinio, nao de execucao: tratei "veio num cartao de
contato" como "numero verificado do decisor". Sao coisas diferentes. Cartao
compartilhado prova a INTENCAO de quem enviou, nao a CORRECAO do dado. Quem
escolheu o contato na agenda pode ter escolhido errado, e escolheu.

O agravante: eu tinha uma checagem barata disponivel e nao usei. Antes de
disparar, dava pra perguntar a casa "esse numero e da Adriana dai?". Um turno
de conversa contra uma mensagem irreversivel para um estranho.

REGRA: antes de agir sobre dado que veio de terceiro (cartao de contato,
telefone raspado de site, email de formulario, indicacao), perguntar "o que
prova que isso esta certo?". Se a resposta for "a pessoa mandou", isso e
procedencia, nao verificacao. Acao irreversivel sobre outra pessoa exige
verificacao, ou uma confirmacao a mais, que quase sempre custa menos que o
estrago.

COROLARIO PRA RELATORIO: quando o dado de origem estava certo e mesmo assim o
resultado saiu errado, mostrar o dado cru primeiro (foi o vcard decodificado
que fechou a questao em segundos) e depois assumir a parte que e minha. A
integridade do payload nao me absolve da decisao de disparar em cima dele.

## 2026-08-10 — Placeholder inventado vazou pra conversa real (Olimpia)

Pra testar o fluxo completo com um colega do Stefano, criei o lead de teste
com nome de restaurante INVENTADO ("Cantina Bella Vista", Sao Paulo,
restaurante) porque o template de intro pede {{1}} e o prompt do agente pede
lead.name. O colega mandou mensagem, e a Olimpia abriu com "vi que voces tem
uma cantina bem bacana ai em Sao Paulo" — afirmacao fabricada sobre um
negocio que nao existe, dita a uma pessoa real que pode ser um lead genuino.

O erro: preencher campo obrigatorio com dado plausivel-mas-falso em SISTEMA
VIVO. Campo desconhecido em fixture de teste local e inofensivo; o mesmo
campo num pipeline de producao vira "fato" no prompt do agente e sai da boca
dele como conhecimento. O prompt inclusive ja tinha a licao equivalente
(nota do Google: "ou vai o numero real, ou vai a instrucao de nao citar") —
eu li essa linha durante a investigacao e nao generalizei pro campo nome.

REGRA: dado que alimenta prompt/mensagem de producao nunca recebe
placeholder inventado. Se o valor e desconhecido, o registro deve DIZER que
e desconhecido (e o prompt instruir a descobrir), ou o campo trava o fluxo
ate alguem fornecer o valor real. "Parecia plausivel" e exatamente o modo de
falha — quanto mais plausivel, mais tempo o erro sobrevive.

COROLARIO: teste de fluxo com pessoa real E conversa real de prospeccao.
Nao assumir nada sobre quem esta do outro lado que o cadastro nao prove.


## 2026-08-07/11 — Estado que ninguem observa: a familia inteira de bugs

Tres incidentes na mesma semana, todos a mesma doenca. O sistema guardava
estado que nenhum humano olhava, e o sintoma visivel era sempre nenhum.

1. A Olimpia prometia "gorjeta indo direto pro garcom". Ilegal de cumprir
   (Lei 13.419/2017 + STJ Tema 1102) e CUSTOU um lead: a casa rateia os 10%
   entre todos os garcons, leu a promessa como quebra do rateio dela e
   encerrou. O rateio dela ERA o nosso modelo. A promessa errada afastou
   exatamente o ICP que ela pretendia atrair.
2. Ela prometeu "vou mandar a proposta pro compras@..." sem ter ferramenta de
   e-mail. O endereco foi gravado em prospect_email, campo que so
   prospect-booking lia, e o Racha nem agenda reuniao. Promessa feita,
   contato capturado, ninguem agiu, lead esperou dois dias.
3. Lead em handoff respondia no WhatsApp, o inbound era gravado, e ninguem
   era avisado. A resposta morria no banco esperando o fundador abrir o lead
   por acaso.

REGRA: todo dado escrito precisa de um leitor nomeado. Campo que so e
escrito, estado que so e gravado, fila que so cresce — se nao existe humano
ou cron que consome, aquilo e um vazamento silencioso, nao uma feature.
Ao criar campo/estado novo, escrever no comentario QUEM le e QUANDO.

REGRA: omitir frase proibida do prompt nao basta. O agente e um LLM: apagar
a linha faz ele parafrasear de volta. Precisa de proibicao explicita
("PROIBIDO SOBRE GORJETA: nao diga X, nem Y, nem Z") mais a resposta certa
pra dar no lugar.

REGRA: quando o prompt manda usar uma ferramenta, conferir se o SCHEMA dela
aceita o caso. O prompt mandava tratar contato entregue com
registrar_responsavel, que so aceita `numero`. Sem rota valida pro e-mail, o
modelo inventou uma. Rota prometida e nao suportada = alucinacao garantida.

## 2026-08-08/11 — Testar com a string real, nao com exemplo inventado

Escrevi um claim-linter e usei as mensagens REAIS dos incidentes como caso de
teste. Pegou de cara que meu padrao de "promessa de envio" procurava a palavra
"e-mail", mas a mensagem real do Bario dizia "vou mandar a proposta pro
compras@bario.com.br" — sem a palavra. O linter teria deixado passar
exatamente o incidente que o motivou.

REGRA: teste de guard usa a string que vazou de verdade, copiada do banco ou
do log. Exemplo inventado passa verde e da falsa sensacao de cobertura,
porque foi escrito pela mesma cabeca que escreveu o padrao.

COROLARIO: guard que barra a copy BOA tambem nao serve. O mesmo linter
bloqueava "o cliente nao paga nada a mais", frase canonica do Racha. Se
tivesse ficado assim, todo chamador allow-listaria a familia por reflexo e o
guard viraria peso morto. Negacao tratada no padrao, com teste dos dois lados.

## 2026-08-11 — Rodar subconjunto de teste esconde o teste que importa

Passei a sessao rodando `npx jest api/__tests__/prospect*` e vi verde o tempo
todo. Ao adicionar um cron novo, esqueci de registra-lo no vigia
(cron-health). Existe teste cruzando vercel.json com o registro que teria
pegado na hora — mas ele se chama cron-health-registro.test.js e nunca casou
com meu padrao.

REGRA: subconjunto serve pro loop rapido durante a edicao. Antes de push que
adiciona ARQUIVO NOVO (cron, endpoint, entrada de config), rodar a suite
inteira: o teste que cobre o novato quase nunca esta na pasta do novato.

## 2026-08-09 — Dry-run barrado pelo proprio kill switch

Subi um cron desarmado (cron_config.enabled=false) e prescrevi o rollout
"rode o dry-run, inspecione, depois arme". Mas eu checava o kill switch ANTES
do dry-run, entao o cron desarmado respondia disabled_by_ops e nao mostrava
previa nenhuma. O caminho de rollout que o interruptor existe para proteger
era impossivel de percorrer.

REGRA: modo de inspecao (dry-run, preview, plan) precisa atravessar o
interruptor que ele existe para validar. Interruptor contem EFEITO; dry-run
nao tem efeito, entao nao ha o que conter.

## 2026-08-09 — Remetente errado quase saiu numa proposta

FROM_ADDRESS do projeto e 'Seatable <bookings@seatable.one>'. A proposta era
do RACHA, assinada "Fundador · Racha". Ia chegar na caixa do prospect com o
nome da outra marca no remetente: confunde, mistura as marcas e, em contato
frio, le como phishing. Peguei minutos antes do primeiro envio autonomo.

REGRA: ao reusar rail de envio de outro produto, conferir remetente, assinatura
e dominio. Rail compartilhado nao significa identidade compartilhada.

RISCO EM ABERTO: prospeccao fria do Racha sai do mesmo dominio dos e-mails
TRANSACIONAIS do Seatable. Denuncia de spam num lead frio dana a reputacao que
entrega confirmacao de reserva de cliente pagante. Separar dominio antes de
escalar volume.

## 2026-08-11 — Criei os templates na conta de OUTRA empresa

Fui submeter os templates do fundador pela interface da Meta. O Business
Manager abriu por padrao a WABA "Hubspot Whatsapp" (1301313551562370), que
pertence a Inner AI — a empresa onde o fundador TRABALHA, nao a dele. Criei os
tres la. Todo envio falhava com (#132001) "Template name does not exist",
porque template nao atravessa conta. Apaguei os tres a pedido dele.

Depois gastei uma hora navegando o Business Manager procurando a WABA certa,
com as paginas travando. A resposta estava no proprio repositorio: a WABA
25687973367501862 ja era o default de `wa-management.js`, e o console em
`/olimpia` a le com o token de PRODUCAO e mostra numero, qualidade e templates.

DUAS REGRAS, e a segunda e a que importa:

1. Antes de CRIAR qualquer coisa numa conta de terceiro (Meta, Stripe, DNS),
   verificar de quem e a conta — e verificar por um identificador do proprio
   trabalho, nao pelo nome no cabecalho. Aqui a prova era "esta WABA tem os
   templates olimpia_*". Verificacao barata, feita ANTES, teria evitado tudo.

2. A causa raiz nao foi desatencao, foi FERRAMENTA QUE NAO EXPRESSAVA O CASO.
   `buildTemplatePayload` so montava UMA variavel e um botao de link; os
   templates do fundador tem duas variaveis e respostas rapidas. Sem caminho
   proprio, fui para a UI da Meta — onde nao ha verificacao nenhuma. Quando me
   pego saindo da ferramenta da casa para fazer algo em producao, a pergunta
   nao e "como faco isso na mao", e "por que a ferramenta nao faz isso".

## 2026-08-12 — Default silencioso mandou pelo numero errado

Armei a fase de WhatsApp do fundador com os templates JA aprovados e o envio
falhou com (#132001). Nao era a WABA: era o NUMERO. Nenhuma das duas chamadas
passava `phoneNumberId`, e resolvePhoneNumberId do sender cai em
WHATSAPP_PHONE_NUMBER_ID -- o numero de RESERVAS, de que restaurante PAGANTE
depende, noutra WABA.

O erro da Meta foi SORTE. Se o template existisse nos dois lugares, prospeccao
fria teria saido pelo numero dos clientes, queimando a reputacao que a
separacao de numeros existe pra proteger, e em silencio: o envio teria dado
200. Eu so descobri porque a recusa veio por outro motivo.

O vizinho ja fazia certo (prospect-responder.js:151 passa o phoneNumberId).

REGRA: quando o parametro que decide IDENTIDADE (numero de origem, remetente,
conta, tenant) tem default, nao passar nao da erro -- da OUTRA identidade.
Antes de escrever chamada nova para um rail compartilhado, ler como o vizinho
mais proximo chama, e travar o parametro em teste. E fazer o caminho falhar
FECHADO: sem numero de prospeccao configurado, nao envia, jamais cai no
default.

## 2026-08-12 — "success: true" nao e' prova de entrega

Conferindo o primeiro envio real, a linha do fundador estava com wamid NULO
enquanto a da Olimpia, ao lado, tinha o dela. O sender sempre devolveu
messageId; eu nao estava lendo.

O wamid e' a unica chave que liga a mensagem aos webhooks de status (entregue /
lido / falhou). Sem ele, `success: true` so diz que a Meta ACEITOU. Mais um
estado que ninguem observa -- a mesma familia da semana inteira, agora na
confirmacao do envio.

REGRA: ao gravar um envio, guardar o identificador que o provedor devolve. Sem
ele nao existe pergunta "chegou?", so "eu tentei". Conferir o registro REAL
depois do primeiro envio -- foi so comparando com a linha do vizinho que isso
apareceu, nenhum teste meu cobria.
## 2026-08-11 — Quase reportei numero truncado como total do banco

Rodei `.select('status')` no PostgREST pra contar distribuicao de status e
recebi total 1000 — exatamente o teto de linhas do PostgREST, nao o total.
O total real era 1926. Se eu tivesse reportado, o numero estaria errado e a
conclusao ("nenhum backfill necessario") ficaria sem base: as 926 linhas nao
lidas poderiam conter justamente os status capitalizados que eu procurava.

Peguei porque 1000 redondo em contagem de banco e suspeito por construcao.

REGRA: para CONTAR, use `count: 'exact', head: true` e filtro por valor —
nunca `select` + agregacao no cliente. `select` sempre pode estar truncado, e
truncagem em auditoria e pior que erro: parece resposta completa. Se um total
sair redondo (1000, 10000), trate como teto ate provar o contrario.

REGRA IRMA: auditoria por ausencia ("nenhuma linha capitalizada") so vale se a
query cobriu 100% das linhas. Prove a cobertura antes de afirmar ausencia.

## 2026-08-11 — MCP do Supabase aponta para o projeto errado

Rodei `select ... from public.reservations` pelo MCP do Supabase e recebi
"relation does not exist". O MCP conecta em lurebwaudisfilhuhmnj (projeto do
TwinMe), nao em ckforl... (Seatable). O schema `public` de la e do TwinMe
(soul_signatures, twin_*) e ele tem um schema `restaurant` parecido —
entao havia uma tabela `restaurant.reservations` plausivel de consultar por
engano e reportar como se fosse producao do Seatable.

REGRA: antes de tirar conclusao de producao via MCP de banco, confirme o
projeto — `get_project_url` contra o SUPABASE_URL do `.env.local` do repo.
Repos diferentes na mesma maquina nao compartilham projeto. Tabela com o nome
certo no schema errado nao e evidencia, e coincidencia.

NOTA: as credenciais do Seatable vivem em `.env.local` (o `.env` tem SUPABASE_URL
e ANON_KEY, mas NAO tem SERVICE_ROLE_KEY).

RESOLVIDO em 11/08/2026: a raiz era um `~/.mcp.json` no diretorio HOME
declarando um servidor chamado `supabase` fixado no ref do TwinMe e
compartilhado por TODOS os projetos. Agora sao dois, com nome honesto:
`supabase-seatable` (ckforl..., escopo do repo, em restaurant-ai-mcp/.mcp.json)
e `supabase-twinme` (lurebwa..., escopo home). Nao existe mais um servidor
chamado so `supabase` — se aparecer de novo, e sinal de config generica
voltando.

REGRA: nome de servidor MCP de banco carrega o projeto no nome. Um `supabase`
generico em config compartilhada por multiplos repos e uma armadilha, nao um
atalho.

ADENDO: o caminho mais seguro nao e servidor MCP com ref fixada — e o conector
`claude.ai Supabase`, cujo `execute_sql` recebe `project_id` por chamada. Ref
fixada no servidor e implicita e silenciosa; `project_id` explicito na chamada
aparece na propria query e nao tem como apontar pro banco errado sem eu ver.
Preferir esse quando existir.

## 2026-08-12 — Marcacao do WhatsApp furava TODOS os padroes

O Gero Panini mandava "_Agradecemos seu contato..._" e escapava de um padrao de
autoresponder que JA existia. Motivo: `\b` nao ve fronteira entre `_` e `A` --
os dois sao caracteres de palavra. Nao era um padrao com bug, eram os 30+ de
uma vez, para qualquer bot que use negrito ou italico. E bot de restaurante usa
o tempo todo.

REGRA: quando o texto vem de uma plataforma com marcacao (WhatsApp, Slack,
Markdown), normalizar ANTES de casar padrao. E ao investigar "o padrao existe
mas nao pega", testar a string real com a marcacao original, nao a versao limpa
que eu digitaria no teste.

## 2026-08-12 — O experimento serve pra MATAR a hipotese, nao pra confirmar

Ia otimizar "resposta substantiva -> demo": a pessoa descreve como fecha a
conta e a agente responde com explicacao em vez de mandar o demo. Montei o A/B,
e ao coletar os turnos reais descobri que dos 133 humanos pendentes, UM
descrevia o fechamento da conta. Mesmo convertendo 100%, seriam 4 demos.

Se eu tivesse rodado o A/B sem olhar o tamanho do segmento, teria produzido uma
taxa bonita sobre n=1 e mexido no prompt de producao por causa dela.

REGRA: antes de medir a taxa de conversao de um segmento, medir o TAMANHO do
segmento. Taxa sem denominador e' teatro. E quando o experimento contraria a
hipotese, o resultado E' esse -- reportar, nao procurar outro recorte que
confirme.

## 2026-08-12 — Meu proprio harness mentiu duas vezes

Ao testar o cerebro chamando generateReply direto, vi travessao em 3 de 3
respostas e uma violacao do claim-linter. Ia reportar os dois como defeito. Fui
conferir em producao: a ultima mensagem com travessao e' de 04/08 -- o
semTravessao roda no RESPONDER, depois do generateReply que eu chamava. Filtro
funcionando; artefato do meu teste. A "violacao" e as respostas que pitchavam
Seatable idem (fixture minha, com o pitch errado no historico).

REGRA: harness que chama a camada de baixo nao ve os filtros da de cima. Antes
de reportar defeito achado em teste local, confirmar no dado de producao. E a
fixture precisa refletir o produto ATIVO, senao ela cria o bug que ela mesma
"descobre".
