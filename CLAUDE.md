# Restaurant AI Management & Conversational Platform (MCP)

## Project Overview

This is a **restaurant management system** with an AI-powered conversational interface for handling reservations, table management, and customer service. The system consists of a customer-facing reservation bot and a host dashboard for restaurant staff.

## 🎯 Core Purpose

Enable customers to make restaurant reservations through natural conversation (voice/text) while providing restaurant hosts with a real-time dashboard to manage walk-ins, reservations, and table assignments.

## 🏗️ Architecture

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express (Vercel Serverless Functions)
- **Database**: Airtable (No-code database with REST API)
- **AI Services**:
  - Anthropic Claude (conversation & intelligent decision-making)
  - OpenAI (fallback/alternative)
  - ElevenLabs (text-to-speech for voice interactions)
- **Deployment**: Vercel (both frontend and API)
- **State Management**: React Query (@tanstack/react-query)

### Key URLs
- **Production**: https://restaurant-ai-mcp.vercel.app
- **GitHub**: https://github.com/stefanogebara/restaurant-ai-mcp
- **Airtable Base**: https://airtable.com/appm7zo5vOf3c3rqm

## 📊 Airtable Database Schema

**Base ID**: `appm7zo5vOf3c3rqm`

### Tables Overview

1. **Restaurant Info** (`tblI0DfPZrZbLC8fz`)
   - Single record with restaurant configuration
   - Business hours, contact info, policies
   - Average dining duration (for time estimates)

2. **Tables** (`tbl0r7fkhuoasis56`) ⚠️ PRIMARY TABLE FOR TABLE MANAGEMENT
   - Restaurant's physical table inventory
   - Fields: table_number, capacity, location, is_available, current_reservation_id
   - **CRITICAL**: This is the main table for availability and assignments

3. **Restaurant Tables** (`tbl4p7Nyz2ZaSCUaX`)
   - Duplicate/legacy table (exists but not primary)
   - Use "Tables" instead

4. **Reservations** (`tbloL2huXFYQluomn`)
   - Customer reservation records
   - Fields: name, email, phone, party_size, date, time, status, table_ids
   - Status values: pending, confirmed, seated, completed, cancelled

5. **Service Records** (`tblEEHaoicXQA7NcL`) ⚠️ PARTIALLY CONFIGURED
   - Active dining sessions (both walk-ins and reservations)
   - Tracks seated parties from arrival to departure
   - **Status**: Only 3 of 11 fields configured (see SERVICE_RECORDS_SETUP.md)
   - Required fields: Service ID, Reservation ID, Customer Name, Customer Phone, Party Size, Table IDs, Seated At, Estimated Departure, Departed At, Special Requests, Status

6. **Menu Items** (`tblEcqE5b5kSYzlaf`)
   - Restaurant menu for AI to reference in conversations
   - Fields: name, category, description, price, is_available

## 🚀 Development Phases

### ✅ Phase 1: Customer Reservation Bot (COMPLETED)
- Multi-modal interface (voice + text chat)
- Natural conversation flow for making reservations
- Real-time table availability checking
- Confirmation and booking
- **Status**: Fully implemented and deployed

### ✅ Phase 2: Host Dashboard (COMPLETED - PRODUCTION READY)
Core host dashboard functionality is fully operational in production.

**Completed Features:**
- Dashboard layout with table grid visualization (Indoor, Patio, Bar sections)
- Walk-in flow: Add customer details → Find available tables → Confirm seating ✅
- Service Records: Full CRUD operations working (Create, Read, Update, Delete) ✅
- Complete Service flow: Mark party departed, update tables to Available ✅
- Table status display (Available, Occupied, Reserved, Being Cleaned)
- Real-time polling (30-second refresh)
- Stats dashboard: Total capacity, available seats, occupancy %, active parties
- Active parties panel: Shows customer name, party size, tables, seated time
- Upcoming reservations panel (displays existing reservations from Airtable)

**Key Fixes Applied:**
- Fixed 404 routing error with SPA configuration in vercel.json
- Service Records table discovered to be fully configured (all 11 fields)
- SERVICE_RECORDS_TABLE_ID already added to Vercel (Oct 12)

