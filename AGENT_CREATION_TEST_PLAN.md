# Agent Creation Testing Plan

**Date**: 2025-11-23
**Status**: Ready for Testing
**Related**: MVP_PLAN_SIMPLIFICATION.md Phase 2

## Test Overview

Testing per-restaurant ElevenLabs agent creation system to ensure:
1. Each restaurant gets a unique agent ID
2. Agents are configured with correct voice and language
3. Agents have custom prompts with restaurant details
4. Database correctly stores agent information

---

## Pre-Test Setup

### Current State
- ✅ Database migrations applied (agent columns added)
- ✅ API endpoint created: `/api/routes/elevenlabs-agent-create`
- ✅ Onboarding integration complete
- ✅ Restaurant in database: "Test Restaurant" (ID: eff44719-0213-4529-be19-48edaafac9e1)

### Environment Variables Required
```env
ELEVENLABS_API_KEY=your_key_here
CLIENT_URL=https://restaurant-ai-mcp.vercel.app
SUPABASE_URL=https://lurebwaudisfilhuhmnj.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Test 1: Direct API Endpoint Test

### Test French Restaurant (La Brasserie)

**Endpoint**: `POST /api/routes/elevenlabs-agent-create`

**Request Body**:
```json
{
  "restaurant_id": "REST-TEST-FR-001",
  "restaurant_name": "La Brasserie Parisienne",
  "voice_id": "pqHfZKP75CvOlQylNhV4",
  "language": "fr",
  "business_hours": {
    "monday": { "isOpen": true, "open": "12:00", "close": "22:00" },
    "tuesday": { "isOpen": true, "open": "12:00", "close": "22:00" },
    "wednesday": { "isOpen": true, "open": "12:00", "close": "22:00" },
    "thursday": { "isOpen": true, "open": "12:00", "close": "22:00" },
    "friday": { "isOpen": true, "open": "12:00", "close": "23:00" },
    "saturday": { "isOpen": true, "open": "12:00", "close": "23:00" },
    "sunday": { "isOpen": false }
  },
  "phone": "+33 1 42 96 65 05",
  "address": "Paris, France"
}
```

**Expected Response**:
```json
{
  "success": true,
  "agent_id": "agent_xyz123...",
  "agent_url": "https://elevenlabs.io/app/conversational-ai/agent_xyz123...",
  "voice_id": "pqHfZKP75CvOlQylNhV4",
  "language": "fr"
}
```

**Verification**:
- [ ] Agent created in ElevenLabs dashboard
- [ ] Agent greeting in French: "Merci d'avoir appelé La Brasserie Parisienne..."
- [ ] Agent system prompt includes business hours
- [ ] Agent uses voice "Lucie" (French female)

**Test Command**:
```bash
curl -X POST http://localhost:3001/api/routes/elevenlabs-agent-create \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": "REST-TEST-FR-001",
    "restaurant_name": "La Brasserie Parisienne",
    "voice_id": "pqHfZKP75CvOlQylNhV4",
    "language": "fr",
    "business_hours": {},
    "phone": "+33 1 42 96 65 05",
    "address": "Paris, France"
  }'
```

---

## Test 2: Italian Restaurant (Bella Italia)

**Request Body**:
```json
{
  "restaurant_id": "REST-TEST-IT-001",
  "restaurant_name": "Bella Italia Ristorante",
  "voice_id": "9F4C8ztpNUbEaGsVaHRJ",
  "language": "it",
  "business_hours": {},
  "phone": "+39 06 6869 3287",
  "address": "Rome, Italy"
}
```

**Expected Greeting**: "Grazie per aver chiamato Bella Italia Ristorante. Come posso aiutarla oggi?"

**Verification**:
- [ ] Agent speaks Italian
- [ ] Uses voice "Anna" (Italian female)
- [ ] Unique agent_id (different from French restaurant)

---

## Test 3: Full Onboarding Flow Test

### Prerequisites
1. Have Stripe test card ready: `4242 4242 4242 4242`
2. Use test email: `test+france@restaurant-ai-mcp.com`

### Steps
1. Navigate to https://restaurant-ai-mcp.vercel.app
2. Click "Get Started" → Choose "Professional Plan"
3. Complete onboarding with French restaurant:
   - Restaurant Name: "Le Petit Bistro"
   - Country: France
   - Voice Selection: Should auto-show French voices (Lucie or Marcel)
   - Select voice and preview
4. Complete payment with Stripe test card
5. Finish onboarding

### Expected Results
- [ ] Onboarding completes successfully
- [ ] Console shows: "[Onboarding] ✅ ElevenLabs agent created: agent_xyz..."
- [ ] Database updated with agent_id

**Database Verification Query**:
```sql
SELECT
  restaurant_name,
  elevenlabs_agent_id,
  agent_voice_id,
  agent_language,
  agent_created_at
