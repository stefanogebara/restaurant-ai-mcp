# Olímpia — Autonomous WhatsApp Prospecting Platform

Olímpia is Seatable's internal outbound engine: an AI SDR that discovers
restaurants, opens cold WhatsApp conversations from a dedicated number,
qualifies the owner, books a 30-min demo on Google Calendar, and learns from
every conversation — plus **Olímpia Ops**, the standalone operator console at
**`seatable.one/olimpia`**.

> Access: Google login + `PROSPECTING_ADMIN_EMAILS` allowlist (default:
> founder). Everything below is single-tenant and internal — deliberately
> separate from the restaurant product.

---

## Architecture (30 seconds)

```
Google Places ──▶ prospect_leads ──▶ sequencer (intros + touches, Meta templates)
                                          │
inbound webhook ─▶ prospect-inbound ─▶ responder (LLM brain + guardrails) ─▶ WhatsApp
                       │                   │
                 receipts/intent      booking (Google Calendar / Meet)
                       │                   │
                  Olímpia Ops  ◀── outcomes, insights, health, funnel
```

- **Runtime**: Vercel serverless (Node CJS under `api/_lib/prospecting/`),
  Supabase Postgres (service-role only), Upstash Redis (dedup/caps/locks).
- **LLM**: OpenRouter → `anthropic/claude-sonnet-4` (replies, temp 0.6);
  `claude-3.5-haiku` for facts/intent/summaries/outcome scoring.
- **Sends**: Meta WhatsApp Cloud API from the DEDICATED prospecting number
  (`PROSPECTING_PHONE_NUMBER_ID`); cold touches are always **approved
  templates** (outside the 24h window, free text is impossible — Meta policy).

## The conversational brain (Phase 6 port from Olivia)

- Full fine-tuned pt-BR persona (never admits being AI, mirrors message
  length, sparse emoji, never re-greets, never re-asks qualification).
- **Burst coalescing**: 7s quiet window (24s cap) + per-lead lock + per-inbound
  claim → three rapid bubbles get ONE coherent reply.
- **Multi-bubble replies** with humanized pauses (900–3200ms between parts).
- **Media**: audio → Whisper → `[áudio] …` (treated as typed content);
  unreadable media → placeholder → "consegue mandar por escrito?".
