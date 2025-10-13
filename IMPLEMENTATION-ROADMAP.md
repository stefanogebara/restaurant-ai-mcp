# Complete Implementation Roadmap - Restaurant AI MCP

## Executive Summary
This document outlines the complete transformation of the Restaurant AI system from a basic API to a cutting-edge multi-agent AI platform using Google's Agent Development Kit (ADK), Model Context Protocol (MCP), and Vertex AI.

**Timeline**: 4-6 weeks
**Estimated Effort**: ~160-200 hours
**Expected ROI**: 10x improvement in capabilities, enterprise-ready architecture

---

## Phase 1: Critical Bug Fixes (Priority: CRITICAL)
**Duration**: 1-2 days
**Goal**: Unblock Phase 2 Host Dashboard

### 1.1 Fix Service Records Table Configuration ✅
**File**: Airtable Configuration
**Required Fields**:
```
1. Service ID (Single line text, Primary field)
2. Reservation ID (Single line text, Optional)
3. Customer Name (Single line text, Required)
4. Customer Phone (Phone number, Required)
5. Party Size (Number, Required, Min: 1)
6. Table IDs (Multiple select OR Long text JSON array)
7. Seated At (Date with time, Required)
8. Estimated Departure (Date with time, Required)
9. Departed At (Date with time, Optional)
10. Special Requests (Long text, Optional)
11. Status (Single select: Active, Completed, Cancelled)
```

**Testing**:
- Create test service record via API
- Verify all fields save correctly
- Test walk-in flow end-to-end

### 1.2 Add Missing Environment Variable
**File**: Vercel Dashboard → Settings → Environment Variables
```env
SERVICE_RECORDS_TABLE_ID=tblEEHaoicXQA7NcL
```

**Also add to `.env.example`**:
```env
SERVICE_RECORDS_TABLE_ID=your-service-records-table-id
```

### 1.3 Test Walk-In Flow
**Test Scenarios**:
1. Add walk-in customer (party of 4)
2. Check table recommendations
3. Confirm seating
4. Verify table status changes to "Occupied"
5. Complete service
6. Mark table clean
7. Verify table returns to "Available"

---

## Phase 2: MCP Server Architecture (Priority: HIGH)
**Duration**: 1 week
**Goal**: Convert API to standardized MCP server

### 2.1 Create MCP Server Structure
**New Directory**: `mcp-server/`
```
mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Main MCP server
│   ├── tools/
│   │   ├── availability.ts      # check_availability tool
│   │   ├── reservations.ts      # Reservation management
│   │   ├── tables.ts            # Table management
│   │   └── host-dashboard.ts   # Host operations
│   ├── types/
│   │   └── mcp.ts              # MCP type definitions
│   └── config/
│       └── tools.json          # Tool definitions
└── README.md
```

