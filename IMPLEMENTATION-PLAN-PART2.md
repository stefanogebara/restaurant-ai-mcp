# Implementation Plan - Part 2
## Continuation of ADK Deployment & Analytics Phase

---

## **Week 5 (Continued): Agent Deployment to Vertex AI**

### ✅ **Task 5.4: Update Agent Prime Directives**
**Estimated Time:** 2 hours

**Action Steps:**

**Verify and enhance your existing agent prompts in `adk-agents/src/prompts/`:**

**1. `reservation-agent.txt`:**
```
You are the Reservation Agent for a high-end restaurant management system.

PRIMARY OBJECTIVES:
1. Help customers find and book restaurant reservations
2. ALWAYS check availability before creating reservations
3. Offer alternative times when requested slot is unavailable
4. Capture all required information: date, time, party size, contact details
5. Handle modifications and cancellations professionally

AVAILABLE TOOLS (MCP):
- check_restaurant_availability(date, time, party_size)
- create_reservation(date, time, party_size, customer_name, customer_phone, customer_email, special_requests)
- modify_reservation(reservation_id, new_date?, new_time?, new_party_size?)
- cancel_reservation(reservation_id)
- lookup_reservation(phone OR name OR reservation_id)
- get_wait_time()

BEHAVIOR GUIDELINES:
- Always confirm details before finalizing reservation
- Suggest off-peak times for large parties (8+)
- Be proactive about special requests (birthdays, anniversaries, dietary needs)
- Never override the availability system - if it says "fully booked", offer alternatives
- Escalate complex requests to Customer Service Agent via A2A protocol

TONE: Friendly, professional, efficient, solution-oriented

EXAMPLE INTERACTIONS:

Customer: "I need a table for 4 this Saturday at 7pm"
Agent: "Let me check our availability for this Saturday at 7pm for 4 people..."
[Calls check_restaurant_availability]
Agent: "I'm sorry, we're fully booked at 7pm on Saturday. However, I have availability at 6:30pm or 8:30pm. Would either of those work for you?"

Customer: "Yes, 6:30pm works!"
Agent: "Perfect! May I have your name, phone number, and email to confirm the reservation?"
```

**2. `host-agent.txt`:**
```
You are the Host Dashboard Agent for restaurant floor management.

PRIMARY OBJECTIVES:
1. Manage real-time table assignments and seating
2. Track active dining parties and estimated departure times
3. Coordinate walk-in customers with available tables
4. Optimize table turnover and occupancy rates
5. Handle reservation check-ins smoothly

AVAILABLE TOOLS (MCP):
- get_host_dashboard_data() → Returns: tables, active_parties, upcoming_reservations
- seat_party(customer_name, customer_phone, party_size, table_ids, special_requests?, reservation_id?)
- complete_service(service_record_id)
- mark_table_clean(table_id)
- check_restaurant_availability(date, time, party_size)
- lookup_reservation(phone OR name OR reservation_id)

BEHAVIOR GUIDELINES:
- ALWAYS prioritize reservations over walk-ins
- NEVER exceed capacity limits - check table availability before seating
- Suggest optimal table combinations for large parties
- Track party dining duration for accurate wait time estimates
- Alert when parties are running overtime (>15 min past estimated departure)
- Maintain clean table status for food safety

TABLE ASSIGNMENT LOGIC:
- Party of 1-2: Tables 1-3 (2-seat tables)
- Party of 3-4: Tables 4-7 (4-seat tables)
- Party of 5-6: Tables 8-9 (6-seat tables) OR combine two 4-seat tables
- Party of 7+: Tables 10 (8-seat) OR combine multiple tables
- Prefer single tables over combinations when possible
- Avoid seating 2 people at 6-seat tables during peak hours

TONE: Efficient, calm under pressure, detail-oriented, proactive

EXAMPLE INTERACTIONS:

Host: "Walk-in party of 4 just arrived"
Agent: [Calls get_host_dashboard_data to check availability]
Agent: "We have Tables 4, 5, and 6 available. Table 5 is best - it's centrally located and has good ambiance. Shall I seat them there?"

Host: "Yes, please"
Agent: [Calls seat_party with table_ids=[5]]
Agent: "Party of 4 seated at Table 5. Service record created. Estimated departure: 7:45pm."
```

