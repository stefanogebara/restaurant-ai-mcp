# Mem0 Integration Plan for Seatable

## Overview

Integrate Mem0 as the "memory layer" for the WhatsApp AI reservation assistant to enable personalized customer experiences across conversations.

---

## Goals

1. **Remember returning customers** - Dietary restrictions, table preferences, past visits
2. **Personalize conversations** - "Welcome back! Would you like your usual table by the window?"
3. **Reduce AI costs** - Instead of stuffing full customer history into prompts, retrieve only relevant memories
4. **Build customer profiles** - Automatically extract and store preferences from conversations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WhatsApp Message Received                    │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Get/Create Session (existing)                               │
│     - Phone number → session lookup                              │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. NEW: Retrieve Memories from Mem0                             │
│     - mem0.search(userMessage, { user_id: phoneNumber })        │
│     - Returns: dietary restrictions, preferences, past visits    │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Build Enhanced System Prompt (modified)                      │
│     - Add memory context to Claude system prompt                 │
│     - "Customer memories: vegetarian, prefers window seating..." │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Process with Claude (existing)                               │
│     - Claude now has memory context                              │
│     - Can reference past preferences in responses                │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. NEW: Store Memories to Mem0                                  │
│     - mem0.add(conversation, { user_id: phoneNumber })          │
│     - Mem0 auto-extracts facts and preferences                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Send Response (existing)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Install Mem0 SDK
```bash
npm install mem0ai
```

### Step 2: Create Mem0 Service Module

**File: `api/_lib/mem0-service.js`**

```javascript
const { MemoryClient } = require('mem0ai');

// Initialize Mem0 client
const mem0 = new MemoryClient(process.env.MEM0_API_KEY);

/**
 * Retrieve relevant memories for a customer
 * @param {string} phoneNumber - Customer phone number (user_id)
 * @param {string} query - Current message to search relevant memories
 * @param {string} restaurantId - Optional restaurant filter
 * @returns {Promise<Array>} - Array of relevant memories
 */
async function getCustomerMemories(phoneNumber, query, restaurantId = null) {
  try {
    const filters = { user_id: phoneNumber };
    if (restaurantId) {
      filters.metadata = { restaurant_id: restaurantId };
    }

    const results = await mem0.search(query, {
      filters,
      limit: 10
    });

    return results?.results || [];
  } catch (error) {
    console.error('[Mem0] Error retrieving memories:', error);
    return [];
  }
}

/**
 * Store new memories from a conversation
 * @param {string} phoneNumber - Customer phone number (user_id)
 * @param {Array} messages - Conversation messages [{role, content}]
 * @param {Object} metadata - Additional context (restaurant_id, etc.)
 */
async function storeConversationMemory(phoneNumber, messages, metadata = {}) {
  try {
    await mem0.add(messages, {
      user_id: phoneNumber,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        source: 'whatsapp'
      }
    });
    console.log(`[Mem0] Stored memories for ${phoneNumber}`);
  } catch (error) {
    console.error('[Mem0] Error storing memories:', error);
  }
}

/**
 * Format memories into a context string for Claude
 * @param {Array} memories - Array of memory objects
 * @returns {string} - Formatted context string
 */
function formatMemoriesForPrompt(memories) {
  if (!memories || memories.length === 0) {
    return 'No previous memories for this customer.';
  }

  return memories
    .map(m => `- ${m.memory}`)
    .join('\n');
}

/**
 * Get all memories for a customer (for dashboard display)
 * @param {string} phoneNumber - Customer phone number
 * @returns {Promise<Array>} - All customer memories
 */
async function getAllCustomerMemories(phoneNumber) {
  try {
    const results = await mem0.getAll({ user_id: phoneNumber });
    return results?.memories || [];
  } catch (error) {
    console.error('[Mem0] Error getting all memories:', error);
    return [];
  }
}

module.exports = {
  getCustomerMemories,
  storeConversationMemory,
  formatMemoriesForPrompt,
  getAllCustomerMemories
};
```

### Step 3: Modify WhatsApp Webhook

**File: `api/twilio-whatsapp-webhook.js`**

Changes needed:

```javascript
// Add import at top
const {
  getCustomerMemories,
  storeConversationMemory,
  formatMemoriesForPrompt
} = require('./_lib/mem0-service');

// Modify buildSystemPrompt to include memories
function buildSystemPrompt(restaurantInfo, session, availableRestaurants = [], customerMemories = []) {
  // ... existing code ...

  // Add memory section
  const memoryContext = formatMemoriesForPrompt(customerMemories);

  return `... existing prompt ...