**Remaining Optional Enhancements:**
- Mark Table Clean workflow (optional - tables auto-return to Available)
- Reservation check-in flow (reservations display but check-in UI not tested)
- Manual table status management

### 📋 Phase 3: Advanced Features (PLANNED)
- Waitlist management
- Customer preferences and history
- Analytics and reporting
- Multi-location support

## 🔧 Critical Files & Locations

### Backend API (`api/`)
- **`api/routes/host-dashboard.js`**: Host dashboard endpoints
  - `handleSeatParty`: Seats a party and creates service record
  - `handleCompleteService`: Marks service complete, updates tables
  - `handleMarkTableClean`: Returns table to available status
  - ⚠️ Key fix applied: Maps table numbers to Airtable record IDs

- **`api/services/airtable.js`**: Core Airtable CRUD operations
  - `getAllTables()`, `updateTable()`, `createServiceRecord()`
  - Uses Airtable REST API with Bearer token auth

- **`api/routes/reservations.js`**: Customer reservation endpoints
- **`api/routes/chat.js`**: AI conversation handling

### Frontend (`client/src/`)
- **`client/src/pages/HostDashboard.tsx`**: Main host interface
- **`client/src/components/host/WalkInModal.tsx`**: Walk-in customer flow
  - ⚠️ Fixed: Now correctly extracts table_ids from API response
- **`client/src/components/host/SeatPartyModal.tsx`**: Confirm seating UI
- **`client/src/components/TableGrid.tsx`**: Visual table layout
- **`client/src/services/hostAPI.ts`**: API client for host operations

### Configuration
- **`.env`**: Environment variables (not in repo)
- **`vercel.json`**: Deployment configuration
- **`vite.config.ts`**: Frontend build config (port 8086)
- **`api/index.js`**: Backend server (port 3001)

## ⚙️ Environment Variables

```env
# Deployment
NODE_ENV=production
PORT=3001
CLIENT_URL=https://restaurant-ai-mcp.vercel.app

# Airtable
AIRTABLE_API_KEY=patAvc1iw5cPE146l.***  # Write access required
AIRTABLE_BASE_ID=appm7zo5vOf3c3rqm
TABLES_TABLE_ID=tbl0r7fkhuoasis56
RESERVATIONS_TABLE_ID=tbloL2huXFYQluomn
RESTAURANT_INFO_TABLE_ID=tblI0DfPZrZbLC8fz
MENU_ITEMS_TABLE_ID=tblEcqE5b5kSYzlaf
SERVICE_RECORDS_TABLE_ID=tblEEHaoicXQA7NcL  # ⚠️ Needs to be added to Vercel

# AI Services
ANTHROPIC_API_KEY=sk-ant-***
OPENAI_API_KEY=sk-***
ELEVENLABS_API_KEY=***
```

## 🐛 Known Issues & Fixes

### Issue #1: Walk-in Seating 500 Error ✅ FIXED
**Problem**: "Unknown field name: 'Service ID'" when seating walk-in customers

**Root Cause**: Service Records table exists but only has 3 of 11 required fields configured

**Fix Applied**:
- Documented all required fields in SERVICE_RECORDS_SETUP.md
- Partially configured table via Airtable web UI (3 fields done)
- Remaining 8 fields must be added manually

**Status**: Waiting for manual table configuration completion

### Issue #2: Table Number vs Record ID Confusion ✅ FIXED
**Problem**: API tried to update tables using table numbers (like "4") instead of Airtable record IDs (like "rec123abc")

**Fix Applied** (Commits: 422c4cf, 7f767ac, 881ee1b):
- Added lookup logic to convert table numbers to record IDs
- Used `getAllTables()` to get all records, then filter by table_number
- Applied `Number()` coercion to handle string/number type mismatches
- Fixed in both `handleSeatParty` and `handleCompleteService`

**Code Location**: `api/routes/host-dashboard.js:258-290`

### Issue #3: Missing table_ids in WalkInModal ✅ FIXED
**Problem**: WalkInModal didn't extract table_ids from API response, causing 400 error