**3. `customer-service-agent.txt`:**
```
You are the Customer Service Agent for restaurant support.

PRIMARY OBJECTIVES:
1. Resolve customer issues and complaints with empathy
2. Answer questions about restaurant policies, menu, location using RAG knowledge base
3. Handle special requests (dietary restrictions, celebrations, accessibility)
4. Provide exceptional customer experience
5. Collaborate with Reservation Agent for booking-related issues

AVAILABLE TOOLS (MCP):
- lookup_reservation(phone OR name OR reservation_id)
- cancel_reservation(reservation_id)
- modify_reservation(reservation_id, new_date?, new_time?, new_party_size?)
- query_knowledge_base(question) → Returns relevant info from 10,000+ word knowledge base

KNOWLEDGE BASE ACCESS (via RAG):
You have access to comprehensive knowledge base covering:
- Restaurant policies (cancellation, dress code, private events, dietary accommodations)
- Complete menu (appetizers, entrees, desserts, drinks, allergen info)
- FAQ (50+ common questions)
- Location & services (directions, parking, nearby hotels)

BEHAVIOR GUIDELINES:
- ALWAYS empathize with customer concerns first
- Know restaurant policies inside and out via knowledge base
- Offer solutions, not just apologies
- Escalate billing/technical issues to management
- Document all interactions for quality assurance
- For reservation changes, collaborate with Reservation Agent via A2A

COMPLAINT RESOLUTION FRAMEWORK:
1. Listen & empathize: "I understand your frustration..."
2. Clarify the issue: "Let me make sure I understand..."
3. Offer solutions: "Here's what I can do for you..."
4. Follow through: "I've made those changes and sent you a confirmation"
5. Ensure satisfaction: "Is there anything else I can help with?"

TONE: Empathetic, solution-focused, patient, professional

EXAMPLE INTERACTIONS:

Customer: "What's your cancellation policy?"
Agent: [Queries knowledge base for cancellation policy]
Agent: "We require 24 hours advance notice for cancellations. Cancellations within 24 hours may incur a $25 per person fee. However, we understand emergencies happen - if you need to cancel, please call us and we'll do our best to accommodate."

Customer: "I have a reservation but need to change it from 6 to 8 people"
Agent: [Sends A2A message to Reservation Agent: "Customer needs to modify RES-12345 from 6 to 8 people"]
[Reservation Agent checks availability and responds]
Agent: "Good news! I've updated your reservation for 8 people. You're confirmed for Saturday at 7pm. We'll have Tables 5 and 6 combined for your party."
```

**Deliverable:** All 3 agent prompts enhanced and ready

---

### ✅ **Task 5.5: Connect Agents to MCP Tools**
**Estimated Time:** 4 hours

**Action Steps:**

**1. Update `adk-agents/src/orchestrator.ts` to integrate MCP server:**

```typescript
// Add MCP client integration
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

class MCPToolExecutor {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    // Initialize MCP client connected to your restaurant API
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['../api/index.js'], // Your existing API as MCP server
    });

    this.client = new Client({
      name: 'restaurant-ai-agent',
      version: '1.0.0',
    }, {
      capabilities: {}
    });
  }

  async connect() {
    await this.client.connect(this.transport);
    console.log('[MCP] Connected to restaurant API server');

    // List available tools
    const tools = await this.client.listTools();
    console.log('[MCP] Available tools:', tools);
  }

  async executeTool(toolName: string, args: any) {
    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      console.error(`[MCP] Tool execution failed: ${toolName}`, error);
      throw error;
    }
  }
}

// Update BaseAgent class to use MCP tools
abstract class BaseAgent {
  protected mcpExecutor: MCPToolExecutor;

  constructor(name: string, primeDirectivePath: string, tools: string[], logger: AgentLogger, mcpExecutor: MCPToolExecutor) {
    // ... existing code ...
    this.mcpExecutor = mcpExecutor;
  }

  protected async callTool(toolName: string, args: any) {
    const startTime = Date.now();

    console.log(`[${this.name}] Calling tool: ${toolName}`, args);

    const result = await this.mcpExecutor.executeTool(toolName, args);

    const duration = Date.now() - startTime;
    console.log(`[${this.name}] Tool completed in ${duration}ms`);

    return result;
  }
}
```

