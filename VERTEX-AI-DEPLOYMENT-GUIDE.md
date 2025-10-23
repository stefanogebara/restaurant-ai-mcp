# Vertex AI Agent Deployment Guide
**Project**: Restaurant AI MCP - ADK Multi-Agent System
**Date**: October 23, 2025
**Status**: Ready for Deployment

## 🎯 Overview

This guide walks through deploying the 3 specialized ADK agents to Google Vertex AI Agent Builder, integrating RAG knowledge base and Gemini 2.5 predictive analytics.

## 📋 Prerequisites

### Required Accounts & Tools
- ✅ Google Cloud Platform account with billing enabled
- ✅ Vertex AI API enabled in GCP project
- ✅ `gcloud` CLI installed and authenticated
- ✅ Node.js 18+ and npm installed
- ✅ Restaurant AI MCP codebase (current directory)

### Environment Variables Needed
```env
# Google Cloud
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json

# Vertex AI
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_AGENT_BUILDER_DATASTORE_ID=your-datastore-id

# Anthropic/OpenAI (for local testing before deployment)
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key
```

## 🏗️ Architecture

### Agents to Deploy
1. **Reservation Agent** - Customer-facing reservation management
2. **Customer Service Agent** - Handles inquiries with RAG knowledge base
3. **Host Dashboard Agent** - Floor management and seating

### Supporting Services
- **RAG Service** (`adk-agents/src/services/rag-service.ts`)
- **Predictive Analytics** (`adk-agents/src/services/predictive-analytics.ts`)
- **Orchestrator** (`adk-agents/src/orchestrator.ts`)

## 📁 Project Structure

```
adk-agents/
├── src/
│   ├── orchestrator.ts                 # Multi-agent coordinator
│   ├── prompts/
│   │   ├── reservation-agent.txt       # Agent 1 prompt
│   │   ├── customer-service-agent.txt  # Agent 2 prompt
│   │   └── host-agent.txt              # Agent 3 prompt
│   └── services/
│       ├── rag-service.ts              # Knowledge retrieval
│       └── predictive-analytics.ts     # Gemini forecasting
├── knowledge-base/
│   ├── restaurant-policies.md          # 2,500 words
│   ├── menu-information.md             # 3,000 words
│   ├── faq.md                          # 2,500 words
│   ├── location-services.md            # 1,500 words
│   └── README.md
├── dist/                               # Compiled JavaScript
├── package.json
└── tsconfig.json
```

## 🚀 Deployment Steps

### Step 1: GCP Project Setup

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable aiplatform.googleapis.com
gcloud services enable discoveryengine.googleapis.com
gcloud services enable vertexai.googleapis.com
gcloud services enable storage.googleapis.com
```

### Step 2: Create Service Account

```bash
# Create service account for agents
gcloud iam service-accounts create restaurant-ai-agents \
    --display-name="Restaurant AI ADK Agents"

# Grant necessary permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:restaurant-ai-agents@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/aiplatform.user"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:restaurant-ai-agents@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/discoveryengine.editor"

# Create and download key
gcloud iam service-accounts keys create ./gcp-credentials.json \
    --iam-account=restaurant-ai-agents@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### Step 3: Upload Knowledge Base to Vertex AI Search

```bash
# Create a Cloud Storage bucket for knowledge base
gsutil mb -l us-central1 gs://restaurant-ai-knowledge-base

# Upload knowledge base files
gsutil -m cp -r adk-agents/knowledge-base/* gs://restaurant-ai-knowledge-base/

# Create a Vertex AI Search datastore
gcloud alpha discovery-engine datastores create restaurant-kb \
    --location=global \
    --industry-vertical=GENERIC \
    --solution-type=SOLUTION_TYPE_SEARCH \
    --content-config=CONTENT_REQUIRED

# Import documents into datastore
gcloud alpha discovery-engine datastores import-documents restaurant-kb \
    --location=global \
    --gcs-uri=gs://restaurant-ai-knowledge-base/*.md \
    --data-schema=document
```

### Step 4: Deploy Agent 1 - Reservation Agent

```bash
# Create agent in Vertex AI Agent Builder
gcloud alpha discovery-engine engines create reservation-agent \
    --display-name="Reservation Agent" \
    --location=global \
    --industry-vertical=GENERIC \
    --solution-type=SOLUTION_TYPE_CHAT

# Configure agent with prompt
cat adk-agents/src/prompts/reservation-agent.txt | \
  gcloud alpha discovery-engine engines update reservation-agent \
    --location=global \
    --prompt-stdin

# Link datastore to agent
gcloud alpha discovery-engine engines link-datastores reservation-agent \
    --location=global \
    --datastore-ids=restaurant-kb
```

