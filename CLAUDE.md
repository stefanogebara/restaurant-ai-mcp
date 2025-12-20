# Seatable - AI Restaurant Management Platform

## Project Overview

**Seatable** is an AI-powered restaurant management platform that enables customers to make reservations through natural conversation (voice/text) while providing restaurant hosts with real-time dashboards to manage walk-ins, reservations, and table assignments.

**Production URL**: https://restaurant-ai-mcp.vercel.app

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Backend** | Node.js, Express (Vercel Serverless) |
| **Database** | Supabase PostgreSQL |
| **AI Services** | Anthropic Claude, OpenAI, ElevenLabs (TTS) |
| **Payments** | Stripe |
| **Deployment** | Vercel (auto-deploy on push to main) |
| **State** | React Query (@tanstack/react-query) |

---

## Pricing Plans

| Plan | Price | Features |
|------|-------|----------|
| **Basic** | €49.99/month | AI reservations, Host dashboard, Basic analytics |
| **Professional** | €99.99/month | Everything in Basic + Advanced analytics, Waitlist management, Priority support, Unlimited reservations, SMS notifications |

*All plans include 14-day free trial*

---

## Application Routes

### Public Pages
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing Page | Marketing site with features, pricing, FAQ, contact |
| `/live-demo` | Live AI Demo | Voice-based AI reservation demo |
| `/onboarding` | Onboarding Wizard | 6-step restaurant setup flow |
| `/login` | Login | Google OAuth authentication |

### Dashboard Pages
| Route | Page | Description |
|-------|------|-------------|
| `/host-dashboard/simple` | Simple Dashboard | Streamlined view with stats and table layout |
| `/host-dashboard/advanced` | Advanced Dashboard | Full floor overview with more stats |
| `/host-dashboard/reports` | Weekly Reports | Date-range reports with metrics |
| `/host-dashboard/ltv` | Customer LTV | Customer lifetime value education |
| `/host-dashboard/dna` | Customer DNA | Behavioral insights education |
| `/host-dashboard/calls` | AI Agent Dashboard | Call tracking and phone integration |
| `/host-dashboard/ml` | Twin Intelligence | Personalized recommendations (experimental) |

---

## Landing Page Sections

1. **Hero** - "Transform Your Restaurant with AI"
2. **Features Grid** - 6 feature cards
3. **Interactive Demo** - Call/text demo options
4. **Pricing** - Basic & Professional plans
5. **FAQ** - 5 expandable questions
6. **Contact Form** - Schedule demo call

### Advertised Features
- Real-Time Host Dashboard
- Smart Table Matching
- Live Wait Times
- Automated Notifications
- Analytics & Insights

---

## Onboarding Flow (6 Steps)

1. **Restaurant Basics** - Name, type, country, city
2. **Contact & Hours** - Phone (with country code selector), email, business hours
3. **Table Setup** - Define tables by area (Indoor, Patio, Bar)
4. **AI Configuration** - Customize assistant behavior
5. **Review** - Confirm all settings
6. **Launch** - Go live

### Restaurant Types Supported
Fine Dining, Casual Dining, Fast Casual, Cafe, Bar, Bistro, Pizzeria, Steakhouse, Seafood, Other

---

## Simple Dashboard Features

### Header
- Date display (Today + day of week)
- Plan badge (Professional)
- Language toggle (EN/ES)
- View toggle (Complete/Advanced)

### Stats Cards
- Tables Occupied (X/10)
- Occupancy %
- Reservations Today
- Waiting count
- Active Tables
- Avg Duration
- Peak Hours
- Revenue Today

### Actions
- **+ Add Walk-in** button

### Table Layout
- Visual grid of all tables
- Status indicators: Available (green), Occupied (red), Being Cleaned (yellow)
- Table info: Number, capacity, location
- "Tap to manage" interaction

---

## Advanced Dashboard Features

### Stats Grid (6 cards)
- Total Capacity
- Available Seats
- Occupied Seats
- Occupancy %
- Active Parties
- Est. Wait Time

### Actions
- Weekly Report button
- Add Walk-in button

---

## Weekly Reports

- Date range selector (Start/End)
- Download/Print functionality
- Refresh button
- Update Report button

### Metrics
- **Total Covers** (with week-over-week %)
- **Total Reservations** (seated vs walk-ins breakdown)
- **Avg Party Size** (with guest total)
- **Cancellation Rate** (with count)

---

## AI Agent Dashboard (Call Tracking)

- Phone Integration setup
- Filters: Time Period, Outcome, Language
- **Total Calls** count
- **Reservations** made via AI

---

## Database Schema (Supabase)

| Table | Purpose |
|-------|---------|
| `restaurant_info` | Business config, hours, policies |
| `tables` | Physical table inventory |
| `reservations` | Customer bookings |
| `service_records` | Active dining sessions |
| `waitlist` | Customers waiting |
| `customer_history` | Visit history & preferences |
| `subscriptions` | Stripe subscription data |

---

## Project Structure

```
restaurant-ai-mcp/
├── client/
│   └── src/
│       ├── pages/           # React pages
│       ├── components/      # Reusable components
│       │   ├── common/      # PhoneInput, etc.
│       │   ├── host/        # Dashboard components
│       │   ├── onboarding/  # Onboarding steps
│       │   └── landing/     # Landing page sections
│       ├── contexts/        # Auth & state
│       ├── services/        # API clients
│       └── types/           # TypeScript types
├── api/
│   ├── routes/              # API endpoints
│   ├── _lib/                # Supabase service layer
│   └── index.js             # Express server
└── scripts/                 # Utility scripts
```

---

## Key Files

### Frontend
- `client/src/pages/SimpleDashboard.tsx` - Main simple dashboard
- `client/src/pages/HostDashboard.tsx` - Advanced dashboard
- `client/src/pages/LiveAIDemo.tsx` - AI demo page
- `client/src/pages/Onboarding.tsx` - Onboarding wizard
- `client/src/components/onboarding/Step2Contact.tsx` - Contact form with phone input
- `client/src/components/common/PhoneInput.tsx` - Country code selector (30+ countries)

### Backend
- `api/routes/host-dashboard.js` - Dashboard API endpoints
- `api/routes/reservations.js` - Reservation endpoints
- `api/_lib/supabase.js` - Database service layer

---

## Environment Variables

```env
# Core
NODE_ENV=production
PORT=3001
CLIENT_URL=https://restaurant-ai-mcp.vercel.app

# Supabase
SUPABASE_URL=https://lurebwaudisfilhuhmnj.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# AI Services
ANTHROPIC_API_KEY=sk-ant-***
OPENAI_API_KEY=sk-***
ELEVENLABS_API_KEY=***

# Stripe
STRIPE_SECRET_KEY=sk_***
STRIPE_WEBHOOK_SECRET=whsec_***
```

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

# Build for production
cd client && npm run build
```

### Deployment
Push to `main` branch triggers automatic Vercel deployment.

---

## Recent Updates (December 2025)

### Phone Input with Country Code (Dec 20, 2025)
- Added PhoneInput component with 30+ countries
- Country selector with flags and dial codes
- Per-country phone validation patterns
- Real-time validation indicators
- Integrated in onboarding Step 2

### UX Improvements (Dec 17, 2025)
- Fixed text visibility on dark backgrounds
- Fixed plan limit detection in onboarding
- Fixed leading zeros in table inputs
- Updated Python version for Vercel deployment

---

## Contact

- **Email**: stefanogebara@gmail.com
- **Response Time**: Within 24 hours

---

**Last Updated**: December 20, 2025