- **Contact cards** → `[Contato compartilhado: +55… | nome: X]` → deterministic
  owner registration (never re-asks a number that's on screen) + warm ack.
- **Memory**: declared facts (`conversa_fatos`, immutable merge) + rolling
  summary ≥30 msgs (`conversa_resumo`) injected as MEMÓRIA next turn.
- **Nudge**: one natural follow-up ~23h into silence (once per silence period,
  inside the 24h window), business hours only.
- **LGPD**: deterministic opt-out regex BEFORE the LLM; terminal + suppression
  list; runs even when the agent is globally stopped.

## The Ops console (Phases 7–8)

| Area | What it does |
|---|---|
| **Header** | Agent kill switch (confirm → `cron_config prospecting-agent`), number health dot (quality + failed-rate 24h), DRY-RUN badge |
| **Breaker banner** | Shows when dispatch was auto-paused (quality YELLOW/RED or failed-rate >5%/24h) with event history + manual resume |
| **Status strip** | Sends today vs warm-up cap, replies today (+benchmark caption), due follow-ups, upcoming meetings (Meet links + copy), 30d outcomes + avg quality |
| **Descobrir & Disparar** | Region/UF selector + city/bairro → Google Places discovery → mass intro dispatch (confirm + ~R$ cost preview; warm-up cap + suppression enforced server-side) |
| **Abordagens (A/B)** | Registry of Meta-APPROVED templates: intro variants (touch 1) + bump (touch 2, D+3) + breakup (touch 3, D+8). Per-variant funnel: enviado→entregue→lido→respondeu→reunião, opt-out rate, avg quality. URL-in-touch-1 lint |
| **Insights** | Reply rate w/ benchmark bands, median hours-to-first-reply, median msgs-to-booking, top objection themes (w/ deltas), variant × lead-score segment table |
| **Triagem** | The work queue: quer_humano → interessado → open questions → 24h-window closing. AI intent labels (8-way enum, correctable) on every inbound |
| **Thread workbench** | Transcript w/ delivery ticks (✓/✓✓/read/failed+reason), inline notes & timeline events, pinned context card (resumo+fatos), snooze presets, canned responses via `/`, human-takeover composer (auto-pauses agent, 24h countdown) |

## Safety model (layers)

1. **DRY-RUN default-on** — forced when `PROSPECTING_PHONE_NUMBER_ID` unset.
2. **`prospecting-agent`** (master kill switch) — console header / Supabase.
   Stops ALL agent activity; inbound logging + LGPD opt-outs continue.
3. **`prospecting-dispatch`** (graduated breaker) — stops cold sends + nudges
   only; the responder keeps answering. Tripped automatically by quality
   YELLOW, failed-rate >5%/24h; RED also trips the master. Recovery is MANUAL.
4. **Warm-up daily cap** (`PROSPECTING_DAILY_CAP`, default 40) — shared by
   intros AND follow-up touches; fail-closed.
5. **Per-lead pause** — human takeover auto-pauses that lead's agent.
6. **Opt-out suppression** — checked at dispatch, follow-up, and reply time.

## Multi-touch cadence (never-repliers only)

intro (D0) → bump (D+3) → breakup (D+8) → stop. Any inbound cancels the
sequence permanently (`last_in_at` set → excluded; `next_touch_at` nulled).
Touches 2/3 only fire if an ACTIVE approved template is registered for that
touch; otherwise the lead halts visibly (no silent skips). Runs inside the
`prospect-flush` cron — zero extra invocations.

## External setup steps (one-time, manual)

1. **Template variants**: create in WhatsApp Manager → wait for approval →
   register in *Abordagens* (name must match exactly). One variable `{{1}}` =
   restaurant name.
2. **Quality webhook**: subscribe the Meta app to
   `phone_number_quality_update` (App Dashboard → WhatsApp → Webhooks) so the
   circuit breaker sees rating changes. Set `PROSPECTING_DISPLAY_NUMBER`
   (e.g. `+552123914417`) so the reservations number (same WABA) can't trip
   the prospecting breaker.
3. **Cron kill switches**: rows appear in `cron_config` on first use; flip
   `enabled` in Supabase Studio for no-deploy overrides.

## Env vars (prospecting)

| Var | Purpose |
|---|---|
| `PROSPECTING_PHONE_NUMBER_ID` | Dedicated number id — unset = forced dry-run |
| `PROSPECTING_DRY_RUN` | `false` = live sends |
| `PROSPECTING_INTRO_TEMPLATE(_LANG)` | Fallback intro when no registry rows |
| `PROSPECTING_DAILY_CAP` | Warm-up cap (default 40/day) |
| `PROSPECTING_ADMIN_EMAILS` | Console allowlist |
| `PROSPECTING_AGENT_NAME` / `PROSPECTING_CASES` | Persona name / real reference customers |
| `PROSPECTING_CALENDAR_ID` / `PROSPECTING_REP_EMAILS` | Booking calendar + reps |
| `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` | Calendar OAuth |
| `PROSPECTING_DISPLAY_NUMBER` | Quality-webhook number matching |
| `PROSPECTING_COALESCE_MS/_MAX_MS` | Burst debounce (7s/24s) |
| `PROSPECTING_MULTIPART` | `0` disables multi-bubble replies |
| `PROSPECTING_IGNORE_HOURS` | `true` bypasses business hours (testing) |

## API (all via `/api/prospect-admin`, admin JWT)

`GET  ?action=list | lead | overview | insights | variants | canned`
`POST ?action=send | note | snooze | intent | pause | reactivate | optout |
      agent | dispatch-resume | discover | dispatch | template-upsert |
      canned-upsert | canned-delete`

## Crons

| Cron | Schedule | Job |
|---|---|---|
| `prospect-flush` | */15 12-22 UTC Mon-Fri | Deferred replies + multi-touch follow-ups |
| `prospect-nudge` | :40 13-21 UTC Mon-Fri | 23h-silence conversational nudges |
| `prospect-score-outcomes` | 05:00 UTC daily | Quality scores + theme tags |

## Tests

- Backend: `npx jest api/__tests__/prospecting --forceExit` — 150 tests / 11
  suites (state machine, opt-out, owner extraction, pacing, debounce logic,
  receipts ranks, intent enum, touch cadence, booking, warm-up cap…).
- Frontend: `cd client && npx vitest run src/components/prospecting` — pure
  helpers (triage priority, 24h window math, canned interpolation).

## Deliberately deferred (with reasons)

Multi-number rotation (single number's cap not saturated), email touch-1
channel, voice-note escalation, auto-optimizing variants (no statistical
significance at 40/day), kanban drag view, Cmd+K palette, CSV import,
per-contact best-send-time. See the Phase 8 research spec in the plan doc.