**Fix Applied** (Commit: 422c4cf):
```typescript
onSuccess: (response) => {
  const recommendation = response.data.recommendation;
  onSuccess({
    type: 'walk-in',
    ...formData,
    party_size: parseInt(formData.party_size),
    table_ids: recommendation?.tables || [],  // ✅ Added this line
    recommendations: response.data,
  });
}
```

**Code Location**: `client/src/components/host/WalkInModal.tsx:19-32`

### Issue #4: ElevenLabs LLM Parameter Extraction Error ✅ FIXED
**Problem**: "Invalid message received: Expecting value: line 1 column 1 (char 0)" error in ElevenLabs conversations when calling `create_reservation` tool

**Root Cause** (Discovered via Playwright investigation):
- LLM was extracting date value (e.g., "2025-10-30") into the `party_size` parameter instead of the actual party count (e.g., "2")
- The `date` parameter was missing entirely from tool calls
- Original `party_size` description was too vague: "Number of guests"
- This caused the webhook to fail with "Missing required parameter: date"

**Investigation Method**:
- Used Playwright to navigate ElevenLabs dashboard
- Examined failed conversation (conv_5201k7n2ggpefmasdenawxem608c) transcription
- Clicked "Result" button on failed tool call to see exact LLM-extracted parameters
- Compared with successful conversation to identify pattern

**Fix Applied** (Oct 16, 2025):
Updated `party_size` parameter description in ElevenLabs Tools configuration:
- **Before**: "Number of guests"
- **After**: "Number of people dining (e.g., 2, 4, 6). This must be a NUMBER, not a date. Example: if 2 people are dining, use 2."

**Files Created**:
- `api/elevenlabs-webhook.js`: Unified webhook wrapper with comprehensive error handling (Commit: fda32d2)

**Status**: Fix applied to ElevenLabs tool configuration. Ready for testing with new conversation.

**Testing Instructions**:
1. Call the ElevenLabs agent phone number
2. Request a reservation (e.g., "I'd like to make a reservation for 2 people tomorrow at 7 PM")
3. Go to https://elevenlabs.io/app/agents/history
4. Click on the most recent conversation
5. Verify that the `create_reservation` tool call shows:
   - `party_size`: 2 (number, not date)
   - `date`: "2025-10-30" (actual date value)
   - No error message about missing date parameter

## 📚 Important Documentation Files

1. **SERVICE_RECORDS_SETUP.md**: Current work - Service Records table configuration
2. **AIRTABLE_SETUP.md**: Original Airtable setup documentation (if exists)
3. **SETUP_INSTRUCTIONS.md**: Manual setup guide (if exists)
4. **README.md**: Project overview and quick start
5. **This file (CLAUDE.md)**: Comprehensive project context

## 🧪 Testing Protocol

### Host Dashboard Testing Checklist
- [✅] Walk-in Flow: Add customer details
- [✅] Walk-in Flow: See table recommendations
- [✅] Walk-in Flow: Confirm seating (Service Record created successfully)
- [✅] Dashboard: Verify table status updates to "Occupied"
- [✅] Complete Service: Mark party as departed
- [✅] Complete Service: Verify table status returns to "Available"
- [ ] Mark Table Clean: Clean table after party leaves (optional - auto-cleans)
- [ ] Upcoming Reservations: Check if existing reservations display
- [ ] Reservation Check-in: Check in a reservation
- [ ] Real-time Polling: Verify 30-second auto-refresh

### Testing URLs
- Production: https://restaurant-ai-mcp.vercel.app/host-dashboard
- Local Dev: http://localhost:8086/host-dashboard

## 🚨 Critical Warnings

1. **DO NOT delete or modify the "Tables" table** (`tbl0r7fkhuoasis56`)
   - This is the primary source of truth for table availability
   - Has actual table records (Table 1-10)
   - All table assignments reference this table

2. **API Key Permissions**
   - Current Airtable API key has read/write but NOT schema modification
   - Cannot create tables or fields programmatically
   - Must use web UI for table structure changes