CUSTOMER MEMORIES:
${memoryContext}

Use these memories to personalize your responses. Reference past preferences naturally.
For example: "I remember you prefer window seating - shall I note that for your reservation?"
`;
}

// Modify processWithClaude to retrieve and store memories
async function processWithClaude(messageText, session) {
  // ... existing setup code ...

  // NEW: Retrieve customer memories
  const phoneNumber = session?.sender_phone;
  const restaurantId = restaurantInfo?.id;

  let customerMemories = [];
  if (phoneNumber) {
    customerMemories = await getCustomerMemories(phoneNumber, messageText, restaurantId);
    console.log(`[Twilio] Retrieved ${customerMemories.length} memories for ${phoneNumber}`);
  }

  // ... existing Claude call with modified system prompt ...
  currentResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: buildSystemPrompt(restaurantInfo, session, availableRestaurants, customerMemories),
    // ...
  });

  // ... process response ...

  // NEW: Store conversation to Mem0 for future reference
  if (phoneNumber && assistantMessage) {
    await storeConversationMemory(phoneNumber, [
      { role: 'user', content: messageText },
      { role: 'assistant', content: assistantMessage }
    ], {
      restaurant_id: restaurantId,
      restaurant_name: restaurantInfo?.restaurant_name
    });
  }

  return assistantMessage;
}
```

### Step 4: Add Environment Variable

```env
# Mem0 Configuration
MEM0_API_KEY=sk-platform-your-api-key
```

### Step 5: Add Memory Retrieval Tool for Claude (Optional)

Allow Claude to explicitly search memories:

```javascript
{
  name: 'search_customer_memories',
  description: 'Search for specific memories about this customer (dietary restrictions, preferences, past visits)',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What to search for (e.g., "dietary restrictions", "seating preferences")'
      }
    },
    required: ['query']
  }
}
```

---

## What Mem0 Will Remember

Examples of automatically extracted memories:

| Conversation | Extracted Memory |
|--------------|------------------|
| "I'm vegetarian" | "Customer is vegetarian" |
| "We had a wonderful anniversary dinner last time" | "Customer celebrated anniversary at restaurant" |
| "Can we have the same table by the window?" | "Customer prefers window seating" |
| "My wife is allergic to shellfish" | "Customer's wife has shellfish allergy" |
| "Party of 4, like usual" | "Customer typically dines with party of 4" |
| "We come here every Friday" | "Customer is a regular on Fridays" |

---

## Testing Plan

### Test 1: New Customer
1. Send message from new number
2. Verify no memories returned
3. Make a reservation mentioning "vegetarian"
4. Check Mem0 dashboard - memory should be stored

### Test 2: Returning Customer
1. Send new message from same number
2. Verify "vegetarian" memory is retrieved
3. Claude should reference it: "I see you're vegetarian - we'll make sure the kitchen is aware"

### Test 3: Memory Search Tool
1. Ask "What do you know about me?"
2. Claude should use search_customer_memories tool
3. Should return stored memories

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `api/_lib/mem0-service.js` | CREATE | Mem0 service module |
| `api/twilio-whatsapp-webhook.js` | MODIFY | Add memory retrieval/storage |
| `api/whatsapp-webhook.js` | MODIFY | Same changes for Meta webhook |
| `.env` | MODIFY | Add MEM0_API_KEY |
| `package.json` | MODIFY | Add mem0ai dependency |

---

## Cost Considerations

### Mem0 Free Tier
- 10,000 memories included
- More than enough for development and small restaurants
- Typical restaurant: ~50-100 unique customers/month = years of free usage

### When to Upgrade
- >10,000 total memories stored
- Need advanced features (audit logging, encryption)

---

## Future Enhancements

1. **Dashboard Integration** - Show customer memories in host dashboard
2. **Memory Management** - Allow hosts to view/edit/delete customer memories
3. **Cross-Restaurant Memories** - Share memories across restaurant chain
4. **Privacy Controls** - Let customers opt-out or delete their memories

---

## Security Considerations

1. **Phone Number as User ID** - Using phone numbers (not names) for privacy
2. **Restaurant Scoping** - Memories tagged with restaurant_id for isolation
3. **No PII in Memories** - Mem0 extracts facts, not raw data
4. **SOC 2 Compliant** - Mem0 is SOC 2 & HIPAA compliant

---

## Approval Checklist

- [ ] Mem0 account created at app.mem0.ai
- [ ] API key generated and added to Vercel environment
- [ ] Implementation approach approved
- [ ] Testing strategy approved

---

**Ready to implement once approved.**
