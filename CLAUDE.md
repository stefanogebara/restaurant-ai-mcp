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
| **Testing** | Jest (backend, 496 tests), Vitest + RTL (frontend, 295 tests), Playwright (E2E) |
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

### EUR (Europe)
| Plan | Price | Features |
|------|-------|----------|
| **Starter** | EUR 29/month | AI reservations (Chat + WhatsApp), Host dashboard, Basic analytics, Email support, Up to 100 reservations/month |
| **Growth** | EUR 99/month | Everything in Starter + Voice AI agent, Advanced analytics, Waitlist management, Up to 150 reservations/month, SMS notifications |
| **Scale** | EUR 199/month | Everything in Growth + Unlimited reservations, Unlimited SMS, Priority support, Custom integrations |

### BRL (Brazil)
| Plan | Price | Features |
|------|-------|----------|
| **Free** | R$0/month | AI reservations (Chat + WhatsApp), Host dashboard, Basic analytics, Up to 30 reservations/month |
| **Starter** | R$149/month | Everything in Free + Up to 100 reservations/month, Email support, Advanced analytics |
| **Growth** | R$499/month | Everything in Starter + Voice AI agent, Waitlist management, Up to 150 reservations/month, SMS |
| **Scale** | R$999/month | Everything in Growth + Unlimited reservations, Unlimited SMS, Priority support, Custom integrations |

*Growth plan includes 14-day free trial. Usage-based metered billing for reservations, AI calls, SMS, and WhatsApp. Currency auto-detected from browser locale.*

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
| `/host-dashboard/legacy` | SimpleDashboard | Legacy simple view |
| `/host-dashboard/reports` | Weekly Reports | Date-range reports with metrics |
| `/host-dashboard/segovia` | Segovia Insights | AI-powered insights |
| `/host-dashboard/calls` | Call Tracking | AI agent call dashboard |
| `/host-dashboard/tables` | Table Config | Table setup and management |
| `/host-dashboard/voice-settings` | Voice Settings | AI voice configuration |
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
| `api/_lib/supabase.js` | Database service barrel (imports from 6 domain modules) |
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
npx jest --forceExit    # 496 tests across 16 suites
npm run test:all        # Run backend + frontend tests together
```

Test files:
- `api/__tests__/auth.test.js` - JWT, middleware, restaurant lookup
- `api/__tests__/multi-tenancy.test.js` - Restaurant isolation
- `api/__tests__/supabase.test.js` - Database operations
- `api/__tests__/reservations.test.js` - Reservation CRUD (create, lookup, list, modify, cancel)
- `api/__tests__/waitlist.test.js` - Waitlist GET/POST/PATCH/DELETE
- `api/__tests__/host-dashboard.test.js` - Dashboard, check-in, complete-service, create-table
- `api/__tests__/whatsapp-templates.test.js` - WhatsApp template rendering, i18n, interpolation
- `api/__tests__/onboarding-complete.test.js` - Brazil free plan vs Growth trial logic
- `api/__tests__/subscription-limits.test.js` - Plan limits, features, reservation checks
- `api/__tests__/validation.test.js` - Input validation, sanitization, XSS prevention (98% coverage)
- `api/__tests__/availability-calculator.test.js` - Time slots, capacity, dining duration (96% coverage)
- `api/__tests__/table-assignment.test.js` - Table matching, combinations, adjacency (95% coverage)
- `api/__tests__/customer-history.test.js` - Airtable customer CRUD, stats, backfill (95% coverage)
- `api/__tests__/portal.test.js` - Public booking portal: restaurant lookup, availability, reserve
- `api/__tests__/analytics.test.js` - Analytics dashboard: auth, period filtering, data structure
- `api/__tests__/stripe-webhook.test.js` - All 7 Stripe event types: subscription lifecycle, invoices (87% coverage)

### Frontend (Vitest + React Testing Library)
```bash
cd client && npx vitest run    # 295 tests across 20 suites
```

Test files:
- `client/src/utils/__tests__/timeFormatting.test.ts` - Time formatting utilities
- `client/src/utils/__tests__/tableCombinations.test.ts` - Table combination algorithm
- `client/src/utils/__tests__/currency.test.ts` - Currency detection + formatting (BRL/EUR)
- `client/src/config/__tests__/planFeatures.test.ts` - Plan features, limits, access checks
- `client/src/components/dashboard/__tests__/StatsBar.test.tsx` - Stats bar
- `client/src/components/dashboard/__tests__/ReservationsList.test.tsx` - Reservations list
- `client/src/components/dashboard/__tests__/ActivePartiesPanel.test.tsx` - Active parties
- `client/src/components/common/__tests__/PhoneInput.test.tsx` - Phone input
- `client/src/components/host/__tests__/WaitlistPanel.test.tsx` - Waitlist panel
- `client/src/components/host/__tests__/WalkInModal.test.tsx` - Walk-in modal

### E2E (Playwright)
```bash
npx playwright test                           # All E2E tests
npx playwright test e2e/critical-flows.spec.ts  # Critical flows only
npx playwright test e2e/brazil-launch.spec.ts   # Brazil launch smoke tests
```

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

## Completed Phases

### Phase 1: Figma HTML Mockups (DONE)
15 HTML mockup files created in `.figma-mockups/` covering all pages.

### Phase 2: Implement Figma Designs into React (DONE - Feb 19, 2026)
All 15 designs implemented. Commit `5d64fc7b`. 30 files changed, +1,576/-3,115 lines.
Design system: Playfair Display + Inter, burgundy `#9F1239`, charcoal `#1C1917`, warm-white `#FAFAF9`.

