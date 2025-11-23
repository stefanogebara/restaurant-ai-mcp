# MVP Plan Simplification - Remove Enterprise & Add Per-Restaurant Agents

## Current State Analysis

### Pricing Tiers (Before):
1. **Basic**: €49.99/month
2. **Professional**: €99.99/month
3. **Enterprise**: €199.99/month ← TO BE REMOVED

### Critical Gap Discovered:
**❌ NO PER-RESTAURANT AGENT CREATION EXISTS**

Currently, all restaurants share a single ElevenLabs agent ID from environment variables:
- `VITE_ELEVENLABS_AGENT_ID=your_agent_id_here`
- This means every restaurant gets the same agent configuration
- Agent doesn't know which restaurant it's serving
- Can't customize prompts per restaurant

---

## Phase 1: Remove Enterprise Plan

### Files to Update (7 files):

#### 1. `client/src/config/planFeatures.ts`
**Changes:**
- Remove `enterprise` from `PlanType` type (line 6)
- Remove `enterprise` object from `PLAN_FEATURES` (lines 129-167)
- Remove `enterprise` from `PLAN_PRICES` (line 213)
- Remove `enterprise` from `PLAN_NAMES` (line 219)
- Remove `enterprise` from `PLAN_DESCRIPTIONS` (line 227)
- Remove `enterprise` from `INTERVENTION_LIMITS` (line 236)

#### 2. `client/src/landing/data/demoData.ts`
**Changes:**
- Remove Enterprise tier object from `PRICING_TIERS` array (lines 197-214)
- Keep only Basic and Professional

#### 3. `client/src/landing/components/PricingSection.tsx`
**Changes:**
- No code changes needed (uses `PRICING_TIERS` array)
- Will automatically show only 2 plans after removing from data file

#### 4. `api/routes/subscription.js`
**Changes:**
- Remove Enterprise plan validation
- Update plan type checks

#### 5. `api/services/subscription-limits.js`
**Changes:**
- Remove Enterprise tier limits
- Update any Enterprise-specific logic

#### 6. `database/migrations/` (if needed)
**Changes:**
- Add migration to update existing Enterprise subscriptions to Professional
- Update subscription enum in Supabase

#### 7. Stripe Dashboard (Manual)
**Action Required:**
- Archive or deactivate `price_1SMyHPKf4yCMjmH5t2Jig9cU` (Enterprise price)
- Do NOT delete (preserve historical data)

---

## Phase 2: Implement Per-Restaurant Agent Creation

### Architecture Design:

```
Restaurant Onboarding (Step 7 - Completion)
  ↓
Create ElevenLabs Agent via API
  ↓
Store agent_id in restaurant_info table
  ↓
Configure agent with restaurant details:
  - Restaurant name
  - Business hours
  - Table capacity
  - Voice selection (from Step 2.5)
  - Language (from country selection)
  - Custom greeting
  ↓
Provision phone number (optional)
  ↓
Link phone number to agent_id
```

### Database Changes:

#### Add to `restaurant_info` table:
```sql
ALTER TABLE restaurant_info
ADD COLUMN elevenlabs_agent_id TEXT,
ADD COLUMN elevenlabs_phone_number TEXT,
ADD COLUMN agent_created_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN agent_voice_id TEXT,
ADD COLUMN agent_language TEXT DEFAULT 'en';
```

### New API Endpoints:

#### 1. `api/elevenlabs-agent-create.js`
```javascript
/**
 * POST /api/elevenlabs-agent-create
 *
 * Creates a new ElevenLabs conversational agent for a restaurant
 *
 * Request Body:
 * {
 *   restaurant_id: string,
 *   restaurant_name: string,
 *   voice_id: string,
 *   language: string,
 *   business_hours: object,
 *   custom_greeting?: string
 * }
 *
 * Response:
 * {
 *   success: true,
 *   agent_id: string,
 *   agent_url: string
 * }
 */
```

**Implementation Steps:**
1. Call ElevenLabs Agent Creation API
2. Build custom system prompt with restaurant details
3. Configure voice settings
4. Set up conversation tools (create_reservation, check_availability)
5. Store agent_id in Supabase
6. Return agent details

#### 2. Update `api/onboarding/complete.js`
**Add agent creation step:**
```javascript
// After saving restaurant info...
const agentResponse = await fetch('/api/elevenlabs-agent-create', {
  method: 'POST',
  body: JSON.stringify({
    restaurant_id: data.restaurant_id,
    restaurant_name: data.restaurant_name,
    voice_id: data.selected_voice_id,
    language: data.selected_voice_language,
    business_hours: data.business_hours,
    custom_greeting: data.custom_greeting
  })
});

const { agent_id } = await agentResponse.json();

// Update restaurant_info with agent_id
await supabase
  .from('restaurant_info')
  .update({ elevenlabs_agent_id: agent_id })
  .eq('restaurant_id', data.restaurant_id);
```

### ElevenLabs Agent API Integration:

**Endpoint:** `https://api.elevenlabs.io/v1/convai/agents/create`

**Headers:**
```
xi-api-key: {ELEVENLABS_API_KEY}
Content-Type: application/json
```

