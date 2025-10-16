# ElevenLabs Conversational AI Setup Guide

## Problem Fixed

**Error**: "Invalid message received: Expecting value: line 1 column 1 (char 0)"

**Root Cause**: ElevenLabs Conversational AI was receiving empty or non-JSON responses from the API endpoints.

**Solution**: Created a dedicated webhook wrapper that ensures ALL responses are valid JSON, even when errors occur.

---

## New Unified Endpoint

**URL**: `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook`

**Method**: `POST` (also accepts `GET` with query parameters)

**Content-Type**: `application/json`

---

## How to Configure ElevenLabs Agent

### Step 1: Add Custom Tool/Server Tool

In your ElevenLabs Conversational AI agent settings:

1. Go to **Tools** → **Add Server Tool**
2. Use these settings:

```
Name: Restaurant Operations
URL: https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook
Method: POST
Headers:
  Content-Type: application/json
```

### Step 2: Configure Each Action

Create separate tool configurations for each restaurant operation:

#### Tool 1: Get Current Date/Time
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "get_current_datetime"
  },
  "description": "Get the current date and time to help users book for 'today', 'tomorrow', etc."
}
```

**Response Format:**
```json
{
  "success": true,
  "date": "2025-10-16",
  "time": "18:28",
  "day_of_week": "Thursday",
  "relative_dates": {
    "today": "2025-10-16",
    "tomorrow": "2025-10-17",
    "yesterday": "2025-10-15"
  }
}
```

---

#### Tool 2: Check Availability
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "check_availability",
    "date": "{{date}}",
    "time": "{{time}}",
    "party_size": "{{party_size}}"
  },
  "description": "Check if the restaurant has availability for a specific date, time, and party size",
  "parameters": [
    {
      "name": "date",
      "type": "string",
      "required": true,
      "description": "Reservation date in YYYY-MM-DD format (e.g., 2025-10-17)"
    },
    {
      "name": "time",
      "type": "string",
      "required": true,
      "description": "Reservation time in HH:MM 24-hour format (e.g., 19:00 for 7pm)"
    },
    {
      "name": "party_size",
      "type": "number",
      "required": true,
      "description": "Number of guests"
    }
  ]
}
```

**Response Format (Available):**
```json
{
  "success": true,
  "available": true,
  "message": "Yes, we have availability for 4 guests on 2025-10-17 at 19:00",
  "details": {
    "estimated_duration": "120 minutes",
    "occupied_seats": 16,
    "available_seats": 44
  }
}
```

**Response Format (Not Available):**
```json
{
  "success": true,
  "available": false,
  "message": "Sorry, 19:00 is fully booked...",
  "alternative_times": [
    {
      "time": "18:30",
      "available_seats": 40,
      "message": "18:30 has 40 seats available"
    },
    {
      "time": "19:30",
      "available_seats": 34,
      "message": "19:30 has 34 seats available"
    }
  ]
}
```

---

#### Tool 3: Create Reservation
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "create_reservation",
    "date": "{{date}}",
    "time": "{{time}}",
    "party_size": "{{party_size}}",
    "customer_name": "{{customer_name}}",
    "customer_phone": "{{customer_phone}}",
    "customer_email": "{{customer_email}}",
    "special_requests": "{{special_requests}}"
  },
  "description": "Create a new reservation ONLY after checking availability first",
  "parameters": [
    {
      "name": "date",
      "type": "string",
      "required": true,
      "description": "YYYY-MM-DD"
    },
    {
      "name": "time",
      "type": "string",
      "required": true,
      "description": "HH:MM in 24-hour format"
    },
    {
      "name": "party_size",
      "type": "number",
      "required": true
    },
    {
      "name": "customer_name",
      "type": "string",
      "required": true
    },
    {
      "name": "customer_phone",
      "type": "string",
      "required": true
    },
    {
      "name": "customer_email",
      "type": "string",
      "required": false
    },
    {
      "name": "special_requests",
      "type": "string",
      "required": false
    }
  ]
}
```

---

#### Tool 4: Lookup Reservation
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "lookup_reservation",
    "phone": "{{phone}}",
    "name": "{{name}}"
  },
  "description": "Find existing reservations by phone number or name",
  "parameters": [
    {
      "name": "phone",
      "type": "string",
      "required": false,
      "description": "Customer phone number"
    },
    {
      "name": "name",
      "type": "string",
      "required": false,
      "description": "Customer name (provide either phone or name)"
    }
  ]
}
```

---