### 2.2 Install MCP Dependencies
```json
{
  "name": "@restaurant-ai/mcp-server",
  "version": "1.0.0",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "zod": "^3.22.4",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

### 2.3 Implement MCP Protocol Server
**File**: `mcp-server/src/index.ts`

Key Features:
- Standard JSON-RPC 2.0 protocol
- Tool discovery endpoint
- Async tool execution
- Error handling
- Logging

### 2.4 Define MCP Tools
**Tools to Implement**:

1. `check_restaurant_availability`
   - Input: date, time, party_size
   - Output: available (boolean), alternative_times, details

2. `create_reservation`
   - Input: date, time, party_size, customer details, special_requests
   - Output: reservation_id, confirmation details

3. `lookup_reservation`
   - Input: reservation_id OR phone OR name
   - Output: reservation details

4. `modify_reservation`
   - Input: reservation_id, new_date/time/party_size
   - Output: updated reservation

5. `cancel_reservation`
   - Input: reservation_id
   - Output: cancellation confirmation

6. `get_wait_time`
   - Input: (none)
   - Output: current wait time estimate

7. `get_host_dashboard_data`
   - Input: (none)
   - Output: tables, active_parties, upcoming_reservations

8. `seat_party`
   - Input: customer details, table_ids
   - Output: service_record_id

9. `complete_service`
   - Input: service_record_id
   - Output: success, tables_to_clean

10. `mark_table_clean`
    - Input: table_id
    - Output: success, new_status

### 2.5 Create MCP Configuration File
**File**: `mcp-server/config.json`
```json
{
  "mcpServers": {
    "restaurant-ai": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "AIRTABLE_API_KEY": "${AIRTABLE_API_KEY}",
        "AIRTABLE_BASE_ID": "${AIRTABLE_BASE_ID}"
      }
    }
  }
}
```

### 2.6 Test MCP Server
**Testing Methods**:
1. Use MCP Inspector: `npx @modelcontextprotocol/inspector mcp-server/dist/index.js`
2. Test with Claude Desktop (add to config)
3. Test each tool individually
4. Test error scenarios

---

## Phase 3: Google ADK Multi-Agent System (Priority: HIGH)
**Duration**: 2 weeks
**Goal**: Implement specialized agents with ADK

### 3.1 Set Up ADK Structure
**New Directory**: `adk-agents/`
```
adk-agents/
├── package.json
├── src/
│   ├── orchestrator.ts          # Main agent orchestrator
│   ├── agents/
│   │   ├── reservation-agent.ts    # Reservation specialist
│   │   ├── host-agent.ts           # Host dashboard specialist
│   │   ├── customer-service-agent.ts # Customer service
│   │   └── analytics-agent.ts      # Analytics & insights
│   ├── prompts/
│   │   ├── reservation.txt         # Reservation agent prime directive
│   │   ├── host.txt               # Host agent prime directive
│   │   └── customer-service.txt   # CS agent prime directive
│   └── config/
│       └── agents.json            # Agent configurations
└── README.md
```

### 3.2 Install ADK Dependencies
```json
{
  "dependencies": {
    "@google-cloud/adk": "^0.1.0",
    "@google-cloud/vertexai": "^1.1.0",
    "@modelcontextprotocol/sdk": "^0.5.0"
  }
}
```

### 3.3 Define Agent Prime Directives

**Reservation Agent Prime Directive**:
```
You are the Reservation Agent for a restaurant management system.

YOUR PRIMARY OBJECTIVES:
1. Help customers find and book restaurant reservations
2. ALWAYS check availability before creating reservations
3. Offer alternative times when requested slot is unavailable
4. Capture all required information: date, time, party size, contact details
5. Handle modifications and cancellations professionally

YOUR CAPABILITIES (MCP Tools):
- check_restaurant_availability
- create_reservation
- modify_reservation
- cancel_reservation
- lookup_reservation

BEHAVIOR GUIDELINES:
- Always confirm details before finalizing reservation
- Suggest off-peak times for large parties
- Be proactive about special requests
- Never override availability system
- Escalate complex requests to Customer Service Agent

TONE: Friendly, professional, efficient
```

**Host Dashboard Agent Prime Directive**:
```
You are the Host Dashboard Agent for restaurant floor management.

YOUR PRIMARY OBJECTIVES:
1. Manage real-time table assignments and seating
2. Track active dining parties and estimated departure times
3. Coordinate walk-in customers with available tables
4. Optimize table turnover and occupancy rates
5. Handle reservation check-ins smoothly

YOUR CAPABILITIES (MCP Tools):
- get_host_dashboard_data
- seat_party
- complete_service
- mark_table_clean
- check_restaurant_availability

BEHAVIOR GUIDELINES:
- Prioritize reservations over walk-ins
- Never exceed capacity limits
- Suggest optimal table combinations for large parties
- Track party dining duration for wait time estimates
- Alert when parties are running overtime

TONE: Efficient, calm under pressure, detail-oriented
```

**Customer Service Agent Prime Directive**:
```
You are the Customer Service Agent for restaurant support.

YOUR PRIMARY OBJECTIVES:
1. Resolve customer issues and complaints
2. Answer questions about restaurant policies, menu, location
3. Handle special requests (dietary restrictions, celebrations, accessibility)
4. Provide excellent customer experience
5. Collaborate with Reservation Agent for booking-related issues

YOUR CAPABILITIES:
- lookup_reservation
- cancel_reservation
- modify_reservation
- Access to restaurant knowledge base (via RAG)

BEHAVIOR GUIDELINES:
- Always empathize with customer concerns
- Know restaurant policies inside and out
- Offer solutions, not just apologies
- Escalate billing/technical issues appropriately
- Document all interactions for quality assurance