---

## Current Roadmap

### Phase 3: Security Hardening (CRITICAL - DONE)
- [x] **RLS Policy Fixes** (migration executed: `database/migrations/20260220_security_hardening.sql`)
  - [x] Remove `USING(true)` on reservations, service_records, customer_history, ml_interventions, agent_conversations
  - [x] Restrict all sensitive tables from anon/public to authenticated-only
  - [x] Fix `public.users` RLS to own-data-only (`auth.uid()`)
  - [x] Revoke blanket `GRANT SELECT ON ALL TABLES IN SCHEMA restaurant` from anon
  - [x] Re-grant only `restaurant_info` (public profiles) and `sms_logs` (webhook) to anon
  - [x] **Migration executed in Supabase SQL Editor (2026-02-20)**
- [x] **Server-side IDOR Fixes**
  - [x] `api/ltv.js` - now uses `req.user.restaurant_id` from JWT
  - [x] `api/agent-conversations.js` - now uses `req.user.restaurant_id` from JWT
  - [x] `api/ml-performance.js` - now uses `req.user.restaurant_id` from JWT
  - [x] `api/restaurant-settings.js` - added auth + uses `req.user.restaurant_id`
  - [x] `api/portal.js` - public availability endpoint (intentional, not IDOR)
  - [x] `api/batch-predict.js` - cron uses CRON_SECRET, auth path uses JWT (OK)
  - [x] `api/get-wait-time.js` - public endpoint (intentional, non-sensitive)
- [x] **Frontend IDOR Fixes**
  - [x] `CallTrackingDashboard.tsx` - removed restaurant_id from agent-conversations calls
  - [x] `QuickStatsWidget.tsx` - removed restaurant_id from ml-performance calls
  - [x] `LanguageSelector.tsx` - switched from axios+x-restaurant-id to authFetch
- [x] **Remaining**: `phone-integration-simple.js` - added JWT auth, restaurant_id from JWT claim (Feb 21)

### Phase 4: Reliability & Bug Fixes (DONE - Feb 20, 2026)
- [x] Fix analytics date filter - now passes `period` param to API and refetches on change
- [x] Fix hardcoded booking data - removed fake rating/atmosphere/price, show real phone/email
- [x] Fix Dashboard Export button - now exports reservations as CSV instead of navigating away
- [x] Fix N+1 queries in `api/batch-predict.js` - parallelized customer stats fetching
- [x] Fix dashboard cache key mismatch (`['dashboard']` → `['hostDashboard']`)
- [x] Wire up dead `showCompleteModal` - confirmation dialog now shows before completing service
- [ ] Add proper error handling (replace silent catch blocks)
- [ ] Setup Sentry error monitoring

### Phase 5: Code Quality & Technical Debt (DONE - Feb 20, 2026)
- [x] Split `api/_lib/supabase.js` god file (1908 lines → 6 domain modules + 51-line barrel)
- [x] Fix `any` type annotations across pages (44 → 30, 0 remaining in pages)
- [x] Remove duplicate UpgradePrompt components (3 → 1, deleted 2 unused)
- [x] Remove duplicate Supabase client on frontend (services/supabase.ts deleted)
- [x] Remove fabricated "320+ restaurants" claim on landing page
- [x] Remove Airtable-era field mapping layer in analytics.js
- [x] Add missing dialog ARIA attributes on 13 inline modals
- [x] Add missing label associations in BookingPage (4 fields)
- [ ] Wire up i18n system (31 refs across 12 pages - deferred, large scope)
- [ ] Use design system tokens instead of raw hex values (447+ usages - deferred, large scope)

### Phase 6: Brazil Launch Preparation (DONE - Feb 20, 2026)
- [x] Increase Starter plan limit (50 → 100 reservations/month)
- [x] Simplify onboarding (7 steps → 4: Info → Contact → Tables & Settings → Review & Launch)
- [x] Add PT-BR translation (i18n config, 166 keys, WhatsApp templates with pt variants)
- [x] Create freemium tier (Free plan: R$0, 30 reservations/month, basic dashboard)
- [x] Add BRL pricing + currency detection (auto-detect from browser locale, boleto support)
- [x] WhatsApp connection prep (model updated to claude-sonnet-4, env vars documented)
- [x] Create Brazilian demo restaurant ("Boteco do Samba", São Paulo, seed script)