FROM restaurant_info
WHERE metric_profile->>'restaurant_name' ILIKE '%Petit Bistro%';
```

---

## Test 4: Multi-Restaurant Agent Uniqueness

### Create 3 Restaurants Sequentially

1. **Spain (Spanish)**: "El Matador" - Voice: Sofia (es)
2. **France (French)**: "Chez Pierre" - Voice: Lucie (fr)
3. **Italy (Italian)**: "Trattoria Roma" - Voice: Anna (it)

### Verification Query
```sql
SELECT
  restaurant_name,
  elevenlabs_agent_id,
  agent_language,
  agent_voice_id,
  agent_created_at
FROM restaurant_info
WHERE elevenlabs_agent_id IS NOT NULL
ORDER BY agent_created_at DESC;
```

**Expected Results**:
- [ ] 3 different agent_id values
- [ ] Each has correct language (es, fr, it)
- [ ] Each has correct voice_id
- [ ] All agent_created_at timestamps within test window

---

## Test 5: Agent Conversation Logging

### Test Conversation Flow
1. Call one of the created agents
2. Make a test reservation
3. Check agent_conversations table

**Verification Query**:
```sql
SELECT
  ac.conversation_id,
  ac.agent_id,
  ac.restaurant_info_id,
  ri.restaurant_name,
  ac.language,
  ac.outcome,
  ac.started_at
FROM agent_conversations ac
LEFT JOIN restaurant_info ri ON ac.restaurant_info_id = ri.id
WHERE ac.agent_id IS NOT NULL
ORDER BY ac.started_at DESC
LIMIT 10;
```

**Expected Results**:
- [ ] Conversation logged with restaurant_info_id
- [ ] agent_id matches the restaurant's agent
- [ ] Language matches restaurant language

---

## Test 6: Error Handling

### Test Missing Required Fields
```bash
curl -X POST http://localhost:3001/api/routes/elevenlabs-agent-create \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_name": "Test Restaurant"
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Missing required fields: restaurant_id, restaurant_name, voice_id"
}
```

### Test Invalid ElevenLabs API Key
1. Temporarily set wrong `ELEVENLABS_API_KEY`
2. Try creating agent
3. Verify graceful error handling

**Expected**:
- [ ] Returns 500 error
- [ ] Error logged: "Failed to create agent"
- [ ] Onboarding continues (doesn't crash)

---

## Test 7: Existing Restaurant Update

### Scenario: Restaurant Already Has Agent

1. Get existing restaurant with agent_id
2. Re-run onboarding for same restaurant
3. Verify behavior

**Expected Behavior**:
- [ ] Either creates new agent (replace old)
- [ ] Or updates existing agent
- [ ] No duplicate agents created

---

## Post-Test Verification Checklist

### Database Checks
- [ ] All test restaurants have `elevenlabs_agent_id` populated
- [ ] All have `agent_voice_id` matching selected voice
- [ ] All have `agent_language` matching country
- [ ] All have `agent_created_at` timestamp

### ElevenLabs Dashboard Checks
- [ ] Visit https://elevenlabs.io/app/conversational-ai
- [ ] Verify all test agents appear
- [ ] Each agent has correct restaurant name
- [ ] Each agent has correct voice assigned
- [ ] System prompts include business hours

### API Endpoint Checks
- [ ] `/api/routes/elevenlabs-agent-create` returns 200 on valid request
- [ ] Returns 400 on missing fields
- [ ] Returns 500 on ElevenLabs API errors
- [ ] CORS headers allow cross-origin requests

---

## Cleanup After Testing

```sql
-- Remove test restaurants
DELETE FROM restaurant_info
WHERE restaurant_name IN (
  'La Brasserie Parisienne',
  'Bella Italia Ristorante',
  'Le Petit Bistro',
  'El Matador',
  'Chez Pierre',
  'Trattoria Roma'
);

-- Remove test conversations
DELETE FROM agent_conversations
WHERE agent_id LIKE 'agent_%test%';
```

**ElevenLabs Cleanup**:
- Go to https://elevenlabs.io/app/conversational-ai
- Manually delete test agents (or mark as inactive)

---

## Success Criteria

✅ **PASS** if:
1. All 3 test restaurants get unique agent IDs
2. Agents speak correct languages (es, fr, it)
3. Agents know their restaurant names
4. Database correctly stores all agent metadata
5. Conversation logging includes restaurant_info_id and agent_id
6. Error handling works gracefully

❌ **FAIL** if:
1. Multiple restaurants share same agent_id
2. Agent language doesn't match restaurant country
3. Database not updated with agent details
4. Onboarding crashes on agent creation failure
5. Agent prompts missing restaurant information

---

## Test Results Log

### Test 1: French Restaurant
- **Date**: _____
- **Status**: ⏳ Pending
- **Agent ID**: _____
- **Notes**: _____

### Test 2: Italian Restaurant
- **Date**: _____
- **Status**: ⏳ Pending
- **Agent ID**: _____
- **Notes**: _____

### Test 3: Full Onboarding Flow
- **Date**: _____
- **Status**: ⏳ Pending
- **Agent ID**: _____
- **Notes**: _____

---

**Last Updated**: 2025-11-23
**Next Review**: After first production test
