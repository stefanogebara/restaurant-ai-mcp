## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

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

**Production URL**: https://restaurant-ai-mcp.vercel.app

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
| **Testing** | Jest (backend, 164 tests), Vitest + RTL (frontend, 100 tests) |
| **Logging** | createSecureLogger (masks sensitive data) |

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
| **Starter** | EUR 29/month | AI reservations (Chat + WhatsApp), Host dashboard, Basic analytics, Email support, Up to 50 reservations/month |
| **Growth** | EUR 99/month | Everything in Starter + Voice AI agent, Advanced analytics, Waitlist management, Up to 150 reservations/month, SMS notifications |
| **Scale** | EUR 199/month | Everything in Growth + Unlimited reservations, Unlimited SMS, Priority support, Custom integrations |

*Growth plan includes 14-day free trial. Usage-based metered billing for reservations, AI calls, SMS, and WhatsApp.*

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
| Every 5 min | `/api/cron/check-late-reservations` | Marks 20+ min late reservations as no-show |
| Daily 9 AM | `/api/cron/send-reminders` | Sends reservation reminders |
| Daily 6 AM | `/api/cron/update-churn-scores` | Recalculates customer churn risk |
| Daily 4 AM | `/api/report-usage` | Reports metered usage to Stripe |

All cron jobs are secured with `CRON_SECRET` Bearer token and use `createSecureLogger`.

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
npx jest --forceExit    # 164 tests across 3 suites
```

Test files:
- `api/__tests__/auth.test.js` - JWT, middleware, restaurant lookup
- `api/__tests__/multi-tenancy.test.js` - Restaurant isolation
- `api/__tests__/supabase.test.js` - Database operations

### Frontend (Vitest + React Testing Library)
```bash
cd client && npx vitest run    # 100 tests across 8 suites
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

- **Email**: hello@seatable.io
- **Response Time**: Within 24 hours

---

**Last Updated**: February 28, 2026

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

### Phase 4 — Growth & Retention 🔲 IN PROGRESS
- [x] Onboarding polish — blur validation, clickable sidebar, phone sync, 5s countdown modal
- [ ] WhatsApp integration end-to-end test (Meta Cloud + Twilio paths)
- [ ] Voice agent — test full reservation booking flow via ElevenLabs
- [x] Analytics dashboard — date-range reports, export CSV
- [ ] Demo nurture email sequence — drip after demo creation
- [ ] Referral / invite flow for restaurant owners