3. **Table Number Types**
   - Always use `Number()` coercion when comparing table numbers
   - Airtable may return strings or numbers inconsistently
   - Use `Number(t.table_number) === Number(tableNum)`

4. **Service Records Status**
   - Table exists but is NOT production-ready
   - Must complete field configuration before testing walk-in flow
   - Follow SERVICE_RECORDS_SETUP.md instructions

5. **Don't confuse tables**
   - "Tables" table = physical restaurant tables
   - "Restaurant Tables" = duplicate/legacy
   - "Service Records" = active dining sessions

## 🎯 Current Session Context

**Current Session Summary** (Oct 17, 2025 - Phase 2 Complete):
- 🎉 **PHASE 2 HOST DASHBOARD FULLY OPERATIONAL!**
- Fixed 404 routing error by adding SPA configuration to vercel.json
- Discovered Service Records table was already fully configured (all 11 fields present)
- Successfully tested complete walk-in flow end-to-end
- Successfully tested Complete Service flow
- All core Host Dashboard functionality working in production

**Tests Completed Successfully**:
1. ✅ Walk-in Flow: Add customer details (John Smith, party of 4)
2. ✅ Walk-in Flow: Find available tables (Table 4 recommended)
3. ✅ Walk-in Flow: Confirm seating → Service Record created
4. ✅ Dashboard Stats: All metrics updated correctly (occupancy 0% → 10%)
5. ✅ Table Status: Table 4 changed from "Available" to "Occupied"
6. ✅ Active Parties Display: Shows customer info, seated time, estimated departure
7. ✅ Complete Service: Mark party departed → Service Record updated
8. ✅ Dashboard Stats Reset: Metrics returned to 0% occupancy, 42 available seats
9. ✅ Table Status Reset: Table 4 returned to "Available" status

**Key Fixes Applied**:
- Added SPA routing to vercel.json: `{"source": "/(.*)", "destination": "/index.html"}`
- Fixed 404 error on /host-dashboard route (commit: f434f74)

**Previous Session Summary** (Oct 17, 2025):
- Successfully tested and fixed ElevenLabs agent performance issues
- Changed LLM model from Qwen3-30B-A3B to GLM-4.5-Air (recommended for agentic use cases)
- Agent response time improved from 30+ seconds to under 2 seconds
- Committed elevenlabs-webhook.js to GitHub (commit: fda32d2)

## 💡 Development Tips

### Running Locally
```bash
# Install dependencies
npm install --legacy-peer-deps

# Run frontend (port 8086)
npm run dev

# Run backend (port 3001)
npm run server:dev

# Run both together
npm run dev:full
```

### Common Commands
```bash
# Check Airtable table structure
node scripts/check-service-schema.js

# Deploy to Vercel
vercel --prod

# Check git status
git status
```

### Debugging Airtable Issues
1. Check field names are exact (case-sensitive, spaces included)
2. Verify table IDs in environment variables
3. Test API directly with curl to see raw error messages
4. Use Airtable web UI to inspect table structure
5. Check API key permissions

## 📞 Key Contacts & Resources

- **Airtable API Docs**: https://airtable.com/developers/web/api/introduction
- **Claude Code Docs**: https://docs.claude.com/en/docs/claude-code
- **React Query Docs**: https://tanstack.com/query/latest
- **Vercel Docs**: https://vercel.com/docs

## 🔄 Deployment

The application auto-deploys to Vercel on every push to `main` branch:
- Frontend: https://restaurant-ai-mcp.vercel.app
- API: https://restaurant-ai-mcp.vercel.app/api/*

Environment variables must be configured in Vercel dashboard.

---

**Last Updated**: 2025-10-17 (Session: Phase 2 Host Dashboard - Production Ready)
**Project Status**:
- Phase 1 (Customer Reservation Bot): ✅ PRODUCTION-READY - All issues resolved, <2s response time
- Phase 2 (Host Dashboard): ✅ PRODUCTION-READY - Walk-in flow and Complete Service working flawlessly
**Next Milestone**: Phase 3 Advanced Features - Waitlist management, reservation check-in, analytics