TONE: Empathetic, solution-focused, patient
```

### 3.4 Implement A2A (Agent-to-Agent) Protocol

**Use Cases**:
1. Reservation Agent → Host Agent: "Is table 5 actually available?"
2. Customer Service Agent → Reservation Agent: "Customer needs to modify reservation"
3. Analytics Agent → Host Agent: "Predict tonight's peak time"

**Implementation**:
```typescript
// A2A message format
interface A2AMessage {
  from: string;        // Source agent ID
  to: string;          // Target agent ID
  task: string;        // Request description
  context: any;        // Additional data
  priority: 'low' | 'medium' | 'high';
}

// A2A handler in orchestrator
class AgentOrchestrator {
  async routeMessage(message: A2AMessage) {
    const targetAgent = this.agents[message.to];
    const result = await targetAgent.handleTask(message);
    return result;
  }
}
```

### 3.5 Deploy on Vertex AI Agent Engine

**Steps**:
1. Create Vertex AI project
2. Enable Agent Engine API
3. Deploy agents as managed services
4. Configure auto-scaling
5. Set up monitoring

---

## Phase 4: Advanced AI Features (Priority: MEDIUM)
**Duration**: 2 weeks
**Goal**: Add RAG, observability, predictive analytics

### 4.1 Implement Vertex AI RAG Engine

**Knowledge Base Structure**:
```
restaurant-knowledge/
├── menu/
│   ├── appetizers.md
│   ├── entrees.md
│   ├── desserts.md
│   ├── drinks.md
│   └── dietary-options.md
├── policies/
│   ├── cancellation-policy.md
│   ├── dress-code.md
│   ├── private-dining.md
│   └── accessibility.md
├── location/
│   ├── directions.md
│   ├── parking.md
│   └── nearby-attractions.md
└── faq/
    └── common-questions.md
```

**RAG Implementation**:
```typescript
import { VertexAI } from '@google-cloud/vertexai';

const rag = new VertexAI({
  project: 'your-project',
  location: 'us-central1'
});

async function queryKnowledge(question: string) {
  const response = await rag.search({
    query: question,
    corpusId: 'restaurant-knowledge-base',
    topK: 5
  });
  return response;
}
```

### 4.2 Implement Agent Observability

**Metrics to Track**:
- Agent trajectory (decision path)
- Tool call frequency and latency
- Success/failure rates
- Response quality scores
- User satisfaction ratings

**Implementation**:
```typescript
class AgentLogger {
  logAgentDecision(event: {
    agent: string;
    userIntent: string;
    toolCalls: string[];
    outcome: 'success' | 'failure';
    responseTime: number;
    timestamp: Date;
  }) {
    // Send to logging service (Cloud Logging, DataDog, etc.)
  }
}
```

### 4.3 Add Predictive Analytics with Gemini 2.5 Pro

**Use Cases**:
1. **No-Show Prediction**: Analyze customer patterns to predict no-shows
2. **Demand Forecasting**: Predict busy times based on weather, events, holidays
3. **Revenue Optimization**: Suggest dynamic pricing during peak demand
4. **Table Optimization**: Recommend best table assignments for efficiency

**Implementation**:
```typescript
import { Gemini25Pro } from '@google-cloud/vertexai';

async function predictNoShowProbability(reservation: Reservation) {
  const prompt = `
    Analyze this reservation and predict no-show probability:
    - Party size: ${reservation.party_size}
    - Day of week: ${reservation.day}
    - Time: ${reservation.time}
    - Advance booking: ${reservation.days_ahead} days
    - Customer history: ${reservation.customer_history}

    Return probability score 0-100 and reasoning.
  `;

  const prediction = await gemini.generateContent(prompt);
  return prediction;
}
```

### 4.4 Implement GraphRAG for Customer Relationships

**Graph Structure**:
```
Customer --[PREFERS]--> Table
Customer --[HAS_ALLERGY]--> Ingredient
Customer --[ORDERED]--> MenuItem
Customer --[CELEBRATES]--> EventType
Table --[IN_SECTION]--> Section
MenuItem --[CONTAINS]--> Ingredient
```

**Use Cases**:
- "Book Sarah's usual table for her anniversary with allergy-friendly menu"
- "What tables do our VIP customers prefer?"
- "Which customers haven't visited in 3+ months?"

---

## Phase 5: Testing & Deployment (Priority: CRITICAL)
**Duration**: 1 week
**Goal**: Comprehensive testing and production deployment

### 5.1 Create Comprehensive Test Suite

**Test Categories**:

1. **Unit Tests** (Jest)
   - Test each MCP tool independently
   - Test agent logic
   - Test utility functions

2. **Integration Tests**
   - Test MCP server with real tools
   - Test agent-to-agent communication
   - Test API endpoints

3. **E2E Tests** (Playwright)
   - Test complete reservation flow
   - Test host dashboard operations
   - Test multi-agent scenarios

4. **Load Tests** (k6)
   - Test concurrent reservations
   - Test peak hour scenarios
   - Test agent response times

### 5.2 Test MCP Server with MCPs

**Using MCP Inspector**:
```bash
npx @modelcontextprotocol/inspector mcp-server/dist/index.js
```

**Test Each Tool**:
```json
// Test check_availability
{
  "tool": "check_restaurant_availability",
  "arguments": {
    "date": "2025-10-20",
    "time": "19:00",
    "party_size": 4
  }
}