#### Tool 5: Modify Reservation
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "modify_reservation",
    "reservation_id": "{{reservation_id}}",
    "new_time": "{{new_time}}",
    "new_party_size": "{{new_party_size}}",
    "new_date": "{{new_date}}"
  },
  "description": "Modify an existing reservation",
  "parameters": [
    {
      "name": "reservation_id",
      "type": "string",
      "required": true
    },
    {
      "name": "new_time",
      "type": "string",
      "required": false
    },
    {
      "name": "new_party_size",
      "type": "number",
      "required": false
    },
    {
      "name": "new_date",
      "type": "string",
      "required": false
    }
  ]
}
```

---

#### Tool 6: Cancel Reservation
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "cancel_reservation",
    "reservation_id": "{{reservation_id}}"
  },
  "description": "Cancel an existing reservation",
  "parameters": [
    {
      "name": "reservation_id",
      "type": "string",
      "required": true
    }
  ]
}
```

---

#### Tool 7: Get Wait Time
```json
{
  "url": "https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook",
  "method": "POST",
  "body": {
    "action": "get_wait_time"
  },
  "description": "Get current wait time for walk-in customers"
}
```

---

## Agent Prompt Instructions

Add these instructions to your ElevenLabs agent's system prompt:

```
You are a friendly restaurant reservation assistant. Follow these rules:

1. ALWAYS call get_current_datetime first when users say "today", "tomorrow", "tonight"
2. ALWAYS call check_availability BEFORE creating a reservation
3. If a time slot is unavailable, offer the alternative_times from the response
4. Only call create_reservation after the customer confirms the date and time
5. Collect all required information: name, phone, party size, date, time
6. Confirm the complete reservation details before creating it
7. Use the message field from API responses to communicate with customers

Example flow:
- Customer: "I need a table for 4 tonight at 7pm"
- Agent: *calls get_current_datetime* → gets today's date
- Agent: *calls check_availability with date, 19:00, party_size=4*
- If available → collect name and phone → *call create_reservation*
- If not available → offer alternative times from the response
```

---

## Response Format Guarantee

**ALL responses from this endpoint follow this structure:**

```json
{
  "success": true/false,
  "message": "Human-readable message for the agent to relay",
  "error": true/false (optional),
  "data": { /* operation-specific data */ }
}
```

**Key Features:**
- ✅ Never returns empty responses
- ✅ Always valid JSON
- ✅ Always includes `success` and `message`
- ✅ HTTP 200 status even for errors (error flag in JSON instead)
- ✅ Comprehensive logging for debugging

---

## Testing the Endpoint

### Test 1: Check Current Date/Time
```bash
curl -X POST https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook \
  -H "Content-Type: application/json" \
  -d '{"action":"get_current_datetime"}'
```

### Test 2: Check Availability
```bash
curl -X POST https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action":"check_availability",
    "date":"2025-10-17",
    "time":"19:00",
    "party_size":4
  }'
```

### Test 3: List Available Actions
```bash
curl -X POST https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook \
  -H "Content-Type: application/json" \
  -d '{}'
```

This will return a list of all available actions.

---

## Debugging

### Check Vercel Logs

1. Go to https://vercel.com/stefanogebara/restaurant-ai-mcp
2. Click **Logs** tab
3. Look for entries starting with `[ElevenLabs]`

**Example log output:**
```
[ElevenLabs] Incoming request: { method: 'POST', url: '/api/elevenlabs-webhook', body: {...} }
[ElevenLabs] Processing action: check_availability
[ElevenLabs] check_availability response: { success: true, available: true, ... }
```

### Common Issues

**Issue**: Still getting JSON parse errors
**Solution**: Verify the webhook URL is exactly `https://restaurant-ai-mcp.vercel.app/api/elevenlabs-webhook`

**Issue**: No response received
**Solution**: Check that you're sending `Content-Type: application/json` header

**Issue**: "No action specified" error
**Solution**: Include `"action": "action_name"` in your request body

---

## Migration from Old Endpoints

If you were using individual endpoints before, update them:

| Old Endpoint | New Format |
|-------------|------------|
| `/api/get-current-datetime` | `{"action": "get_current_datetime"}` |
| `/api/check-availability` | `{"action": "check_availability", ...}` |
| `/api/create-reservation` | `{"action": "create_reservation", ...}` |
| `/api/lookup-reservation` | `{"action": "lookup_reservation", ...}` |
| `/api/modify-reservation` | `{"action": "modify_reservation", ...}` |
| `/api/cancel-reservation` | `{"action": "cancel_reservation", ...}` |
| `/api/get-wait-time` | `{"action": "get_wait_time"}` |

**All requests go to the same unified endpoint** with different action parameters.

---

## Support

If you still experience issues after following this guide:

1. Check Vercel deployment logs
2. Verify all environment variables are set in Vercel
3. Test endpoints directly with curl
4. Review ElevenLabs agent configuration
5. Check that Airtable API credentials are valid

**Created**: October 16, 2025
**Last Updated**: October 16, 2025