**2. Update agent implementations to actually call tools:**

```typescript
class ReservationAgent extends BaseAgent {
  async handleTask(task: string, context?: any): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Use LLM to determine which tool to call
      const prompt = `
Task: ${task}
Context: ${JSON.stringify(context || {})}

Available tools:
${this.tools.map(t => `- ${t}`).join('\n')}

Determine which tool(s) to call and with what arguments.
Respond with JSON: { "tool": "tool_name", "arguments": {...} }
      `;

      const llmResponse = await this.callLLM(prompt);

      // Parse LLM response to get tool call
      const toolCall = JSON.parse(llmResponse);

      // Execute the tool via MCP
      const toolResult = await this.callTool(toolCall.tool, toolCall.arguments);

      // Generate final response
      const finalPrompt = `
Tool result: ${JSON.stringify(toolResult)}

Generate a natural language response to the customer based on this result.
      `;

      const finalResponse = await this.callLLM(finalPrompt);

      const responseTime = Date.now() - startTime;

      this.logger.log({
        agent: this.name,
        action: 'handleTask',
        userIntent: task,
        toolCalls: [toolCall.tool],
        outcome: 'success',
        responseTime,
      });

      return {
        agent: this.name,
        success: true,
        result: finalResponse,
      };

    } catch (error: any) {
      // ... error handling ...
    }
  }
}
```

**Deliverable:** Agents connected to real MCP tools

---

## **Week 6: Deploy to Vertex AI Agent Engine**

### ✅ **Task 6.1: Package Agents for Deployment**
**Estimated Time:** 3 hours

**Action Steps:**

**1. Build production version:**
```bash
cd adk-agents
npm run build
```

**2. Create deployment configuration `adk-agents/agent-config.yaml`:**

```yaml
agents:
  - name: reservation-agent
    displayName: Reservation Agent
    description: Handles customer reservations and bookings
    model: gemini-2.0-flash-exp
    tools:
      - check_restaurant_availability
      - create_reservation
      - modify_reservation
      - cancel_reservation
      - lookup_reservation
      - get_wait_time
    systemInstruction: |
      ${contents of reservation-agent.txt}

  - name: host-agent
    displayName: Host Dashboard Agent
    description: Manages floor operations and table assignments
    model: gemini-2.0-flash-exp
    tools:
      - get_host_dashboard_data
      - seat_party
      - complete_service
      - mark_table_clean
      - check_restaurant_availability
      - lookup_reservation
    systemInstruction: |
      ${contents of host-agent.txt}

  - name: customer-service-agent
    displayName: Customer Service Agent
    description: Handles customer support and inquiries
    model: gemini-2.0-flash-exp
    tools:
      - lookup_reservation
      - cancel_reservation
      - modify_reservation
      - query_knowledge_base
    systemInstruction: |
      ${contents of customer-service-agent.txt}
    ragCorpusId: restaurant-knowledge-base-v1
```

**Deliverable:** Agents packaged and configured

---

### ✅ **Task 6.2: Deploy to Vertex AI**
**Estimated Time:** 3 hours

**Action Steps:**

**1. Deploy using ADK CLI:**

```bash
cd adk-agents

# Authenticate
gcloud auth application-default login

# Deploy all agents
gcloud ai agents deploy \
  --config=agent-config.yaml \
  --project=restaurant-ai-prod-123456 \
  --region=us-central1
```

**2. Test deployed agents:**

```bash
# Test Reservation Agent
gcloud ai agents call \
  --agent=reservation-agent \
  --prompt="I need a table for 4 this Saturday at 7pm" \
  --project=restaurant-ai-prod-123456
```

**3. Get agent endpoints:**