### Step 5: Deploy Agent 2 - Customer Service Agent

```bash
# Create customer service agent
gcloud alpha discovery-engine engines create customer-service-agent \
    --display-name="Customer Service Agent" \
    --location=global \
    --industry-vertical=GENERIC \
    --solution-type=SOLUTION_TYPE_CHAT

# Configure with RAG-enabled prompt
cat adk-agents/src/prompts/customer-service-agent.txt | \
  gcloud alpha discovery-engine engines update customer-service-agent \
    --location=global \
    --prompt-stdin

# Link knowledge base
gcloud alpha discovery-engine engines link-datastores customer-service-agent \
    --location=global \
    --datastore-ids=restaurant-kb
```

### Step 6: Deploy Agent 3 - Host Dashboard Agent

```bash
# Create host agent
gcloud alpha discovery-engine engines create host-agent \
    --display-name="Host Dashboard Agent" \
    --location=global \
    --industry-vertical=GENERIC \
    --solution-type=SOLUTION_TYPE_CHAT

# Configure prompt
cat adk-agents/src/prompts/host-agent.txt | \
  gcloud alpha discovery-engine engines update host-agent \
    --location=global \
    --prompt-stdin
```

### Step 7: Deploy Supporting Services

Create a Cloud Function for the orchestrator:

```bash
# Package the orchestrator and services
cd adk-agents
npm run build

# Deploy orchestrator as Cloud Function
gcloud functions deploy restaurant-orchestrator \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-central1 \
    --source=. \
    --entry-point=orchestrator \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,VERTEX_AI_LOCATION=us-central1"
```

### Step 8: Configure Agent-to-Agent (A2A) Communication

Update each agent's configuration to enable A2A protocol:

```bash
# Enable A2A for Reservation Agent
gcloud alpha discovery-engine engines update reservation-agent \
    --location=global \
    --enable-agent-to-agent=true \
    --allowed-agent-ids=customer-service-agent,host-agent

# Enable A2A for Customer Service Agent
gcloud alpha discovery-engine engines update customer-service-agent \
    --location=global \
    --enable-agent-to-agent=true \
    --allowed-agent-ids=reservation-agent,host-agent

# Enable A2A for Host Agent
gcloud alpha discovery-engine engines update host-agent \
    --location=global \
    --enable-agent-to-agent=true \
    --allowed-agent-ids=reservation-agent,customer-service-agent
```

### Step 9: Deploy Predictive Analytics Service

Deploy Gemini 2.5-powered analytics as a separate Cloud Function:

```bash
# Deploy predictive analytics service
gcloud functions deploy predictive-analytics \
    --gen2 \
    --runtime=nodejs20 \
    --region=us-central1 \
    --source=. \
    --entry-point=predictiveAnalytics \
    --trigger-http \
    --allow-unauthenticated \
    --set-env-vars="GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID" \
    --memory=512MB \
    --timeout=60s
```

## 🧪 Testing Deployed Agents

### Test Reservation Agent

```bash
# Get agent endpoint
RESERVATION_AGENT_URL=$(gcloud alpha discovery-engine engines describe reservation-agent \
    --location=global \
    --format="value(endpoint)")

# Test query
curl -X POST "$RESERVATION_AGENT_URL/query" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I need a reservation for 4 people tomorrow at 7 PM",
    "sessionId": "test-session-123"
  }'
```

### Test Customer Service Agent

```bash
# Get endpoint
CS_AGENT_URL=$(gcloud alpha discovery-engine engines describe customer-service-agent \
    --location=global \
    --format="value(endpoint)")

# Test RAG query
curl -X POST "$CS_AGENT_URL/query" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are your gluten-free options?",
    "sessionId": "test-session-456"
  }'
```

### Test Host Agent

```bash
# Get endpoint
HOST_AGENT_URL=$(gcloud alpha discovery-engine engines describe host-agent \
    --location=global \
    --format="value(endpoint)")

# Test dashboard query
curl -X POST "$HOST_AGENT_URL/query" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Show me current table status and upcoming reservations",
    "sessionId": "test-session-789"
  }'
```

### Test A2A Communication

```bash
# Test agent handoff
curl -X POST "$RESERVATION_AGENT_URL/query" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "I have a reservation but need to know your cancellation policy",
    "sessionId": "test-a2a-123"
  }'

# Should trigger handoff to Customer Service Agent
```

