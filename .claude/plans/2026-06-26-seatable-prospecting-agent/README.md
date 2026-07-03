# Seatable Prospecting Agent — "Olímpia for Seatable"

**Date:** 2026-06-26

## Meta provisioning — captured values & go-live steps (2026-06-26)

**Done via WhatsApp Manager (browser):**
- Template **`olimpia_intro`** (Marketing, `pt_BR`, `{{1}}`=restaurant name) — submitted, **Em análise**.
- Dedicated number **`+55 21 2391-4417`** ("Seatable WhatsApp V2", a Twilio number whose
  voice forwards to the founder's phone) — **added + VOICE-verified**.
  - **`PROSPECTING_PHONE_NUMBER_ID = 1187152381150052`**
  - Lives on WABA **`25687973367501862`** (one of FOUR duplicate "Seatable" WABAs under
    business `1426492265498566`). Display name "Seatable" still **Em análise**.

**Go-live status (updated 2026-06-27):**
1. ✅ **Token** — System/User token with messaging+management scope set in Vercel; validated
   against `PROSPECTING_PHONE_NUMBER_ID`. (Token was pasted in chat → **must be rotated**.)
2. ✅ **Webhook** — prospecting app subscribed → `https://seatable.one/api/whatsapp-webhook`.
3. ✅ **Vercel env** — `PROSPECTING_PHONE_NUMBER_ID=1187152381150052` set; deployed to prod
   (merged `bdcc9c04`). ⚠️ `UPSTASH_REDIS_REST_URL`/`TOKEN` have a stray newline → re-paste clean.
4. ✅ **Template** `olimpia_intro` **APPROVED** (pt_BR, `{{1}}`=restaurant name).
5. ✅ **Payment** — WABA payment method added (was err 141006 BLOCKED → AVAILABLE).

**🚧 THE ONE REMAINING BLOCKER — display-name review + new-number warm-up:**
- Display name **"Seatable" then "Seatable Reservas" both auto-DECLINED** ("não segue as
  Diretrizes"). Brand-new number + declined name → Meta silently drops every business-initiated
  send (confirmed: +5511999002121 AND +34637672963 both got nothing). NOT our code — the brain is
  proven in dry-run.
- **2026-06-27 fix attempt:** set the number's WhatsApp **business profile via Graph API**
  (`websites:[seatable.one]`, description, `email:hello@seatable.one`, `vertical:PROF_SERVICES`)
  to substantiate the brand. A name is now **"Em análise" (manual review)** — "Editar" locked
  until it resolves. Watcher `scripts/_prospect_namewatch.js` polls `name_status` every 8 min and
  **auto-sends `olimpia_intro` to both test numbers the instant it flips to APPROVED**.
- **2026-06-27 outcome:** watcher polled `name_status` 9× over ~64 min — stayed `DECLINED` the
  whole time (the "Em análise" never approved). The number's **"Editar nome de exibição" button is
  now DISABLED while status = Rejeitado** → Meta **resubmission cooldown** after 2 rapid declines.
  Can't request a new name until it lifts (hours–1 day). Number is otherwise healthy:
  `quality_rating GREEN`, `throughput STANDARD` — **the display name is the sole blocker.**
- **NEXT SESSION (when "Editar" unlocks):** resubmit display name **`seatable.one`** (exact match to
  the now-set website → highest auto-approval odds), watcher auto-sends on APPROVED. If it declines
  again → open a **Meta Business Support** case for the display name (breaks the auto-reject loop).
  Needs a FRESH access token (the one used today must be rotated — was pasted in chat).

## Progress log

- **Phase 0 ✅** (`8ef0fbb2`) — migration applied + verified on `seatable-eu`
  (prospect_leads/messages/outcomes/optout, state machine, LGPD opt-out-terminal
  trigger, service-role RLS); sender `phone_number_id` parametrized; webhook
  prospecting fork (inert until `PROSPECTING_PHONE_NUMBER_ID` set); stub inbound.
- **Phase 1 ✅** (`5cf76c73`) — the brain (agent name **Olímpia**): persona +
  Anthropic-shaped tools via `getAI()`, deterministic LGPD opt-out, BR
  owner-number extraction, immutable facts, pacing, business-hours gate, the
  responder pipeline. Proven end-to-end in dry-run against prod (real LLM reply,
  no send).
- **Phase 2 ✅** (`d9f07ac5`) — discovery (Google Places, verified live),
  warm-up-capped cold-intro sequencer (atomic claim, dry-run-safe), flush cron,
  `prospect-discover`/`prospect-dispatch` endpoints. 2060 backend tests green.
- **Phase 3 ✅** (BR enrichment) — ported Olivia's enrichment stack to
  `api/_lib/prospecting/`: `prospect-cnpj-match` (mod-11, stopword Jaccard/coverage,
  Google×Receita phone cross-match, shell-CNAE gate, accept/reject/judge scoring),
  `prospect-enrich-signals` (lead_score 0–7, bio sinais, genero, contact pages,
  endereco parser), `prospect-instagram` (Scrapingdog handle/followers, key-gated),
  `prospect-cnpj-local` (buscar_cnpj_local RPC wrapper). Waterfall `prospect-enrich`
  (site-footer CNPJ → SERP → BrasilAPI/cnpj.ws/cnpja official confirm → local index
  → gates → deterministic score → Haiku judge via `AI_MODEL_FAST` with validSet trap
  + nameSim floor → owner/QSA → IG), reusing Seatable's Node `safeFetchText` SSRF
  guard. Endpoint `api/prospect-enrich` (CRON_SECRET; `{lead_id}` or `{limit}` batch).
  Migration `20260630_prospect_cnpj_index.sql` (cnpj_index + pg_trgm + RPC,
  service-role-only) + ETL `scripts/load-rf-cnpj.mjs` (Receita open data → index).
  Degrades gracefully: works without SCRAPINGDOG_API_KEY (footer CNPJ + local index +
  keyless official sources) and with an empty index (falls back to SERP). 27 new tests
  (the Lellis/shell-CNAE/out-of-city-homonym production bugs are regression-guarded);
  75 prospecting tests green. **Apply the migration in Supabase before relying on the
  local index; run the ETL on a beefy box to populate it (optional — graceful empty).**
- **Phase 4a ✅** (scheduling brain) — ported Olivia's pure scheduling logic to
  `api/_lib/prospecting/prospect-agenda.js` (no I/O, 15 tests): `proporSlots`/
  `proporSlotsMulti` (free business-hours slots from per-rep free/busy, distinct-day
  spread, weekend/lead-time gates), `avaliarHorarioSugerido` (gate a prospect-suggested
  time: invalid/antecedência/weekend/out-of-hours/no-rep), `parseHorarioSugerido` +
  `parseJanelaInicio` (deterministic pt-BR free-text date/time → ISO, never LLM-guessed),
  `slotEhValido`/`slotsExpirados` (only confirm a proposed instant; 24h TTL),
  `escolherRep`/`escolherRepBalanceado` (deterministic load-balanced rep round-robin),
  `montarEventoCalendar` (Google Meet event body, injected requestId for idempotency,
  America/Sao_Paulo tz), pt-BR message formatters. Fixed UTC-3 offset (BR has no DST).
  Brand adapted to Seatable/Olímpia. **Phase 4b (next): the Google API boundary —
  `google_calendar.ts` (OAuth refresh-token → free/busy + events.insert+Meet) +
  `briefing.ts` (Gmail) + the `olivia-agendar` orchestrator. Needs net-new
  `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` + a calendar id (user provisions).**
- **Phase 4b-i ✅** (Google API client + briefing) — `prospect-gcal.js`
  (`getGoogleAccessToken` OAuth refresh→access **null without creds**, `freeBusyMulti`
  omitting unreadable calendars, `insertEvent` with Meet via `conferenceDataVersion=1`,
  `contarReunioesFuturasPorRep` load count, `deleteEvent`/`patchEventTime` for
  reschedule/cancel) + `prospect-briefing.js` (`briefingDestinatarioValido` anti-leak
  guard — internal briefing can NEVER reach the prospect; `montarBriefingReuniao`
  HTML builder; `sendBriefing` via Resend on the verified seatable.one sender). Fully
  credential-gated/dry-run-safe. 9 tests (gcal fetch-mocked + the anti-leak guard); 99
  prospecting tests green.
- **Phase 4b-ii ✅** (booking orchestrator) — `prospect-booking.js` wires gcal +
  agenda + briefing into a calendar-authored flow and is hooked into the responder:
  the `agendar` action now proposes REAL free slots (`freeBusy → proporSlotsMulti`,
  honoring deferral phrases), and a deterministic shortcut runs BEFORE the LLM when
  `state='agendando'` — it reads the lead's reply (`escolherSlot`: numbered pick or a
  stated time, time-first), books via `insertEvent` (Meet, idempotent requestId,
  load-balanced rep, owner-calendar fallback), persists `reuniao_at/link/event_id/rep`
  + `state='agendado'`, sends the confirmation, and fires the rep briefing. The LLM
  never invents a meeting time; only an uninterpretable reply falls through to it.
  **Gated on `bookingDisponivel() && !isDryRun()`** → zero real calendar events until
  Google creds + a real number + `DRY_RUN=false` are all set; otherwise it degrades
  to the Phase-1 stub. Single-user note: books on the founder's own calendar; the
  briefing self-send is skipped by the anti-leak guard (gmail ≠ @seatable.one).
  6 new tests (gate, rep parse, choice parser); **105 prospecting tests green / 7 suites.**
  **Setup:** `scripts/google-oauth-setup.mjs` gets the refresh token; then set
  `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `PROSPECTING_CALENDAR_ID=primary`,
  `PROSPECTING_REP_EMAILS=stefanogebara@gmail.com` in Vercel + redeploy → booking live.
- **Phase 5 (cockpit) ✅** — internal cockpit to WATCH Olímpia's conversations.
  Backend `api/prospect-admin.js` (gated by the founder's Google-login JWT +
  `PROSPECTING_ADMIN_EMAILS` allowlist, NOT the tenant flow): `?action=list` (leads +
  honest funnel `bucketCounts`), `?action=lead` (full transcript), and POST
  pause/reactivate/optout. `prospect-admin-view.js` derives the HONEST status bucket
  (conversation state wins over the send ladder — "delivered" is never shown as
  "replied"); store gains `listProspectLeads` + `getProspectLeadWithMessages`.
  Frontend `client/src/pages/ProspectingCockpit.tsx` at `/host-dashboard/prospecting`
  (ProtectedRoute, warm-glass, React Query, 30s refetch): funnel counts, lead list
  with status pills, transcript pane, pause/reactivate/opt-out. 3 new bucket tests;
  108 prospecting tests green / 8 suites; frontend typecheck clean.
- **Phase 5 (memory + outcomes) ✅** — `prospect-reflect.js`: `extrairFatos` (Haiku
  pulls facts the LEAD declared → `coerceFatos`/`mergeFatos` → `conversa_fatos`, wired
  into the responder so Olímpia "remembers" and never asks twice) + `scoreOutcome`
  (rate a finished convo 1–5 + theme tags). Both have PURE tolerant parsers
  (`parseFatosText`/`parseScoreText`, anti-garbage, never invent). Migration
  `20260630_prospect_outcomes_trigger.sql`: a trigger captures a `prospect_outcomes`
  row on EVERY terminal transition (agendado/handoff/optout/pausada) + a
  `prospect_outcomes_agg` dashboard RPC. Daily cron `prospect-score-outcomes` (05:00 UTC,
  bounded 25/run, kill-switchable) scores the backlog — dashboard INPUT only, never
  mutates the prompt. 7 new tests; **115 prospecting tests green / 9 suites.**
  *Intentionally skipped:* the plan's `prospect_memory` pgvector + `match_prospect_memories`
  RPC — Olivia shipped without it; per-lead `conversa_fatos` (extracted facts + 40-msg
  window + rolling resumo) covers "remember this lead", and cross-lead vector recall of
  others' objections is marginal for cold prospecting. Easy to add later if wanted.
- **GO-LIVE (2026-07-02) ✅** — `PROSPECTING_DRY_RUN=false` + `PHONE_NUMBER_ID` +
  `INTRO_TEMPLATE=olimpia_intro` (already Meta-APPROVED since Jun 26) set in Vercel,
  redeployed READY. First live dispatch fired via prod `/api/prospect-dispatch`
  (self-test lead → founder's own WhatsApp; `{sent:1, dryRun:false}`, wamid recorded).
  CRON_SECRET drift resolved (dashboard "Copy to Clipboard" copies the whole
  `KEY=value` line — strip the prefix). Footer now shows the legal entity + CNPJ.
- **Phase 6 (Olivia fine-tuning port) ✅ (2026-07-02)** — extraction workflow read the
  ORIGINAL 58KB olivia-responder + webhook/flush/nudge/pacing from `prospectauto-src`
  (30-mechanic gap analysis). Ported: **(a) ingestion fix** — `prospect-parse.js`
  prospecting-aware parsing (shared contact cards → verbatim `[Contato compartilhado:
  … | nome: …]`, audio → `[áudio] <transcript>` rule-6c path, captionless media →
  placeholder net; NO canned auto-replies from the restaurant number/persona);
  **(b) burst trio** — lock result honored (losers exit, TTL 90s), last-is-out
  idempotency guard, atomic per-inbound `last_in_wamid` claim (migration
  `20260702_prospect_inbound_claim.sql`, applied); **(c) burst debounce** — 7s
  quiet-window / 24s cap DB-polling coalescing (`inboundFingerprint`) so 3 quick
  bubbles get ONE reply; **(d) multi-bubble replies** — `splitReplyParts` wired into
  `sendReply` (default ON, `PROSPECTING_MULTIPART=0` off), 900–3200ms between-part
  pauses, per-part outbound rows; **(e) deterministic owner guardrail** wired pre-LLM
  (`extrairNumeroDono` on last inbound → forced `registrar_responsavel` + canned
  thank-you ack — contact cards now convert); **(f) prompt depth** — rules 6c
  (transcribed media), 5/5c/7b full nuances, 9b/9c owner-referral (never re-ask /
  never promise before the tool); **(g) rolling summary** — `gerarResumo` (≥30 msgs,
  temp 0.2) → `conversa_resumo`; **(h) nudge system** — `prospect-nudge.js` pure
  eligibility (23h silence, last-is-ours, once per silence, 24h free-text window) +
  responder `mode:'nudge'` (internal instruction, no tools, stamps `nudge_em`) +
  hourly cron `prospect-nudge` (Mon-Fri business hours, kill-switchable, live-gated).
  24 new tests; **139 prospecting tests green / 10 suites.**
  *Deferred (next):* email-before-invite pending-slot flow, remarcar/no-show modes,
  global LLM rate limit, pacing urgency tiers, markAsRead with prospecting number id.
- **Phase 7 (ops platform + standalone console) ✅ (2026-07-02)** — prospect-admin
  grew discover/dispatch/send/agent actions; global kill switch (cron_config
  'prospecting-agent') checked by responder+sequencer; standalone console at
  /olimpia (own shell, allowlist-gated, 403 screen), region/UF discovery panel,
  mass dispatch with confirm, funnel filters, takeover composer (auto-pause,
  24h guard). E2E-verified live: discovery inserted 20 real Jardins leads;
  kill switch round-tripped UI→DB→UI.
- **Phase 8 (best-in-class platform) ✅ (2026-07-02)** — 6-agent research sweep
  (Instantly/Smartlead/Apollo/Clay, BR disparo tools, Chatwoot/OSS, operator
  wisdom, UX patterns, LGPD/Meta policy) → 8-feature spec, ALL built:
  **F1 Triagem** (8-way intent enum piggybacked on the facts call; priority
  work queue: quer_humano→interessado→perguntas→janela fechando; manual
  override); **F2 Abordagens** (Meta-approved template registry w/ A/B intro
  variants, per-variant funnel via prospect_variant_funnel RPC — COMPLIANCE
  correction vs spec: variants reference approved template names, never free
  bodies); **F3 receipts** (per-message sent/delivered/read/failed by wamid,
  rank-monotonic, transcript ticks + error tooltips); **F4 multi-touch**
  (bump D+3 / breakup D+8 for never-repliers, shared warm-up cap, inbound
  cancels, halts visibly without an approved touch template; runs in
  prospect-flush); **F5 number health** (quality webhook handler +
  failed-rate>5%/24h breaker → graduated 'prospecting-dispatch' switch,
  YELLOW pauses dispatch/nudges, RED also pauses agent, manual-only recovery,
  prospect_number_events audit + console banner); **F6 workbench** (snooze
  presets, private notes + timeline events as 'sys' rows — LLM never sees
  them; transcript = audit log); **F7 insights** (prospect_insights RPC:
  reply-rate w/ benchmark bands, medians, theme deltas, variant×score
  segments); **F8 canned responses** ('/' popover, client-side {{nome}}
  interpolation, 8 seeded objection answers). Migration
  20260702_prospect_platform.sql applied to prod. Console rebuilt as focused
  components (types/LeadList/ThreadView/VariantsPanel/InsightsPanel/
  HealthCard). Docs: docs/olimpia/README.md (architecture, safety layers,
  external setup, API, env vars). Backend 150 tests / 11 suites; frontend
  helpers 9 tests; tsc clean.
- **Phase 9 (mass discovery) ✅ (2026-07-03)** — sendable-only filter default ON
  (BR-mobile = WhatsApp-capable; discards counted, never inserted), Places
  pagination (60/query), IBGE territory fan-out (bairro/cidade/estado),
  prospect_discovery_jobs + self-chaining worker + flush-cron WATCHDOG
  (re-kicks jobs silent >5 min — added after a real mid-sweep stall). First
  city-wide sweep (São Paulo, 97 queries): 3,3k+ found → **pool went 6 →
  1,143 leads (1,142 sendable)**. 9 tests.
- **Phase 10 (Gym + coach loop) ✅ (2026-07-03)** — training architecture:
  prospect_style_pack (versioned ESTILO appended to the PROD system prompt;
  activate = live brain change, 3-min cache), prospect-sim (LLM-as-lead
  personas vs the REAL generateReply, sandboxed; judge rubric humanidade/
  naturalidade/sobriedade/bolhas/repetição/avanço/adaptação), 10 seeded
  scenarios, Gym console panel, scripts/_gym-ab.mjs suite runner. Autonomous
  COACH /loop (dynamic): coleta sinais → workflow de pesquisa (foco rotativo)
  → rascunho → suite A/B → promoção com guardrails (+0.25 média, sem regressão
  >0.5, optout íntegro). **Ciclo 1 (objeções) PROMOVEU v3 (26 regras): média
  3.6 → 4.0, 7/7 dimensões melhoraram, 8/10 cenários.** v2 (18 regras
  destiladas de pesquisa linguística) permanece como base histórica. 9 tests;
  168 prospecting green / 13 suites.
- **Remaining external steps:** approve extra template variants + touch-2/3
  templates in WhatsApp Manager, then register in Abordagens; subscribe Meta
  app to phone_number_quality_update + set PROSPECTING_DISPLAY_NUMBER.
- **External (blocks GOING LIVE, not building):** provision the dedicated
  WhatsApp number → `PROSPECTING_PHONE_NUMBER_ID`; get a B2B intro template
  approved by Meta → `PROSPECTING_INTRO_TEMPLATE`. Until then everything is
  forced dry-run.
- **Next:** Phase 5 (memory + outcomes + internal cockpit). *Optional Phase 3
  follow-up:* port `encontrar-whatsapp` (IG-bio WhatsApp discovery) to populate the
  delivery/whatsapp bio signals that feed `lead_score`. *Optional Phase 4 follow-ups:*
  the email-collection step before booking (Olivia's `formatarPedidoEmail` dance) and
  reschedule/no-show crons (`deleteEvent`/`patchEventTime` are already ported).


**Goal:** Replicate the `prospectautomation` (Squad · "Olivia") autonomous WhatsApp sales-prospecting
agent inside the Seatable codebase, reusing Seatable's existing Meta Cloud WhatsApp integration as
the sending channel.

## Confirmed decisions (founder, 2026-06-26)

1. **Use case:** Seatable's OWN customer-acquisition agent — discovers *restaurants* as leads and
   pitches Seatable to them. **Single internal tenant** (no `restaurant_id`, service-role-only data,
   internal-admin auth). NOT a feature resold to restaurants.
2. **Market:** **Brazil-first** — port the full BR enrichment stack (CNPJ/Receita Federal, Instagram
   via Scrapingdog, PT-BR persona).
3. **Booking:** **Full Google Calendar engine** — port `olivia-agendar` (free/busy, Google Meet,
   Gmail briefings, rep round-robin). Requires net-new Google Calendar OAuth.
4. **WhatsApp number:** **Separate number under the same WABA** — new `phone_number_id`, same Meta
   app/business. Isolates cold-outreach quality rating from the customer-facing reservation number.

## Source architecture (Olivia, audited)

`prospectautomation` = Vite/React SPA + **Supabase Edge Functions (Deno)** + Postgres + **GitHub
Actions crons**. Funnel: **discover → enrich → outreach (WhatsApp/Meta) → AI conversation → book
meeting → CRM/outcomes.** The brain (`olivia_brain.ts` + `olivia-responder`) calls **Claude Sonnet-4
via OpenRouter** with OpenAI-shaped tools, with deterministic guardrails (opt-out, owner-number,
business-hours), burst-debounce, human pacing, and an anti-invention rule (never fabricate
names/prices/CNPJs/meeting-times).

## Target stack mapping (Seatable)

Seatable = React + **Vercel Node serverless** (`api/*.js`) + `vercel.json` crons + Supabase Postgres.
The *logic* ports directly; the *runtime* remaps: Deno `index.ts` → Node `api/*.js`
(`module.exports = (req,res)`); GitHub Actions → `vercel.json` crons secured by `CRON_SECRET`;
`EdgeRuntime.waitUntil` → awaited work (≤60s `maxDuration`) or a follow-up cron.

### Reuse (Seatable, as-is)
- `api/_lib/whatsapp-sender.js` — `sendTemplateMessage()` (cold first contact) + `sendWhatsAppMessage()`
  (session replies). Graph v18.0, Bearer, no-retry-by-design. **Parametrize `phone_number_id`** so it
  can target the prospecting number.
- `api/whatsapp-webhook.js` — raw-body HMAC verify, GET challenge, status-ladder, Redis dedup.
- `api/_lib/channels/meta-adapter.js` — `verifySignature` + `parseIncoming` reused; **`shouldHandle()`
  is the fork hook** (precedent: TwinMe `phone_number_id 882860144919419`).
- `api/_lib/ai-client.js` — `getAI()` / `AI_MODEL` (Sonnet-4) / `AI_MODEL_FAST` (Haiku). Replaces
  Olivia's direct OpenRouter calls. (Anthropic has no `response_format: json_object` → use tool-forcing.)
- `api/_services/restaurantIntelligence.js` — 3-tier Google Places + website+Haiku + Custom Search with
  Node SSRF guard (`isUrlSafe`). Ready-made restaurant research engine.
- `api/_services/campaignService.js` — proven outbound-at-scale blueprint (per-recipient send loop +
  status persistence + opt-out). Clone its structure for the prospecting sequencer.
- `api/_services/embeddings.js` (`text-embedding-3-small`), `api/_lib/secure-logger.js`,
  `api/_lib/rate-limit.js`, `api/_lib/cron-config.js` (kill switch), `api/_lib/secure-compare.js`
  (`bearerEquals`), `api/cron/check-late-reservations.js` (reference cron shell),
  `api/_lib/db/clients.js` (`supabaseAdmin` + `withRetry`).
- Manager AI blueprint (`api/_lib/manager-agent.js` + `managerMemory.js` + `memoryExtractor.js`) —
  structural template for the prospect brain, pgvector memory, and extraction sub-agent.

### Port (Olivia pure modules → `api/_lib/prospecting/`)
- Brain pieces: `construirSystemPrompt` structure, `detectarOptout` (pt-BR regex, bare "não" excluded),
  `extrairNumeroDono`, `deveResponder` state gate, `ConversaFatos`/`mergeFatos` immutable merge,
  `formatarMemoria`, BR phone normalization (`inboundPhoneCandidates`, 9th-digit handling).
- `olivia_pacing.ts` (length-proportional delay + jitter + multipart split), `olivia_horario.ts`
  (Intl.DateTimeFormat business hours).
- `lead_score.ts` (additive 0–7 weights), `bio_sinais.ts`, `contact_pages.ts`, `genero.ts`,
  `endereco.ts`, `cnpj_match.ts` (mod-11, Jaccard, phone cross-match, accept/reject/judge + validSet
  anti-hallucination trap + post-judge `nameSim ≥ 0.35 || phoneMatch` floor).
- `geo_grid.ts` (`gerarGrade`, `MAX_CELULAS`, `estimarCusto`), `busca_setor.ts` (sector taxonomy),
  `ibge.ts`.
- `olivia_followup.ts` (48h, 5 gates), `olivia_nudge.ts` (23h + 24h-window `podeMensagemLivre`),
  `olivia_agenda.ts` (`proporSlotsMulti`, `avaliarHorarioSugerido`, `escolherRepBalanceado`, CAS claim,
  deterministic conference `requestId`).
- `perplexity.ts` parse/validation (only if a Perplexity key is added — likely skipped).
- Schema-level patterns: `olivia_estado` state machine, wamid dedup, optout-terminal trigger,
  outcome-scoring trigger/cron.

### Net-new
- `supabase/migrations/*_prospecting.sql` — prospecting tables, **service-role-only access, NO
  `restaurant_id` RLS** (these are leads, not guests; do NOT copy Olivia's `using(true)` either).
- Dedicated prospecting WhatsApp number + `PROSPECTING_PHONE_NUMBER_ID` + Meta-approved B2B
  cold-outreach templates + prospecting opt-out/suppression list.
- Prospecting routing branch (`shouldHandle()` fork → prospect processor) so inbound replies don't get
  mis-routed into restaurant AI / the restaurant picker.
- Send-side warm-up/throttle on Upstash (consume-before-send, fail-closed) to protect the number's Meta
  quality rating.
- Internal cost-budget gate (global cap — replaces per-tenant metered quota).
- Receita Federal `cnpj_index` ETL + `buscar_cnpj_local` RPC + `pg_trgm` (BR enrichment).
- Google Calendar/Meet OAuth + Gmail briefing (booking engine).
- Internal-only Prospecting admin UI.

## Data model (new tables — single internal tenant, service-role only)

- **`prospect_leads`** — `id`, name, sector, address, neighborhood, city, lat, lng,
  `google_place_id` (UNIQUE — upsert dedup), source, phone, website, rating, reviews_count,
  instagram_handle/followers, owner_name, `cnpj?`, razao_social?, socios? (jsonb {nome,qualificacao} —
  **NEVER CPF, LGPD**), porte?, mei?, `lead_score` (0–7), enrich_status (jsonb), `whatsapp_phone`
  (E.164), whatsapp_status, whatsapp_send_status, `whatsapp_msg_id` (wamid), pipeline `status`,
  `conversa_fatos` (jsonb), `conversa_resumo` (text), timestamps.
- **Conversation state** (cols on `prospect_leads` or 1:1): `prospect_state`
  (`aguardando|conversando|agendando|agendado|handoff|optout|pausada`), `lock` (CAS, steal >90s),
  `reply_apos`, `nudge_em`, `followup_enviado_em`, `pending_slot_iso`, `slots` (jsonb), `slots_at`,
  `handoff_motivo`.
- **`prospect_messages`** — `id`, `lead_id` (FK, nullable for unknown-number inbounds), `direcao`
  (`in|out`), `wamid` (UNIQUE — Meta re-delivers, dedup via onConflict), tipo, corpo, raw (jsonb),
  enviada_em; index `(lead_id, enviada_em)`. History assembly reads last 40 chronological.
- **`prospect_meetings`** — reuniao_at, reuniao_link, calendar_event_id, assigned_rep_email,
  prospect_email (denormalized cols, or a table if multiple meetings/lead).
- **`prospect_outcomes`** — `lead_id`, outcome, n_messages, handoff_motivo, `quality_score` (1–5),
  `theme_tags` (text[]). Written by a DB trigger on every terminal-state transition; scored daily by
  cron. Dashboard-only — never feeds the prompt.
- **`prospect_optout`** — suppression list (phone E.164 + reason). Terminal trigger: once `optout`,
  never leaves (LGPD). Plus a purge RPC (redact bodies) for right-to-erasure.
- **`prospect_memory`** — pgvector `embedding vector(1536)` via `embeddings.js`
  (`text-embedding-3-small`), `match_prospect_memories` RPC hybrid-ranking `0.7*cosine +
  0.3*(importance/10)`.
- **`cnpj_index`** (BR) — Receita Federal denormalized index + `buscar_cnpj_local` RPC + `pg_trgm`.
- *(optional, mass scraping)* `scrape_jobs` + `scrape_tasks` queue.

## External dependencies

**Already have:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`,
`WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`; `OPENROUTER_API_KEY` (+ `ANTHROPIC_API_KEY` fallback);
`GOOGLE_PLACES_API_KEY` + `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID`; `OPENAI_API_KEY`
(embeddings); `UPSTASH_REDIS_*`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`.

**Must add:** `PROSPECTING_PHONE_NUMBER_ID` (new number, same WABA) + `shouldHandle()` routing
constant; Meta-approved B2B cold-outreach templates (Meta review — start day 1); `SCRAPINGDOG_API_KEY`
(Instagram); `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` + calendar id (Calendar/Meet/Gmail booking).
**No HubSpot key** — HubSpot is dropped entirely in favor of Seatable's own tables. Perplexity likely
**skipped** (Google Places + Custom Search cover restaurant research).

## Risks (carry Olivia's hard-won guards)

1. **Number/quality contamination** — cold B2B has high block/report rates; sending from the customer
   number could get it throttled. → Separate `phone_number_id` (same WABA OK). *Highest risk.*
2. **Inbound mis-routing** — `message-processor.js` steps 8–8b assume every sender maps to a
   `restaurant_id`. Prospects have none → MUST add the `shouldHandle()` fork **before any live inbound**.
3. **Meta template approval latency/rejection** — B2B cold templates go through review (days, can be
   rejected for promotional tone); `language.code` must match registration exactly. *Long pole — start
   day 1.*
4. **Cold-outreach compliance (LGPD/anti-spam)** — separate opt-out/suppression (STOP/PARAR),
   deterministic opt-out before the LLM, honor Meta opt-outs, optout-terminal trigger.
5. **Send-rate / Meta tier limits** — no throttle exists in Seatable. Rebuild Olivia's warm-up
   daily-cap + consume-before-send (fail-closed) on Upstash.
6. **Deploy-model mismatch** — Deno → Node rewrite; burst-debounce (~45s) and scrape-worker (~90s)
   approach/exceed 60s `maxDuration` → shorten or event-driven. **Never `require()` a sibling handler**
   (NFT drops it); library code in `api/_lib/` only.
7. **Scraping ToS + cost** — Google Places billed per request; IG via Scrapingdog risks IG ToS. Keep
   Olivia's cost caps (`estimarCusto`, Scrapingdog 25-lookup cap, 7-day enrich cooldown). Cron rule:
   nothing more frequent than `*/15` except genuinely drift-sensitive (nudge/flush).
8. **Anti-invention regression** — validSet judge trap, nameSim floor, owner-number deterministic
   extraction, calendar-authored (not LLM-invented) scheduling, 8-digit-mobile→null rule. Carry intact.
9. **Migration drift** — Seatable applies migrations manually. Apply + verify with
   `audit-migrations-applied.js` before wiring handlers.

## Phased build (each phase shippable)

### Phase 0 — Foundations & decisions (no sends)
- Provision the separate prospecting number under the same WABA; add `PROSPECTING_PHONE_NUMBER_ID`;
  parametrize `whatsapp-sender.js` `phone_number_id`.
- Submit B2B cold-outreach template(s) to Meta for approval (**long pole — day 1**).
- Write + apply `supabase/migrations/*_prospecting.sql` (leads, messages, outcomes, optout, state
  machine, optout-terminal trigger); verify via `audit-migrations-applied.js`.
- Add `shouldHandle()` fork in `meta-adapter.js` routing the prospecting number to a stub prospect
  handler (logs + stores only).

### Phase 1 — Headless responder MVP (the brain; inbound only)
- `api/_lib/prospecting/prospect-agent.js` — `buildSystemPrompt` (PT-BR persona + anti-invention +
  objective: qualify owner + book demo) via `getAI()`/`AI_MODEL`; single-round tool loop.
- `api/prospect-responder.js` — load last 40 messages → deterministic guardrails (`detectarOptout`,
  business-hours gate, owner-number) → LLM → send via `sendWhatsAppMessage` → persist state; pacing +
  burst-debounce capped <60s; opt-out suppression honored.
- Port `lead_score.ts`, `olivia_horario.ts`, `olivia_pacing.ts`, phone-br.
- Seed a few `prospect_leads` manually; verify a real, safe AI conversation end-to-end.

### Phase 2 — Discovery + outbound sequencer
- Discovery via reused `restaurantIntelligence.js` / `scrape-restaurant.js` (Google Places, single
  city/sector) → upsert `prospect_leads` (`google_place_id` unique). Port `geo_grid.ts`/`busca_setor.ts`
  if grid-scraping beyond one city.
- Outbound dispatch cloning `campaignService.js`: `sendTemplateMessage` cold-intro loop + per-lead
  status + ATOMIC claim (`whatsapp_sent_at`) + warm-up daily cap (Upstash, consume-before-send,
  fail-closed).
- Crons (`vercel.json` + `CRON_SECRET` + `isCronEnabled` kill-switch, DRY-RUN default on):
  `prospect-flush` (`*/15`, business-hours deferral), `prospect-followup` (twice-daily, 48h one-shot),
  `prospect-nudge` (hourly, 23h/24h-window). Delivery status reused from existing webhook ladder.

### Phase 3 — BR enrichment
- Receita Federal `cnpj_index` ETL + `buscar_cnpj_local` RPC + `pg_trgm`.
- Port `enriquecer-lead` waterfall + `cnpj_match` judge (Haiku via `AI_MODEL_FAST`) with validSet trap +
  nameSim floor; `bio_sinais`, `contact_pages`, `genero`.
- Instagram via `SCRAPINGDOG_API_KEY` (followers/bio signals), with the 25-lookup cap + 7-day cooldown.
- Reuse Seatable's Node `isUrlSafe` SSRF guard (not Olivia's Deno `resolveDns`).

### Phase 4 — Google Calendar booking engine
- Google Calendar/Meet OAuth + Gmail briefing (net-new `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`).
- Port `olivia-agendar` (`proporSlotsMulti`, `avaliarHorarioSugerido`, `escolherRepBalanceado`,
  free/busy, CAS claim, deterministic conference `requestId`). **Scheduling messages are
  calendar-authored, never LLM-invented.**

### Phase 5 — Memory, outcomes & internal cockpit
- `prospect_memory` pgvector (`embeddings.js`) + `match_prospect_memories` RPC; background fact
  extraction (memoryExtractor pattern, Haiku, strict JSON, `mergeFatos` immutable).
- `prospect_outcomes` trigger + daily scoring cron (1–5 + theme_tags, dashboard-only).
- Internal-admin Prospecting page: lead list, conversation transcript, pause/reactivate/optout, honest
  status buckets (replied/seen/sent/failed). Gate behind internal-admin auth, NOT the customer
  onboarding/Google-OAuth tenant flow.

## Verification gates
- Backend: `npx jest --forceExit` green (add prospecting suites — opt-out detection, state machine,
  cnpj_match judge, pacing, phone-br, warm-up cap).
- Frontend: `cd client && npx vitest run` green.
- Migrations applied + verified before handlers go live.
- Every new endpoint ships with auth (or a stated "deliberately public" comment) + secure-logger.
- DRY-RUN default on until a live smoke test on the new number passes.

## Open items to confirm before Phase 0
- Lead time / availability to provision the second WhatsApp number on the existing WABA.
- Target send volume/day (drives warm-up pacing + Meta tier) and the internal monthly cost ceiling
  (hard budget cap replacing per-tenant metered quota).
- Confirm legal posture for unsolicited B2B WhatsApp in BR (LGPD + Meta unsolicited-template policy).