**Request Body:**
```json
{
  "conversation_config": {
    "agent": {
      "prompt": {
        "prompt": "You are the AI receptionist for {restaurant_name}..."
      },
      "first_message": "Thank you for calling {restaurant_name}. How may I help you today?",
      "language": "en"
    },
    "tts": {
      "voice_id": "{selected_voice_id}"
    }
  },
  "platform_settings": {
    "widget_config": {
      "avatar_url": "https://restaurant-ai-mcp.vercel.app/logo.png"
    }
  }
}
```

---

## Phase 3: Update Conversation Logging

### Modify `api/agent-conversations.js`:

**Add restaurant_id tracking:**
```javascript
// When logging conversations, include restaurant_id
await supabase
  .from('agent_conversations')
  .insert({
    conversation_id: conversationId,
    restaurant_id: restaurantId,  // NEW
    agent_id: agentId,             // NEW
    started_at: timestamp,
    language: language,
    outcome: outcome
  });
```

### Database Migration:
```sql
ALTER TABLE agent_conversations
ADD COLUMN restaurant_id TEXT REFERENCES restaurant_info(restaurant_id),
ADD COLUMN agent_id TEXT;

CREATE INDEX idx_agent_conversations_restaurant ON agent_conversations(restaurant_id);
```

---

## Phase 4: Testing Plan

### 1. **Remove Enterprise Plan Test:**
- [ ] Verify only 2 plans show on landing page
- [ ] Test Basic plan subscription flow
- [ ] Test Professional plan subscription flow
- [ ] Confirm Enterprise price archived in Stripe

### 2. **Agent Creation Test:**
- [ ] Complete onboarding for "Test Restaurant France"
  - Select French voice (Lucie or Marcel)
  - Country: France
  - Language: French
- [ ] Verify agent created in ElevenLabs dashboard
- [ ] Check `restaurant_info.elevenlabs_agent_id` populated
- [ ] Test calling the agent
- [ ] Verify agent speaks French
- [ ] Verify agent knows restaurant name and details

### 3. **Multi-Restaurant Test:**
- [ ] Create 2 test restaurants:
  - "Bella Italia" (Italy, Italian voice)
  - "La Brasserie" (France, French voice)
- [ ] Verify each gets unique agent_id
- [ ] Call both agents
- [ ] Confirm they respond in different languages
- [ ] Confirm they know their respective restaurant names

### 4. **Plan Feature Differentiation Test:**

**Basic Plan (€49.99/month):**
- [ ] Can create reservations
- [ ] Has simple dashboard
- [ ] ❌ NO ML Performance tracking
- [ ] ❌ NO Advanced Analytics
- [ ] ❌ NO Customer LTV
- [ ] Limit: 50 reservations/month

**Professional Plan (€99.99/month):**
- [ ] Can create reservations
- [ ] Has full dashboard
- [ ] ✅ ML Performance tracking (limited interventions)
- [ ] ✅ Advanced Analytics
- [ ] ✅ Customer LTV
- [ ] ✅ Waitlist management
- [ ] ✅ SMS notifications
- [ ] Unlimited reservations

---

## Implementation Order:

1. **Day 1**: Remove Enterprise plan (2-3 hours)
2. **Day 2-3**: Implement agent creation API (6-8 hours)
3. **Day 4**: Integrate agent creation into onboarding (4 hours)
4. **Day 5**: Test multi-restaurant setup (3 hours)
5. **Day 6**: Test plan feature differentiation (3 hours)

**Total Estimated Time: 18-21 hours**

---

## Questions to Answer:

### Q1: Should we create agents during onboarding or after payment?
**Recommendation:** After payment confirmation (in `api/onboarding/complete.js`)
- Prevents abandoned onboardings from creating unused agents
- Agent creation costs may apply (check ElevenLabs pricing)

### Q2: What happens to existing restaurants without agents?
**Options:**
1. **Backfill script:** Create agents for all existing restaurants
2. **Lazy creation:** Create agent when restaurant first accesses dashboard
3. **Manual migration:** Require restaurants to re-onboard

**Recommendation:** Option 2 (Lazy creation)

### Q3: Can restaurants change their voice after onboarding?
**Current State:** No voice change UI exists
**Recommendation:** Add to Settings page later (not MVP blocker)

---

## Risk Assessment:

### High Risk:
- ❌ **ElevenLabs API rate limits** - Unknown if we can create unlimited agents
- ❌ **Agent creation cost** - Need to verify ElevenLabs pricing model

### Medium Risk:
- ⚠️ **Existing Enterprise customers** - Need migration plan
- ⚠️ **Agent deletion** - What happens when subscription cancels?

### Low Risk:
- ✅ **UI changes** - Straightforward removal
- ✅ **Database migrations** - Non-breaking additive changes

---

## Next Steps:

1. **Approve plan removal** - Confirm we should remove Enterprise
2. **Check ElevenLabs pricing** - Verify agent creation limits/costs
3. **Start implementation** - Begin with Phase 1 (Enterprise removal)
4. **Create migration script** - Handle existing Enterprise subscriptions

---

**Created:** 2025-11-23
**Status:** Awaiting Approval
**Priority:** High (MVP Blocker)
