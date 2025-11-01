# Restaurant AI Phone Receptionist - MCP Server

AI-powered phone receptionist system for restaurants that handles reservations 24/7 through ElevenLabs voice agents.

## Features

- ✅ Check availability in real-time
- ✅ Create reservations automatically
- ✅ Lookup existing reservations
- ✅ Modify reservation details
- ✅ Cancel reservations
- ✅ Provide wait time estimates

## API Endpoints

All endpoints accept both GET and POST requests with JSON body or query parameters.

### 1. Check Availability
**POST** `/check-availability`
```json
{
  "date": "2025-10-15",
  "time": "19:00",
  "party_size": 4
}
```

### 2. Create Reservation
**POST** `/create-reservation`
```json
{
  "date": "2025-10-15",
  "time": "19:00",
  "party_size": 4,
  "customer_name": "John Smith",
  "customer_phone": "+15551234567",
  "customer_email": "john@example.com",
  "special_requests": "Window seat"
}
```

### 3. Lookup Reservation
**POST** `/lookup-reservation`
```json
{
  "phone": "555-1234"
}
```
OR
```json
{
  "name": "Smith"
}
```

### 4. Modify Reservation
**POST** `/modify-reservation`
```json
{
  "reservation_id": "RES-20251015-1234",
  "new_time": "20:00",
  "new_party_size": 6
}
```

### 5. Cancel Reservation
**POST** `/cancel-reservation`
```json
{
  "reservation_id": "RES-20251015-1234"
}
```

### 6. Get Wait Time
**POST** `/get-wait-time`
```json
{}
```

## Tech Stack

- **Runtime**: Node.js (Vercel Serverless Functions)
- **Database**: Supabase PostgreSQL (migrated from Airtable on Nov 1, 2025)
- **Voice AI**: ElevenLabs Conversational AI
- **Frontend**: React 18 + TypeScript + Vite
- **Deployment**: Vercel

## Deployment

```bash
# Install dependencies
npm install

# Deploy to Vercel
vercel --prod
```

## Environment Variables

Set these in Vercel dashboard or `.env`:

### Required (Supabase PostgreSQL)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous/public key
- `SUPABASE_SERVICE_ROLE_KEY` - (Optional) For admin operations

### AI Services
- `ANTHROPIC_API_KEY` - Claude AI API key
- `OPENAI_API_KEY` - OpenAI API key (fallback)
- `ELEVENLABS_API_KEY` - ElevenLabs voice AI key

### Legacy (Deprecated Nov 1, 2025)
- `AIRTABLE_API_KEY` - No longer used
- `AIRTABLE_BASE_ID` - No longer used
- `RESERVATIONS_TABLE_ID` - No longer used
- `RESTAURANT_INFO_TABLE_ID` - No longer used

## Database Schema

### Supabase PostgreSQL (8 Tables)

**Project URL**: `https://lurebwaudisfilhuhmnj.supabase.co`

1. **restaurant_info** - Restaurant configuration
2. **tables** - Physical table inventory
3. **reservations** - Customer reservations
4. **service_records** - Active dining sessions
5. **waitlist** - Waitlist management
6. **customer_history** - Historical behavior tracking
7. **ml_interventions** - ML ROI tracking (Target: 300-500% ROI)
8. **subscriptions** - Stripe subscription tracking

See `CLAUDE.md` for detailed schema documentation or visit the [Supabase Dashboard](https://app.supabase.com/project/lurebwaudisfilhuhmnj).

## Created

October 2025 - AI Restaurant Receptionist System
