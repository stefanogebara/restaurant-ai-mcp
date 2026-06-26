# Seatable Prospecting Agent — "Olivia for Seatable"

**Date:** 2026-06-26
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