### Phase 8: WhatsApp Integration (DONE - Feb 21, 2026)
- [x] **Database**: Added `whatsapp_enabled` + `whatsapp_phone_number` to `restaurant.restaurant_config`
- [x] **Shared sender library**: `api/_lib/whatsapp-sender.js` - `sendWhatsAppMessage`, `sendTemplateMessage`, `sendReservationConfirmation`, `isWhatsAppConfigured`
- [x] **Settings API**: `api/whatsapp-settings.js` - status, stats, update (PATCH), test message (POST)
- [x] **WhatsApp-first reservations**: `api/reservations.js` - Meta API first, SMS fallback, dynamic restaurant name
- [x] **Per-restaurant reminders**: `api/cron/send-reminders.js` - Meta API per-restaurant, Twilio fallback
- [x] **Portal API**: `api/portal.js` - includes `whatsapp_enabled` + per-restaurant `wa_me_link`
- [x] **Onboarding**: WhatsApp toggle + phone in Step 2 Contact, saved via `api/onboarding/complete.js`
- [x] **Frontend settings page**: `client/src/pages/WhatsAppSettingsPage.tsx` + React Query hooks
- [x] **Booking page**: Floating WhatsApp button (`WhatsAppButton.tsx`) when restaurant has WhatsApp enabled
- [x] **Booking confirmation**: WhatsApp CTA button when `wa_me_link` is in navigation state
- [x] **Dashboard**: `WhatsAppStatsCard.tsx` auto-shown when WhatsApp enabled
- [x] **Tests**: 40 new tests covering `whatsapp-sender` + `whatsapp-settings` APIs

### Phase 7: Testing & Quality Assurance (IN PROGRESS - Feb 20, 2026)
- [x] Add unit tests for Phase 6 code (currency.ts, planFeatures.ts, subscription-limits.js) - 103 tests
- [x] Add API endpoint tests (reservations, waitlist, host-dashboard) - 39 tests
- [x] Add WhatsApp templates + onboarding tests - 50 tests
- [x] Add E2E tests (Playwright: brazil-launch.spec.ts + updated critical-flows.spec.ts)
- [x] Add `test:all` script, include api/ml/** in coverage config
- [x] Fix production bug: timezone scoping in reservations.js handleCreate
- [ ] Increase test coverage to 80%+
- [ ] Stress test with concurrent users
- [ ] Add API documentation

---

## Strategic Context

- **Target**: Brazil-first, Q2 2026 launch
- **Goal**: 10+ paying restaurants in 6 months
- **Founder**: Solo bootstrapped developer
- **Monetization**: Freemium for Brazil, EUR pricing for Europe
- **Top Priority**: Reliability/bugs, then WhatsApp integration

---

## Known Security Issues (from Feb 2026 audit)

| Severity | Issue | File | Status |
|----------|-------|------|--------|
| CRITICAL | RLS bypassed - all queries use supabaseAdmin | `api/_lib/supabase.js` | All queries scoped by restaurant_id at app layer |
| CRITICAL | Public read on reservations (`USING(true)`) | `seatable-eu-migration.sql:894` | FIXED (Feb 20) - Migration executed |
| CRITICAL | Anon access to POS OAuth tokens | `20260126_pos_and_revenue.sql:153` | FIXED (Feb 20) - Anon grants revoked |
| CRITICAL | IDOR via localStorage restaurant_id | `CallTrackingDashboard.tsx:107` | FIXED (Feb 20) |
| CRITICAL | IDOR in ltv.js, agent-conversations.js, ml-performance.js | Multiple API files | FIXED (Feb 20) |
| CRITICAL | No auth on restaurant-settings.js | `api/restaurant-settings.js` | FIXED (Feb 20) |
| HIGH | Analytics date filter cosmetic only | `AnalyticsDashboard.tsx:50` | FIXED (Feb 20) |
| HIGH | Hardcoded fake restaurant data | `BookingPage.tsx:227` | FIXED (Feb 20) |
| MEDIUM | phone-integration-simple.js has no auth | `api/phone-integration-simple.js` | FIXED (Feb 21) |
| MEDIUM | 17 `any` types across pages | Multiple files | Needs fix |
| LOW | Fabricated "320+ restaurants" on landing | Landing components | FIXED (Feb 20) |

---

## Contact

- **Email**: hello@seatable.io
- **Response Time**: Within 24 hours

---

**Last Updated**: February 20, 2026 (Phase 3 security migration executed)
