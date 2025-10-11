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
- **Database**: Airtable
- **Voice AI**: ElevenLabs Conversational AI
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

- `AIRTABLE_API_KEY` - Your Airtable API key
- `AIRTABLE_BASE_ID` - Restaurant database base ID
- `RESERVATIONS_TABLE_ID` - Reservations table ID
- `RESTAURANT_INFO_TABLE_ID` - Restaurant info table ID

## Database Schema

See your Airtable base for complete schema details.

## Created

October 2025 - AI Restaurant Receptionist System