```bash
gcloud ai agents list \
  --project=restaurant-ai-prod-123456

# Output will show agent URLs like:
# https://us-central1-aiplatform.googleapis.com/v1/projects/restaurant-ai-prod-123456/locations/us-central1/agents/reservation-agent
```

**4. Add to `.env`:**
```env
RESERVATION_AGENT_ENDPOINT=https://...
HOST_AGENT_ENDPOINT=https://...
CUSTOMER_SERVICE_AGENT_ENDPOINT=https://...
```

**Deliverable:** All 3 agents deployed and accessible

---

### ✅ **Task 6.3: Integrate with Production API**
**Estimated Time:** 4 hours

**Action Steps:**

**1. Create `api/routes/agent-orchestrator.js`:**

```javascript
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: 'https://www.googleapis.com/auth/cloud-platform',
});

async function callAgent(agentEndpoint, prompt, context = {}) {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();

  const response = await axios.post(
    agentEndpoint,
    {
      prompt,
      context,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

async function handleAgentRequest(req, res) {
  try {
    const { task, agent_type, context } = req.body;

    // Route to appropriate agent
    let agentEndpoint;
    switch (agent_type) {
      case 'reservation':
        agentEndpoint = process.env.RESERVATION_AGENT_ENDPOINT;
        break;
      case 'host':
        agentEndpoint = process.env.HOST_AGENT_ENDPOINT;
        break;
      case 'customer-service':
        agentEndpoint = process.env.CUSTOMER_SERVICE_AGENT_ENDPOINT;
        break;
      default:
        return res.status(400).json({ error: 'Invalid agent type' });
    }

    const result = await callAgent(agentEndpoint, task, context);

    res.status(200).json({
      success: true,
      agent: agent_type,
      result,
    });

  } catch (error) {
    console.error('Agent request error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = handleAgentRequest;
```

**2. Update ElevenLabs webhook to use agents:**

Update `api/elevenlabs-webhook.js` to route to Reservation Agent:

```javascript
// When customer requests a reservation
const agentResult = await callAgent(
  process.env.RESERVATION_AGENT_ENDPOINT,
  customerMessage,
  { conversation_id: conversationId }
);

// Return agent's response
res.status(200).json({
  response: agentResult.message
});
```

**Deliverable:** Production API integrated with deployed agents

---

### ✅ **Task 6.4: Set Up Observability Dashboard**
**Estimated Time:** 2 hours

**Action Steps:**

**1. Enable Cloud Logging:**
```bash
gcloud services enable logging.googleapis.com
```

**2. Create log-based metrics:**
```bash
gcloud logging metrics create agent_success_rate \
  --description="Agent task success rate" \
  --log-filter='resource.type="aiplatform.googleapis.com/Agent"
                severity="INFO"
                jsonPayload.outcome="success"'
```

**3. Create dashboard in Cloud Console:**
- Go to https://console.cloud.google.com/monitoring
- Create dashboard "Restaurant AI Agents"
- Add charts:
  - Agent request volume (line chart)
  - Success rate by agent (gauge)
  - Average response time (line chart)
  - Tool usage breakdown (pie chart)

**Deliverable:** Observability dashboard showing agent metrics

---

## **Phase 2 Success Metrics**

- ✅ Google Cloud project set up
- ✅ Vertex AI enabled
- ✅ Knowledge base vector store built (10,000+ words indexed)
- ✅ 3 agents deployed to Vertex AI
- ✅ Agent prompts enhanced and tested
- ✅ MCP tools connected to agents
- ✅ Production API routing to agents
- ✅ ElevenLabs using Reservation Agent
- ✅ Observability dashboard operational
- ✅ A2A protocol working between agents
- ✅ RAG knowledge base querying correctly
- ✅ Sub-2 second response times

---

# 📊 PHASE 3: ANALYTICS DASHBOARD (Weeks 7-10)

## **Goal:** Visualize occupancy, revenue, and trends for data-driven decisions

### **Business Value:**
- Identify peak hours and staffing needs
- Track revenue per table and turnover rates
- Spot no-show patterns
- Optimize pricing and promotions
- Prove ROI to stakeholders

---

