# Multi-Restaurant Phone Routing System

## Overview

This system allows multiple restaurants to each have their own AI voice agent with custom configuration (voice, language, greeting, hours, etc.).

## How It Works

### 1. Phone Number Assignment

Each restaurant gets a unique phone number during onboarding:
- **El Restaurante Español**: `+34 93 123 4567`
- **La Tapería Española**: `+34 91 555 1234`
- **Das Schnitzelhaus**: `+49 89 1234 5678`

These numbers are stored in the `restaurant_config.phone` column.

### 2. Call Flow

```
Customer calls +34 93 123 4567
   ↓
ElevenLabs Conversational AI receives the call
   ↓
ElevenLabs makes webhook call to YOUR API:
   POST /api/elevenlabs-webhook?action=check_availability
   Headers: {
     "X-Called-Number": "+34 93 123 4567",  // or similar header
     "X-Caller-Number": "+34 666 777 888"    // customer's phone
   }
   Body: { date, time, party_size }
   ↓
Your webhook looks up restaurant by phone:
   getRestaurantByPhone("+34 93 123 4567")
   ↓
Returns: El Restaurante Español configuration:
   - voice_id: "0afd8614-31cb-438c-8a46-80650e19c29c" (Teresa)
   - greeting: "¡Gracias por llamar a El Restaurante Español!"
   - language: "es-ES"
   - business_hours, tables, etc.
   ↓
Agent uses restaurant-specific config to respond
```

### 3. ElevenLabs Configuration

You need to configure ElevenLabs to:

1. **Create a phone number for each restaurant** (or use their existing numbers)
2. **Configure webhook URL** for each number: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook`
3. **Set custom headers** to include the called number

### 4. Webhook Headers from ElevenLabs

ElevenLabs typically sends these headers (check their docs):
```json
{
  "X-ElevenLabs-Agent-ID": "agent-123",
  "X-ElevenLabs-Conversation-ID": "conv-456",
  "X-Called-Number": "+34 93 123 4567",    // Which number was dialed
  "X-Caller-Number": "+34 666 777 888",     // Who is calling
  "Content-Type": "application/json"
}
```

## Implementation Files

### 1. `api/_lib/restaurant-loader.js` ✅ CREATED
Restaurant configuration loader by phone number.

**Functions:**
- `getRestaurantByPhone(phoneNumber)` - Look up restaurant by phone
- `getRestaurantById(restaurantId)` - Look up by UUID
- `getAllRestaurants()` - List all active restaurants

### 2. `api/elevenlabs-webhook.js` ⚠️ NEEDS UPDATE
Current webhook doesn't load restaurant-specific config.

**Required Changes:**
```javascript
// ADD at the top of webhook handler:
const { getRestaurantByPhone } = require('./_lib/restaurant-loader');

// EXTRACT called number from request:
const calledNumber = req.headers['x-called-number'] || req.query.phone_number;

// LOAD restaurant configuration:
const restaurant = await getRestaurantByPhone(calledNumber);

// USE restaurant config in responses:
// - restaurant.greeting_message for intro
// - restaurant.language for responses
// - restaurant.business_hours for availability
// - restaurant.table_configuration for capacity
```

### 3. Database Schema
The `restaurant_config` table already has all required fields:
- ✅ `phone` - Restaurant phone number (UNIQUE)
- ✅ `voice_id` - Cartesia voice ID
- ✅ `ai_config` - { language, greeting_message, farewell_message }
- ✅ `business_hours` - JSON with hours per day
- ✅ `table_configuration` - JSON with tables/areas
- ✅ `reservation_settings` - Booking rules

## Testing the System

### Test 1: Spanish Restaurant Call
```bash
curl -X POST https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook \
  -H "Content-Type: application/json" \
  -H "X-Called-Number: +34 93 123 4567" \
  -d '{
    "action": "check_availability",
    "date": "2025-11-20",
    "time": "20:00",
    "party_size": 4
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "available": true,
  "message": "Sí, tenemos disponibilidad para 4 personas el 2025-11-20 a las 20:00",
  "restaurant": {
    "name": "El Restaurante Español",
    "language": "es-ES",
    "voice_id": "0afd8614-31cb-438c-8a46-80650e19c29c"
  }
}
```

### Test 2: German Restaurant Call
```bash
curl -X POST https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook \
  -H "X-Called-Number: +49 89 1234 5678" \
  -d '{
    "action": "check_availability",
    "date": "2025-11-20",
    "time": "19:00",
    "party_size": 2
  }'
```

**Expected Response:**
```json
{
  "message": "Ja, wir haben Verfügbarkeit für 2 Personen...",
  "restaurant": {
    "name": "Das Schnitzelhaus",
    "language": "de-DE"
  }
}
```

## Next Steps

1. ✅ Create `restaurant-loader.js` - DONE
2. ⏳ Update `elevenlabs-webhook.js` to use restaurant loader
3. ⏳ Configure ElevenLabs phone numbers
4. ⏳ Test with multiple restaurants
5. ⏳ Add error handling for unknown numbers

## ElevenLabs Setup (Per Restaurant)

For each restaurant in your system:

1. **Purchase/Configure Phone Number** in ElevenLabs dashboard
2. **Create Conversational AI Agent** with:
   - Agent Name: "{Restaurant Name} - Reservations"
   - Voice: Use the Cartesia voice_id from database
   - Language: Match restaurant's language
   - System Prompt: Include restaurant-specific greeting

3. **Configure Tools/Functions:**
   - `check_availability` → `/api/elevenlabs-webhook?action=check_availability`
   - `create_reservation` → `/api/elevenlabs-webhook?action=create_reservation`
   - `lookup_reservation` → `/api/elevenlabs-webhook?action=lookup_reservation`
   - `cancel_reservation` → `/api/elevenlabs-webhook?action=cancel_reservation`

4. **Set Webhook Headers:**
   - Add custom header: `X-Called-Number: {restaurant phone}`
   - Or configure ElevenLabs to auto-send called number

## Alternative Approach: URL Parameters

If ElevenLabs doesn't support custom headers, you can use URL parameters:

```
/api/elevenlabs-webhook?restaurant_id={uuid}&action=check_availability
```

Then load restaurant by ID instead of phone number.

## Monitoring & Logs

All restaurant lookups are logged:
```
[RestaurantLoader] Looking up restaurant for phone: +34 93 123 4567
[RestaurantLoader] Found restaurant: El Restaurante Español (Barcelona, Spain)
```

Monitor these logs to ensure routing is working correctly.
