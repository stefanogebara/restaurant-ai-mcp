## Project Wiki (LLM-compiled knowledge base)

Auto-compiled articles live in `docs/wiki/`. Refresh with `node scripts/compile-project-wiki.js`.
- **[[architecture]]** — Tech stack, file structure, multi-tenancy, testing
- **[[recent-changes]]** — Last 40 commits summarized by theme
- **[[api-endpoints]]** — All endpoints, auth patterns, cron schedule
- **[[database]]** — Schema, key tables, supabaseAdmin vs supabaseClient
- **[[active-issues]]** — Open TODOs, fragile areas, suggested focus

---

## Design System

**Canonical source: [`DESIGN.md`](./DESIGN.md)** — covers product UI ("Warm Glass" — light-mode glass adapted from TwinMe's dark glass system), brand illustrations, social posts, the AI Studio prompt template, and the per-surface checklist. When in doubt, that file wins over Tailwind config or component code; update them to match. Glass primitives live at `client/src/components/common/glass/` (`<GlassCard>`, `<GlassPanel>`, `<GlassModal>`, `<GlassPill>`); page body has a fixed 4-orb warm radial gradient (`client/src/index.css`).

---

## Vercel Cost Rules (CRITICAL — $375 bill incident March 2026)

**What actually bills you: cron + function INVOCATIONS, not build minutes.**
Build minutes are within the included Pro quota (6000/mo) — a 13-min build
× 100 deploys ≈ 1300 min, well inside free. Optimize invocations first.

- **Crons**: NEVER more than */15. Only keep */15 for genuinely drift-sensitive
  jobs (late-reservation detection, campaign sends with promised fire times).
  Batch jobs whose work is internally bounded (sync, validate, cache-warm,
  rollups) → hourly or daily. Each */15 → hourly cut saves 72 invocations/day.
- **maxDuration**: Keep at 60s or less. Double duration = double cost.
- **Deploys**: ONE per push (Vercel Git integration handles it). No duplicate
  GitHub Action hooks. Batch commits — stage changes, push once.

### Function bundling (deploy time + dead-URL hygiene)
Every `.js` file under `api/` becomes a serverless function UNLESS it's in a
directory starting with `_` (`api/_lib/`, `api/_services/`, `api/_ml/`). Library
code accidentally placed in a non-underscore dir gets deployed as a broken
function (returns FUNCTION_INVOCATION_FAILED on every hit) AND adds ~3.4s of
NFT-trace/bundle time per deploy.
- **Helpers/services → `api/_*/` dirs.** Never put `module.exports = {...}`
  library modules in a function-eligible path.
- **Never `require()` a sibling handler file** (`require('./other-handler')`
  where that file is `module.exports = async (req,res)`). Vercel's NFT silently
  DROPS the importing function from the deploy manifest with no build error —
  the endpoint 404s in prod. Extract shared logic to `api/_lib/` instead.
  (This was the /api/demo 404 root cause, June 2026.)
- **Family consolidation** (folding `square-{auth,callback,sync}` → `square.js`
  with `?route=`) is available but yields sub-noise build deltas (~7s for 2
  functions, inside ±1min build variance). Only worth it for code hygiene, not
  cost. A webhook member with `bodyParser:false` must stay standalone.

## Workflow Orchestration

### 1. Plan when it pays off
- Use plan mode for architecturally consequential or genuinely multi-step work
  where approving the approach first saves rework — not as a reflex on every
  task. A clear, bounded change: just do it.
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Write specs upfront when ambiguity is the risk; skip ceremony when it isn't

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## NODE PROCESS MANAGEMENT
**NEVER kill ALL node processes (crashes the CLI):**
- `taskkill /F /IM node.exe` - NEVER
- `pkill node` - NEVER
- `killall node` - NEVER

**OK to kill specific processes by PID:**
- `taskkill /PID 12345 /F` - OK when you know the specific PID

---

# Seatable - AI Restaurant Management Platform

## Project Overview

**Seatable** is an AI-powered multi-tenant restaurant management platform that enables customers to make reservations through natural conversation (voice, text, WhatsApp) while providing restaurant hosts with real-time dashboards to manage walk-ins, reservations, and table assignments.

**Production URL**: https://seatable.one

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Backend** | Node.js, Express (Vercel Serverless) |
| **Database** | Supabase PostgreSQL (multi-tenant, RLS) |
| **AI Services** | Anthropic Claude, OpenAI, ElevenLabs/Cartesia (TTS) |
| **Payments** | Stripe (subscription + metered usage billing) |
| **Deployment** | Vercel (auto-deploy on push to main) |
| **State** | React Query (@tanstack/react-query) |
| **Rate Limiting** | Upstash Redis (with in-memory fallback) |
| **Testing** | Jest (backend, 1434+ tests), Vitest + RTL (frontend, 458+ tests) |
| **Logging** | createSecureLogger (masks sensitive data) |

---

## Design System

See **[`DESIGN.md`](./DESIGN.md)** for the full design system (typography, palette, shadow/border rules, WCAG, brand illustrations, social posts).

---

## Multi-Tenancy Architecture

All operational tables (`reservations`, `tables`, `waitlist`, `service_records`, `subscriptions`) are scoped by `restaurant_id`. RLS policies enforce tenant isolation via JWT claims.

- **supabaseAdmin**: SERVICE_ROLE_KEY client, bypasses RLS. Used by webhooks, cron jobs.
- **supabaseClient**: ANON_KEY client, respects RLS. Used for user-facing queries.
- **createAuthClient(jwt)**: Per-request client with user JWT for RLS enforcement.

Restaurant config lives in `restaurant.restaurant_config` schema.

---

## Pricing Plans

| Plan | Price | Features |
|------|-------|----------|
| **Essencial** | R$ 497/month | AI reservations (Chat + WhatsApp), Host dashboard, Basic analytics, Email support, Up to 50 reservations/month |
| **Profissional** | R$ 1.497/month | Everything in Essencial + Voice AI agent, Advanced analytics, Waitlist management, Up to 150 reservations/month, SMS notifications |
| **Enterprise** | R$ 2.997/month | Everything in Profissional + Unlimited reservations, Unlimited SMS, Priority support, Custom integrations |

*Profissional plan includes 14-day free trial. Usage-based metered billing for reservations, AI calls, SMS, and WhatsApp. Prices in BRL.*

---

## Application Routes

### Public Pages
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing Page | Marketing site with features, pricing, FAQ, contact |
| `/live-demo` | Live AI Demo | Voice-based AI reservation demo |
| `/login` | Login | Google OAuth authentication |
| `/book/:slug` | Booking Page | Public customer booking portal |
| `/book/:slug/confirmed` | Booking Confirmation | Reservation confirmation |
| `/customer` | Customer Portal | Customer reservation management |

### Dashboard Pages
| Route | Page | Description |
|-------|------|-------------|
| `/host-dashboard/simple` | Dashboard | Main unified dashboard (stats, tables, reservations, waitlist) |
| `/host-dashboard/reports` | Weekly Reports | Date-range reports with metrics |
| `/host-dashboard/calls` | Call Tracking | AI agent call dashboard |
| `/host-dashboard/tables` | Table Config | Table setup and management |
| `/host-dashboard/floor-plan` | Floor Plan Editor | Visual table layout editor |
| `/host-dashboard/voice-settings` | Voice Settings | AI voice configuration |
| `/host-dashboard/whatsapp` | WhatsApp Settings | WhatsApp integration setup |
| `/analytics` | Analytics Dashboard | Full analytics view |

### Auth/Setup Pages
| Route | Page | Description |
|-------|------|-------------|
| `/onboarding` | Onboarding Wizard | 6-step restaurant setup (protected) |
| `/welcome` | Welcome | Post-onboarding welcome (protected) |
| `/subscription/success` | Subscription Success | Post-payment confirmation |
| `/subscription/manage` | Subscription Manage | Plan management |
| `/settings/language` | Language Settings | EN/ES language toggle |

---

## Cron Jobs (Vercel)

| Schedule | Endpoint | Description |
|----------|----------|-------------|
| Every 15 min | `/api/cron/check-late-reservations` | Marks 20+ min late reservations as no-show |
| Every 15 min | `/api/cron/send-campaigns` | Sends scheduled retention campaigns |
| Every 30 min | `/api/cron/send-feedback` | Sends post-visit feedback requests |
| Daily 2 AM | `/api/cron/warm-seo-cache` | Pre-warms SEO page cache |
| Daily 3 AM | `/api/cron/cleanup-expired-demos` | Deletes expired demo restaurants |
| Daily 3 AM Mon | `/api/cron/refresh-restaurant-profiles` | Refreshes restaurant profile data |
| Daily 4 AM | `/api/report-usage` | Reports metered usage to Stripe |
| Daily 5 AM | `/api/cron/generate-reflections` | Generates manager AI reflections |
| Daily 6 AM | `/api/cron/update-churn-scores` | Recalculates customer churn risk |
| Daily 8 AM | `/api/cron/manager-briefings?type=morning` | Morning manager briefing |
| Daily 9 AM | `/api/cron/send-reminders` | Sends reservation reminders |
| Daily 10 AM | `/api/cron/demo-nurture` | Sends demo nurture email sequence |
| Daily 10 AM Sun | `/api/cron/proactive-comms` | Weekly proactive communications |
| Daily 3 PM | `/api/cron/manager-alerts?type=high_noshows` | Alerts on high no-show rate |
| Daily 6 PM | `/api/cron/manager-alerts?type=low_covers` | Alerts on low cover count |
| Every 2h 12-8 PM | `/api/cron/manager-alerts?type=late_cancellations` | Alerts on late cancellations |
| Daily 11 PM | `/api/cron/manager-briefings?type=end_of_day` | End-of-day manager briefing |
| Every 15 min | `/api/cron/sync-conversation-data` | Pulls ElevenLabs voice transcripts before 48h purge window |
| Every 15 min | `/api/cron/validate-conversations` | Flags AI booking errors for manager review |
| Daily 10 AM | `/api/cron/health-alert` | WhatsApp alert when other crons go stale (14-day window) |

All cron jobs are secured with `CRON_SECRET` Bearer token and use `createSecureLogger`. All have an operational kill switch via `public.cron_config.enabled` — flip the row to `false` via Supabase Studio to disable a misbehaving cron without a redeploy.

---

## Database Schema (Supabase)

### Public Schema
| Table | Purpose | Multi-tenant |
|-------|---------|:---:|
| `reservations` | Customer bookings | Yes (`restaurant_id`) |
| `tables` | Physical table inventory | Yes (`restaurant_id`) |
| `waitlist` | Customers waiting | Yes (`restaurant_id`) |
| `service_records` | Active dining sessions | Yes (`restaurant_id`) |
| `subscriptions` | Stripe subscription data | Yes (`restaurant_id`) |
| `customer_history` | Visit history & preferences | Yes |
| `customer_ltv` | Lifetime value & churn scores | Yes |
| `usage_tracking` | Metered billing usage | Yes (`restaurant_id`) |

### Restaurant Schema
| Table | Purpose |
|-------|---------|
| `restaurant_config` | Business config, hours, policies, timezone |

---

## Project Structure

```
restaurant-ai-mcp/
├── client/
│   └── src/
│       ├── pages/              # React pages
│       ├── components/
│       │   ├── common/         # PhoneInput, Modal, etc.
│       │   ├── host/           # WalkInModal, WaitlistPanel, etc.
│       │   ├── dashboard/      # StatsBar, ReservationsList, ActivePartiesPanel
│       │   ├── onboarding/     # Onboarding steps
│       │   └── landing/        # Landing page sections
│       ├── contexts/           # Auth & state management
│       ├── hooks/              # useRealtimeSubscription, etc.
│       ├── services/           # API clients, supabase.ts
│       ├── utils/              # timeFormatting, tableCombinations
│       ├── types/              # TypeScript types
│       └── i18n/               # EN + ES translations
├── api/
│   ├── _lib/                   # Shared: supabase.js, auth.js, rate-limit.js, secure-logger.js
│   ├── cron/                   # Cron jobs
│   ├── ml/                     # ML prediction engine
│   ├── onboarding/             # Onboarding API
│   ├── services/               # Business logic (subscription-limits, etc.)
│   └── *.js                    # Serverless API endpoints
├── api/__tests__/              # Backend tests (Jest)
└── client/src/**/__tests__/    # Frontend tests (Vitest + RTL)
```

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `client/src/pages/Dashboard.tsx` | Main unified dashboard |
| `client/src/pages/SimpleDashboard.tsx` | Legacy simple dashboard |
| `client/src/pages/LiveAIDemo.tsx` | AI demo page |
| `client/src/pages/Onboarding.tsx` | Onboarding wizard |
| `client/src/pages/BookingPage.tsx` | Public customer booking portal |
| `client/src/components/common/PhoneInput.tsx` | Country code selector (30+ countries) |
| `client/src/components/dashboard/StatsBar.tsx` | Dashboard stats bar |
| `client/src/components/dashboard/ReservationsList.tsx` | Upcoming reservations list |
| `client/src/components/dashboard/ActivePartiesPanel.tsx` | Active parties panel |
| `client/src/hooks/useRealtimeSubscription.ts` | Supabase Realtime subscriptions |

### Backend
| File | Purpose |
|------|---------|
| `api/_lib/supabase.js` | Database service layer (~1900 lines) |
| `api/_lib/auth.js` | JWT auth, Google OAuth, restaurant_id in tokens |
| `api/_lib/rate-limit.js` | Upstash Redis rate limiting with fallback |
| `api/_lib/secure-logger.js` | Logging with sensitive data masking |
| `api/_lib/stripe-usage-reporter.js` | Metered billing usage reporting |
| `api/host-dashboard.js` | Dashboard API endpoints |
| `api/reservations.js` | Reservation CRUD |
| `api/waitlist.js` | Waitlist management |
| `api/whatsapp-webhook.js` | Meta Cloud WhatsApp integration |
| `api/twilio-whatsapp-webhook.js` | Twilio WhatsApp integration |
| `api/stripe-webhook.js` | Stripe payment webhooks |
| `api/batch-predict.js` | ML no-show predictions (cron + single-restaurant) |

---

## Testing

### Backend (Jest)
```bash
npx jest --forceExit    # 1434+ tests across 80 suites
```

Test files:
- `api/__tests__/auth.test.js` - JWT, middleware, restaurant lookup
- `api/__tests__/multi-tenancy.test.js` - Restaurant isolation
- `api/__tests__/supabase.test.js` - Database operations

### Frontend (Vitest + React Testing Library)
```bash
cd client && npx vitest run    # 458+ tests across 45 suites
```

Test files:
- `client/src/utils/__tests__/timeFormatting.test.ts` - Time formatting utilities
- `client/src/utils/__tests__/tableCombinations.test.ts` - Table combination algorithm
- `client/src/components/dashboard/__tests__/StatsBar.test.tsx` - Stats bar
- `client/src/components/dashboard/__tests__/ReservationsList.test.tsx` - Reservations list
- `client/src/components/dashboard/__tests__/ActivePartiesPanel.test.tsx` - Active parties
- `client/src/components/common/__tests__/PhoneInput.test.tsx` - Phone input
- `client/src/components/host/__tests__/WaitlistPanel.test.tsx` - Waitlist panel
- `client/src/components/host/__tests__/WalkInModal.test.tsx` - Walk-in modal

---

## Environment Variables

See `.env.example` for the full list. Key groups:

| Group | Variables |
|-------|-----------|
| **Core** | `NODE_ENV`, `PORT`, `CLIENT_URL` |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **AI** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `CARTESIA_API_KEY` |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` |
| **Metered Billing** | `STRIPE_METERED_PRICE_RESERVATION`, `_AI_CALL`, `_SMS`, `_WHATSAPP` |
| **Rate Limiting** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| **Cron** | `CRON_SECRET` |
| **Email** | `RESEND_API_KEY` |

---

## Development

### Local Setup
```bash
# Install dependencies
npm install --legacy-peer-deps

# Run frontend (port 5173 or 5174)
cd client && npm run dev

# Run backend (port 3001)
npm run server:dev

# Or run both together
npm run dev:full

# Build for production
cd client && npm run build
```

### Deployment
Push to `main` branch triggers automatic Vercel deployment.

### Code Conventions
- All API endpoints use `createSecureLogger` (not `console.log`) for logging
- All API queries are scoped by `restaurant_id` for multi-tenancy
- Cron jobs use `supabaseAdmin` (service role) and are secured with `CRON_SECRET`
- Frontend supports EN + ES via i18n
- Tests must pass before pushing: `npx jest --forceExit && cd client && npx vitest run`

---

## Contact

- **Email**: hello@seatable.one
- **Response Time**: Within 24 hours

---

**Last Updated**: June 10, 2026

---

## Current Roadmap

### Phase 1 — Foundation & Quality ✅ COMPLETE
- [x] React Query v5 migration
- [x] TypeScript strict — eliminate all `any` types
- [x] A11y sweep — role=dialog, aria-modal, type=button across all components
- [x] Component splitting — all files under 400-line limit
- [x] UX/GDPR/product audit — 18 issues resolved (P0–P3)
- [x] Favicon, PWA manifest, og-image
- [x] i18n — EN + ES translations complete
- [x] Multi-tenant isolation — restaurant_id scoping on all queries

### Phase 2 — Core Product Stability ✅ COMPLETE
- [x] Security audit remediation (H-01 cross-tenant, H-02 churn % bug, M-01 PII)
- [x] Cron jobs hardened — timezone, cross-tenant isolation, rate limiting
- [x] Customer portal — public endpoint (no JWT), branding
- [x] WhatsApp status card in Voice Settings (connected/pending/not configured)
- [x] AI Insights dashboard — unified command centre
- [x] Customer Intelligence — LTV, churn risk, retention campaigns
- [x] Churn cron — full LTV recalculation daily
- [x] Email sending domain → seatable.one

### Phase 3 — Demo & Conversion Flow ✅ COMPLETE
- [x] Demo setup form (`/demo/setup`) — creates personalised demo restaurant
- [x] Demo dashboard — seeded tables, reservations, AI voice agent
- [x] Demo banner — "7 days left · Upgrade to keep your data"
- [x] Demo → signup conversion — token persists through OAuth redirects
- [x] Post-conversion — pre-fills onboarding from demo session
- [x] Post-conversion — welcome toast on first dashboard load
- [x] Bug fix — normalize cuisine_type to valid restaurant_type enum

### Phase 4 — Growth & Retention ✅ COMPLETE
- [x] Onboarding polish — blur validation, clickable sidebar, phone sync, 5s countdown modal
- [x] WhatsApp integration end-to-end test (Meta Cloud + Twilio paths)
- [x] Voice agent — test full reservation booking flow via ElevenLabs
- [x] Analytics dashboard — date-range reports, export CSV
- [x] Demo nurture email sequence — drip after demo creation
- [x] Referral / invite flow for restaurant owners

### Phase 5 — Manager AI Agent ✅ COMPLETE
- [x] DB migrations — manager_memory, manager_conversations tables + pgvector RPC
- [x] managerMemory service — OpenAI embeddings, hybrid memory retrieval
- [x] restaurantSnapshot service — live context (reservations, waitlist, active parties)
- [x] manager-agent.js — Claude claude-sonnet-4-6 core handler with memory + snapshot
- [x] manager-chat API — in-app chat endpoint (GET history + POST message)
- [x] ManagerChatPanel — floating FAB + chat UI on dashboard with optimistic updates
- [x] manager-whatsapp webhook — WhatsApp channel for manager AI
- [x] manager-whatsapp-verify — OTP phone verification (E.164 + 10-min expiry)
- [x] manager-briefings cron — proactive end-of-day (11pm) + morning (8am) briefings
- [x] manager-documents endpoint — PDF/text upload with claude-haiku fact extraction
- [x] Step5TeachAI — onboarding step to prime manager memory during setup

### Phase 6 — Revenue & Monetization Hardening ✅ COMPLETE
- [x] Manager AI plan gates — Starter 100/mo, Growth 500/mo, Scale unlimited
- [x] Manager AI usage tracking — manager_ai_call metric → usage_tracking table
- [x] Stripe metered billing — manager_ai_call → seatable_manager_ai meter event
- [x] manager-usage endpoint — GET /api/manager-usage → used/limit/plan/resets_at
- [x] ManagerAIUsageBar — dashboard progress bar with upgrade CTA at 80%
- [x] ManagerChatPanel quota awareness — disabled input + banner at limit

### Phase 7 — Manager AI Voice Briefings + Proactive Alerts ✅ COMPLETE
- [x] DB migration — manager_alerts_log table with UNIQUE(restaurant_id, alert_type, date) dedup
- [x] briefing-sender.js — routes delivery: text→WhatsApp, voice_note→ElevenLabs TTS→Supabase Storage→WhatsApp audio, phone_call→Twilio TwiML
- [x] sendWhatsAppAudioMessage — Meta Cloud API `type: audio` with signed Supabase Storage URL
- [x] manager-briefings.js — updated to use briefing-sender (channel-aware delivery)
- [x] manager-alerts.js — 3 alert types (low_covers @18h, high_noshows @15h, late_cancellations @12/14/16/18/20h) with per-day dedup
- [x] vercel.json — 3 new cron entries for manager-alerts
- [x] manager-preferences.js — GET/PATCH /api/manager-preferences with allowlist validation and JSONB merge
- [x] useManagerPreferences hook — React Query GET/PATCH with 5-min stale time
- [x] ManagerNotificationsPanel — briefing channel radio + 3 alert toggles, wired into WhatsApp Settings page

### Phase 8 — Staffing Intelligence ✅ COMPLETE
- [x] DB migration — `staffing_config` JSONB column on `restaurant.restaurant_config` (default FOH/BOH/Bar ratios)
- [x] staffingService.js — `calculateStaffing(covers, roles)` + `buildForecast(reservationsByDate, roles)` pure functions
- [x] staffing-forecast.js — GET /api/staffing-forecast → 7-day forecast with role headcounts
- [x] staffing-config.js — GET/PATCH /api/staffing-config with role array validation
- [x] restaurantSnapshot.js — 3-day staffing_forecast injected into snapshot (used by manager AI system prompt)
- [x] manager-agent.js — `[STAFFING FORECAST - NEXT 3 DAYS]` block in system prompt
- [x] useStaffingForecast hook — React Query GET with 10-min stale time
- [x] useStaffingConfig hook — React Query GET/PATCH, invalidates forecast on save
- [x] StaffingForecastWidget — 3-day forecast widget in Dashboard left column
- [x] StaffingSettingsPanel — per-role covers/staff config panel in WhatsApp Settings page

### Phase 9 — Revenue Forecasting + Booking Widget + Voice Persona ✅ COMPLETE
- [x] DB migration — total_bill NUMERIC(10,2) on public.service_records *(apply in Supabase SQL editor)*
- [x] DB migration — agent_name TEXT + agent_greeting TEXT on restaurant.restaurant_config *(apply in Supabase SQL editor)*
- [x] revenue-stats.js — GET /api/revenue-stats → avg_spend_per_cover (5+ data point threshold, €40 default)
- [x] voice-persona.js — GET/PATCH /api/voice-persona → agent_name + agent_greeting with length validation
- [x] host-dashboard.js — complete-service action accepts optional total_bill
- [x] persona-prompt-builder.js — injects agent_name + agent_greeting into voice agent prompt
- [x] useRevenueStats hook + RevenueStatsWidget — 7-day revenue projection bar chart in Dashboard left column
- [x] useVoicePersona + VoicePersonaPanel — agent name + greeting config panel in Voice Settings
- [x] widget.js — iframe booking button served from /widget.js?slug= (client/public/widget.js)
- [x] EmbedSnippetPanel — copy-paste snippet panel in Voice Settings
- [x] BookingPage — ?embed=true hides nav for iframe embed mode
- [x] ActivePartiesPanel — optional total_bill number input on Complete Service

### Phase 10 — Premium Booking Experience ✅ COMPLETE
- [x] DB migration — `customer_push_subscriptions` table (PWA push subscriptions)
- [x] DB migration — `deposit_payment_intent_id` + `deposit_amount` on `reservations`; `deposit_config` on `restaurant.restaurant_config`
- [x] tableAssignmentService.js — pure scoring (size fit 50pts + floor spread 30pts)
- [x] table-suggestion.js — GET /api/table-suggestion?party_size=N
- [x] NoShowRiskBadge + DepositBadge — wired into ReservationsList reservation cards
- [x] restaurantSnapshot.js — deposit_summary injected into Manager AI system prompt
- [x] PWA manifest — standalone display, start_url /book, 192+512 icons
- [x] service worker (sw.js) — cache-first, push event handler, notificationclick
- [x] push-subscribe.js — POST /api/push-subscribe (public, customer-facing)
- [x] push-send.js — POST /api/push-send (internal, CRON_SECRET, web-push, expired sub cleanup)
- [x] BookingConfirmation.tsx — requests push permission + subscribes after booking
- [x] deposit-config.js — GET/PATCH /api/deposit-config (flat or per_person)
- [x] create-deposit-intent.js — POST /api/create-deposit-intent (Stripe capture_method: manual)
- [x] capture-deposit.js — POST /api/capture-deposit (captures hold on no-show)
- [x] release-deposit.js — POST /api/release-deposit (cancels hold on arrival)
- [x] DepositPaymentStep.tsx — Stripe Elements + PaymentElement in booking flow
- [x] BookingForm.tsx — deposit step before reservation confirm
- [x] DepositActions.tsx — capture/release buttons in dashboard reservation rows
- [x] DepositSettingsPanel.tsx — deposit config UI in WhatsApp Settings page
- [x] vercel.json — rewrites for all 7 new endpoints

### Phase 11 — First Real Customers ✅ COMPLETE
- [x] 11A: import-history.js — POST /api/import-history (CSV upload, multipart)
- [x] 11A: importPipeline.js — seeds customer_ltv, service_records, manager_memory
- [x] 11A: Step5ImportHistory.tsx — drag-and-drop CSV upload with VIP/regular summary
- [x] 11A: Onboarding.tsx — insert step 5 (after restaurant created), 6 steps total
- [x] 11B: restaurantSnapshot.js — enrich upcoming reservations with is_regular, visit_count, preferences
- [x] 11B: manager-briefings.js — add [VIP GUESTS TODAY] block to morning briefing prompt
- [x] 11C: analytics/compare.js — GET /api/analytics/compare (period aggregation)
- [x] 11C: manager-agent.js — add compare_periods tool

### Phase 11.5 — Per-Restaurant ElevenLabs Agents ✅ COMPLETE
- [x] elevenlabsAgentService.js — consolidated agent lifecycle (create/sync KB/delete)
- [x] elevenlabs-kb-sync.js — per-restaurant KB sync with doc tracking
- [x] elevenlabs-signed-url.js — auto-resolve per-restaurant agent
- [x] elevenlabs-agent-cleanup.js — deactivate/delete with ownership validation
- [x] ElevenLabsWidget.tsx — WebRTC + signed URL auth
- [x] onboarding/complete.js — fire-and-forget KB sync after agent creation
- [x] DB migration — elevenlabs_kb_doc_id column on restaurant_config
- [x] E2E tests — 15 tests (auth guards, method validation, CORS, authenticated flows, UI)
- [x] DNS — seatable.one A record → 216.150.1.1, CNAME www → vercel-dns-017

### Phase 12 — Demo Conversion & Product-Market Fit 🚧 IN PROGRESS
*Driven by Renan's strategic review (2026-03-12). Full plan: tasks/plan.md*

#### 12A: Demo Flow Overhaul (kill conversion friction)
- [x] 12A-1: Google Maps auto-scraper — hours, reviews, cuisine, photos, phone, address
- [x] 12A-2: Kill demo data wall — `/demo/setup` → auto-scrape → land in pre-populated dashboard
- [x] 12A-3: Real-time micro-animations — pulsing buttons, live reservation pop-ins, ticking timers
- [x] 12A-4: Exit-intent popup with WhatsApp CTA instead of entry gate

#### 12B: Revenue Intelligence (entrepreneur value) ✅ COMPLETE
- [x] 12B-1: Revenue prediction per reservation — predicted spend next to each booking
- [x] 12B-2: Aggregate predicted daily revenue KPI on dashboard
- [x] 12B-3: Real-time revenue update — metrics recalculate when entering bill amounts
- [x] 12B-4: Average revenue by table size tracking

#### 12C: Manager AI UX Overhaul
- [x] 12C-1: Replace chat bubble with full-screen Manager AI interface (ChatGPT-style)
- [x] 12C-2: Pre-reservation WhatsApp upsell — AI sends dish recs + chef special before visit

#### 12D: Landing Page & Demo Polish
- [x] 12D-1: Landing page overhaul — embedded video/GIF of WhatsApp + voice agent in action
- [x] 12D-2: Fix language inconsistencies — English strings in PT/ES UI
- [x] 12D-3: Build 3 mock restaurant demos with realistic fake data

#### 12E: Production Readiness (from Phase 12 plan)
- [x] 12E-1: AddReservationModal — host creates reservations from dashboard
- [x] 12E-2: EditReservationModal — inline edit from ReservationsList
- [x] 12E-3: Cancel from dashboard with customer notification
- [x] 12E-4: Restaurant settings page — edit hours/policies post-onboarding
- [x] 12E-5: Reservation confirmation/modification/cancellation emails
- [x] 12E-6: Activity log + feed on dashboard
- [x] 12E-7: Cron health monitoring