## **Week 7: Analytics Backend & Data Aggregation**

### ✅ **Task 7.1: Install Charting Library**
**Estimated Time:** 30 minutes

**Action Steps:**

```bash
cd client
npm install recharts date-fns
npm install --save-dev @types/recharts
```

**Deliverable:** Recharts installed

---

### ✅ **Task 7.2: Create Analytics Endpoints**
**Estimated Time:** 6 hours

**Action Steps:**

**Create `api/analytics.js`:**

```javascript
const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

function getHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// GET /api/analytics/occupancy?start=2025-10-01&end=2025-10-31
async function handleGetOccupancy(req, res) {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'Missing start or end date' });
    }

    // Get all service records in date range
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Service%20Records`;
    const formula = `AND(
      IS_AFTER({Seated At}, '${start}'),
      IS_BEFORE({Seated At}, '${end}')
    )`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      params: {
        filterByFormula: formula,
      }
    });

    const serviceRecords = response.data.records;

    // Group by date and hour
    const occupancyByHour = {};

    serviceRecords.forEach(record => {
      const seatedAt = new Date(record.fields['Seated At']);
      const date = seatedAt.toISOString().split('T')[0];
      const hour = seatedAt.getHours();

      const key = `${date}-${hour}`;
      if (!occupancyByHour[key]) {
        occupancyByHour[key] = {
          date,
          hour,
          parties: 0,
          totalSeats: 0,
        };
      }

      occupancyByHour[key].parties++;
      occupancyByHour[key].totalSeats += record.fields['Party Size'] || 0;
    });

    // Calculate occupancy percentage
    const tableCapacity = 50; // TODO: Get from Tables table
    const data = Object.values(occupancyByHour).map(entry => ({
      ...entry,
      occupancyRate: (entry.totalSeats / tableCapacity) * 100,
    }));

    res.status(200).json({
      success: true,
      data,
      range: { start, end },
    });

  } catch (error) {
    console.error('Get occupancy error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/analytics/peak-hours
async function handleGetPeakHours(req, res) {
  try {
    // Get all completed service records from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Service%20Records`;
    const formula = `AND(
      {Status}='Completed',
      IS_AFTER({Seated At}, '${thirtyDaysAgo.toISOString()}')
    )`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      params: { filterByFormula: formula }
    });

    const serviceRecords = response.data.records;

    // Group by day of week and hour
    const hourCounts = {};

    serviceRecords.forEach(record => {
      const seatedAt = new Date(record.fields['Seated At']);
      const dayOfWeek = seatedAt.getDay(); // 0 = Sunday
      const hour = seatedAt.getHours();

      const key = `${dayOfWeek}-${hour}`;
      hourCounts[key] = (hourCounts[key] || 0) + 1;
    });

    // Find top 5 busiest slots
    const sorted = Object.entries(hourCounts)
      .map(([key, count]) => {
        const [day, hour] = key.split('-');
        return {
          dayOfWeek: parseInt(day),
          dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(day)],
          hour: parseInt(hour),
          timeSlot: `${hour}:00 - ${parseInt(hour) + 1}:00`,
          visits: count,
        };
      })
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    res.status(200).json({
      success: true,
      peakHours: sorted,
    });

  } catch (error) {
    console.error('Get peak hours error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/analytics/revenue?start=2025-10-01&end=2025-10-31
async function handleGetRevenue(req, res) {
  try {
    const { start, end } = req.query;

    // Get service records in range
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Service%20Records`;
    const formula = `AND(
      {Status}='Completed',
      IS_AFTER({Seated At}, '${start}'),
      IS_BEFORE({Departed At}, '${end}')
    )`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      params: { filterByFormula: formula }
    });

    const serviceRecords = response.data.records;

    // Calculate metrics
    const totalParties = serviceRecords.length;
    const avgPartySize = serviceRecords.reduce((sum, r) => sum + (r.fields['Party Size'] || 0), 0) / totalParties;

    // Calculate table turnover
    const tableTurnovers = {};
    serviceRecords.forEach(record => {
      const tableIds = record.fields['Table IDs'] || [];
      tableIds.forEach(tableId => {
        tableTurnovers[tableId] = (tableTurnovers[tableId] || 0) + 1;
      });
    });

    const avgTurnover = Object.values(tableTurnovers).reduce((sum, count) => sum + count, 0) / Object.keys(tableTurnovers).length;

    // Group by day for revenue trend
    const revenueByDay = {};
    serviceRecords.forEach(record => {
      const date = new Date(record.fields['Seated At']).toISOString().split('T')[0];

      if (!revenueByDay[date]) {
        revenueByDay[date] = {
          date,
          parties: 0,
          covers: 0, // Total guests
        };
      }

      revenueByDay[date].parties++;
      revenueByDay[date].covers += record.fields['Party Size'] || 0;
    });

    res.status(200).json({
      success: true,
      summary: {
        totalParties,
        avgPartySize: avgPartySize.toFixed(1),
        avgTableTurnover: avgTurnover.toFixed(1),
      },
      trend: Object.values(revenueByDay),
    });

  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// GET /api/analytics/no-show-rate
async function handleGetNoShowRate(req, res) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Reservations`;
    const formula = `IS_AFTER({Created At}, '${thirtyDaysAgo.toISOString()}')`;

    const response = await axios.get(url, {
      headers: getHeaders(),
      params: { filterByFormula: formula }
    });

    const reservations = response.data.records;

    const total = reservations.length;
    const completed = reservations.filter(r => r.fields.status === 'completed').length;
    const cancelled = reservations.filter(r => r.fields.status === 'cancelled').length;
    const noShows = reservations.filter(r => r.fields.status === 'no-show').length;

    const noShowRate = total > 0 ? ((noShows / total) * 100).toFixed(1) : 0;
    const cancellationRate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : 0;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;

    res.status(200).json({
      success: true,
      total,
      completed,
      cancelled,
      noShows,
      rates: {
        noShowRate: parseFloat(noShowRate),
        cancellationRate: parseFloat(cancellationRate),
        completionRate: parseFloat(completionRate),
      }
    });

  } catch (error) {
    console.error('Get no-show rate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// Main handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const path = req.url.split('?')[0];

  if (req.method === 'GET' && path === '/api/analytics/occupancy') {
    return handleGetOccupancy(req, res);
  }

  if (req.method === 'GET' && path === '/api/analytics/peak-hours') {
    return handleGetPeakHours(req, res);
  }

  if (req.method === 'GET' && path === '/api/analytics/revenue') {
    return handleGetRevenue(req, res);
  }

  if (req.method === 'GET' && path === '/api/analytics/no-show-rate') {
    return handleGetNoShowRate(req, res);
  }

  res.status(404).json({ error: 'Not found' });
};
```

**Deliverable:** 4 analytics endpoints operational

---

[Continue with Week 8-10 for frontend charts and dashboard...]

## **Week 8-10: Frontend Charts & Dashboard**

### ✅ **Task 8.1: Create Analytics Dashboard Page**
**Estimated Time:** 8 hours

See full implementation in IMPLEMENTATION-PLAN-COMPLETE.md

---

## **Final Timeline Summary**

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| **Phase 1: Waitlist** | 4 weeks | SMS notifications, smart wait times, auto-matching |
| **Phase 2: ADK Agents** | 2 weeks | 3 agents deployed to Vertex AI, RAG knowledge base, A2A protocol |
| **Phase 3: Analytics** | 4 weeks | Occupancy charts, peak hours, revenue trends, no-show tracking |
| **TOTAL** | **10 weeks** | Enterprise-grade AI restaurant platform |

---

## **Next Actions**

**This Week:**
1. ✅ Review this plan
2. Create Waitlist table in Airtable
3. Set up Twilio account
4. Start Task 1.4: Create waitlist API routes

**This Month:**
- Complete Phase 1 (Waitlist)
- Set up Google Cloud account
- Prepare for ADK deployment

**This Quarter:**
- Complete all 3 phases
- Launch enterprise AI restaurant platform
- Showcase multi-agent system

Ready to start? Let's begin with Phase 1, Task 1.1! 🚀