// Expected output
{
  "available": true,
  "details": {
    "estimated_duration": "120 minutes",
    "available_seats": 34
  }
}
```

### 5.3 Update Documentation

**Files to Update**:
1. `README.md` - Add MCP server usage
2. `CLAUDE.md` - Update with new architecture
3. `MCP-SERVER-GUIDE.md` - New file for MCP documentation
4. `ADK-AGENTS-GUIDE.md` - New file for agent documentation
5. `API-MIGRATION-GUIDE.md` - Migration guide for existing users

### 5.4 Deploy to Production

**Deployment Checklist**:
- [ ] All tests passing
- [ ] Environment variables configured in Vercel
- [ ] MCP server tested locally
- [ ] ADK agents deployed to Vertex AI
- [ ] Monitoring and logging enabled
- [ ] Documentation updated
- [ ] Backup plan ready

**Vercel Deployment**:
```bash
# Deploy main app
vercel --prod

# Set environment variables
vercel env add SERVICE_RECORDS_TABLE_ID
vercel env add GOOGLE_CLOUD_PROJECT
vercel env add VERTEX_AI_LOCATION
```

**MCP Server Deployment**:
```bash
# Build MCP server
cd mcp-server
npm run build

# Test locally
node dist/index.js

# Deploy (add to npm registry or GitHub packages)
npm publish
```

---

## Success Metrics

### Technical Metrics
- ✅ All 23 todo items completed
- ✅ 100% test coverage on critical paths
- ✅ MCP server passing all tool tests
- ✅ All agents deployed and responding < 2s
- ✅ Zero errors in production logs

### Business Metrics
- 📈 10x improvement in agent capabilities
- 📈 50% reduction in average handling time
- 📈 Enterprise-ready architecture
- 📈 Published MCP server for community
- 📈 Multi-agent orchestration working

### Quality Metrics
- ⭐ Agent response quality > 90%
- ⭐ System uptime > 99.9%
- ⭐ User satisfaction score > 4.5/5
- ⭐ Agent trajectory transparency 100%

---

## Risk Mitigation

### Technical Risks
1. **MCP protocol changes**: Pin SDK versions, monitor changelog
2. **Agent hallucinations**: Strict tool schemas, validation, testing
3. **Performance issues**: Load testing, caching, horizontal scaling
4. **Data consistency**: Transaction handling, rollback mechanisms

### Business Risks
1. **Migration complexity**: Phased rollout, backward compatibility
2. **Cost overruns**: Monitor Vertex AI usage, set budget alerts
3. **Learning curve**: Comprehensive documentation, training sessions

---

## Next Steps

**Immediate (Today)**:
1. ✅ Complete this roadmap document
2. 🔄 Fix Service Records table in Airtable
3. 🔄 Test walk-in flow
4. 🔄 Begin MCP server structure

**This Week**:
- Complete Phase 1 (bug fixes)
- Complete Phase 2 (MCP server)
- Begin Phase 3 (ADK agents)

**This Month**:
- Complete Phase 3 (ADK agents)
- Complete Phase 4 (advanced AI)
- Complete Phase 5 (testing & deployment)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Owner**: @stefanogebara
**Status**: 🚀 Ready for Implementation