## 🔗 Integration with MCP Server

Update your application to use the deployed agents:

```javascript
// api/services/vertex-ai-agents.js
import { DiscoveryEngineClient } from '@google-cloud/discoveryengine';

const client = new DiscoveryEngineClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export async function queryReservationAgent(query, sessionId) {
  const request = {
    servingConfig: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/global/collections/default_collection/engines/reservation-agent/servingConfigs/default_config`,
    query: {
      text: query,
    },
    session: sessionId,
  };

  const [response] = await client.converse(request);
  return response;
}
```

## 📊 Monitoring & Observability

### View Agent Logs

```bash
# View Reservation Agent logs
gcloud logging read "resource.type=aiplatform.googleapis.com/Agent AND resource.labels.agent_id=reservation-agent" \
    --limit=50 \
    --format=json

# View all agent interactions
gcloud logging read "resource.type=aiplatform.googleapis.com/Agent" \
    --limit=100 \
    --format=json
```

### Monitor Agent Performance

```bash
# Check agent metrics
gcloud alpha discovery-engine engines get-metrics reservation-agent \
    --location=global \
    --start-time="2025-10-23T00:00:00Z" \
    --end-time="2025-10-23T23:59:59Z"
```

### Set Up Alerts

```bash
# Create alert for high error rate
gcloud alpha monitoring policies create \
    --notification-channels=CHANNEL_ID \
    --display-name="Agent Error Rate High" \
    --condition-display-name="Error rate > 5%" \
    --condition-threshold-value=0.05 \
    --condition-threshold-duration=300s
```

## 💰 Cost Estimation

### Monthly Costs (Estimated)
- **Vertex AI Agent Builder**: $0.0025 per request
  - 10,000 requests/month = **$25/month**
- **Vertex AI Search (RAG)**: $0.50 per 1000 queries
  - 5,000 queries/month = **$2.50/month**
- **Gemini 2.5 Pro**: $0.0035 per 1K characters
  - 100K characters/month = **$0.35/month**
- **Cloud Functions**: $0.40 per million invocations
  - 50K invocations/month = **$0.02/month**
- **Cloud Storage**: $0.02 per GB/month
  - 1 GB = **$0.02/month**

**Total Estimated**: **~$28/month** for moderate usage

## 🚨 Troubleshooting

### Common Issues

**Issue**: `Permission denied` errors
**Fix**: Ensure service account has `roles/aiplatform.user` and `roles/discoveryengine.editor`

**Issue**: Knowledge base not responding
**Fix**: Check datastore import status:
```bash
gcloud alpha discovery-engine operations list --location=global
```

**Issue**: Agent timeout
**Fix**: Increase function timeout:
```bash
gcloud functions update restaurant-orchestrator --timeout=120s
```

**Issue**: A2A not working
**Fix**: Verify agent IDs in allowed list:
```bash
gcloud alpha discovery-engine engines describe reservation-agent --location=global
```

## 📚 Additional Resources

- [Vertex AI Agent Builder Docs](https://cloud.google.com/generative-ai-app-builder/docs/agent-intro)
- [Vertex AI Search & RAG](https://cloud.google.com/generative-ai-app-builder/docs/enterprise-search-introduction)
- [Agent-to-Agent Protocol](https://cloud.google.com/generative-ai-app-builder/docs/agent-to-agent)
- [Gemini API Reference](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini)

## ✅ Deployment Checklist

- [ ] GCP project created with billing enabled
- [ ] Vertex AI APIs enabled
- [ ] Service account created with permissions
- [ ] Knowledge base uploaded to Cloud Storage
- [ ] Datastore created and documents imported
- [ ] Agent 1 (Reservation) deployed
- [ ] Agent 2 (Customer Service) deployed
- [ ] Agent 3 (Host Dashboard) deployed
- [ ] Orchestrator Cloud Function deployed
- [ ] Predictive Analytics Function deployed
- [ ] A2A communication configured
- [ ] All agents tested individually
- [ ] A2A handoffs tested
- [ ] Monitoring and alerts configured
- [ ] Integration with MCP server complete
- [ ] Documentation updated with agent endpoints

---

**Next Steps After Deployment**:
1. Test all 3 agents with real queries
2. Monitor agent trajectories and performance
3. Fine-tune prompts based on user feedback
4. Implement agent observability dashboard
5. Add rate limiting and caching
6. Scale based on usage patterns

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
