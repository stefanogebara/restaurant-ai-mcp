# Google Cloud Platform Setup for Restaurant AI MCP
**Status**: Step-by-step guide for Vertex AI and Gemini 2.5 Pro integration

---

## Phase 0: Google Cloud Setup (Estimated Time: 30-45 minutes)

### Prerequisites
- Google account (personal or work)
- Credit card (for GCP billing, free tier available)

### Step 1: Create/Access Google Cloud Project (10 min)

1. **Go to Google Cloud Console**
   - Navigate to: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create New Project** (or select existing)
   - Click dropdown at top: "Select a project"
   - Click "NEW PROJECT"
   - Project name: `restaurant-ai-production`
   - Organization: (leave blank if personal)
   - Location: (leave as default)
   - Click "CREATE"
   - Wait for project creation (~30 seconds)

3. **Note Your Project ID**
   - Format: `restaurant-ai-production-XXXXXX`
   - You'll need this for environment variables

### Step 2: Enable Required APIs (5 min)

1. **Enable Vertex AI API**
   - In Cloud Console, go to: APIs & Services > Library
   - Search for: "Vertex AI API"
   - Click "Vertex AI API"
   - Click "ENABLE"
   - Wait for activation (~30 seconds)

2. **Enable Generative AI API**
   - Search for: "Generative Language API"
   - Click and ENABLE
   
3. **Enable Cloud Run API** (for agent deployment)
   - Search for: "Cloud Run API"
   - Click and ENABLE

### Step 3: Set Up Billing (5 min)

⚠️ **IMPORTANT**: Set budget alerts to avoid unexpected charges

1. **Link Billing Account**
   - Go to: Billing > Link a billing account
   - Create new billing account or use existing
   - Add credit card (required even for free tier)

2. **Set Budget Alerts**
   - Go to: Billing > Budgets & alerts
   - Click "CREATE BUDGET"
   - Budget name: "Restaurant AI Monthly"
   - Projects: Select your project
   - Budget amount: $100 USD per month (adjust as needed)
   - Threshold rules:
     * Alert at 50% ($50)
     * Alert at 90% ($90)
     * Alert at 100% ($100)
   - Set alert email recipients
   - Click "FINISH"

### Step 4: Create Service Account (10 min)

1. **Navigate to IAM & Admin**
   - Go to: IAM & Admin > Service Accounts
   - Click "CREATE SERVICE ACCOUNT"

2. **Service Account Details**
   - Service account name: `restaurant-ai-agent`
   - Service account ID: `restaurant-ai-agent` (auto-filled)
   - Description: "Service account for Restaurant AI MCP with Vertex AI access"
   - Click "CREATE AND CONTINUE"

3. **Grant Permissions** (CRITICAL)
   - Click "Select a role"
   - Add these roles:
     1. **Vertex AI User** (required for Gemini)
        - Type: "Vertex AI User"
        - Select it
        - Click "ADD ANOTHER ROLE"
     2. **Service Account Token Creator** (for authentication)
        - Type: "Service Account Token Creator"
        - Select it
   - Click "CONTINUE"

4. **Skip Grant Users Access** (optional step)
   - Click "DONE"

### Step 5: Generate JSON Credentials (5 min)

1. **Find Your Service Account**
   - You should see `restaurant-ai-agent@YOUR-PROJECT-ID.iam.gserviceaccount.com`
   - Click on it

2. **Create Key**
   - Go to "KEYS" tab
   - Click "ADD KEY" > "Create new key"
   - Select "JSON" format
   - Click "CREATE"
   - **File downloads automatically** as `restaurant-ai-production-XXXXXX.json`

3. **Save Credentials Securely**
   - Move the downloaded JSON file to your project:
     ```bash
     # Move from Downloads to project root
     mv ~/Downloads/restaurant-ai-production-*.json /c/Users/stefa/restaurant-ai-mcp/gcp-credentials.json
     ```
   - ⚠️ **NEVER commit this file to Git!**

### Step 6: Update .env File (5 min)

Add these variables to `/c/Users/stefa/restaurant-ai-mcp/.env`:

```env
# Google Cloud / Vertex AI Configuration
GOOGLE_CLOUD_PROJECT=restaurant-ai-production-XXXXXX
VERTEX_AI_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json

# Gemini Model Configuration
GEMINI_MODEL=gemini-2.0-flash-exp
```

**Replace** `restaurant-ai-production-XXXXXX` with your actual project ID from Step 1.

### Step 7: Update .gitignore (2 min)

Add to `.gitignore`:
```
# Google Cloud credentials
gcp-credentials.json
*-credentials.json
*.gcp.json
```

### Step 8: Add to Vercel Environment Variables (5 min)

1. **Go to Vercel Dashboard**
   - Navigate to: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables

2. **Add Variables**
   - Name: `GOOGLE_CLOUD_PROJECT`
   - Value: Your project ID
   - Environments: Production, Preview, Development
   - Click "Save"

3. **Add Credentials JSON**
   - Name: `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   - Value: Paste entire contents of `gcp-credentials.json` file
   - Environments: Production, Preview, Development
   - Click "Save"

4. **Add Location**
   - Name: `VERTEX_AI_LOCATION`
   - Value: `us-central1`
   - Environments: All
   - Click "Save"

5. **Redeploy**
   - Go to Deployments
   - Click "..." on latest deployment
   - Click "Redeploy"

---

## Testing Your Setup

### Test 1: Verify Credentials Locally

```bash
cd /c/Users/stefa/restaurant-ai-mcp

# Test if credentials are valid
node -e "console.log(require('./gcp-credentials.json').project_id)"
# Should output: restaurant-ai-production-XXXXXX
```

### Test 2: Test Gemini Connection

Create `test-gemini.js`:
```javascript
const { VertexAI } = require('@google-cloud/vertexai');

const projectId = process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.VERTEX_AI_LOCATION || 'us-central1';

const vertexAI = new VertexAI({
  project: projectId,
  location: location,
});

const model = vertexAI.getGenerativeModel({
  model: 'gemini-2.0-flash-exp',
});

async function testGemini() {
  try {
    const result = await model.generateContent('Hello, Gemini! This is a test from Restaurant AI MCP.');
    const response = result.response;
    console.log('✅ Gemini connection successful!');
    console.log('Response:', response.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error('❌ Gemini connection failed:', error.message);
  }
}

testGemini();
```

Run test:
```bash
npm install @google-cloud/vertexai
node test-gemini.js
```

Expected output:
```
✅ Gemini connection successful!
Response: Hello! This is Gemini. I'm ready to help with your Restaurant AI MCP. How can I assist you today?
```

---

## Cost Estimation

### Gemini 2.0 Flash (Experimental) Pricing
- Input: $0.075 per 1M tokens
- Output: $0.30 per 1M tokens

### Expected Monthly Costs (Restaurant with 100 reservations/day)
- **Predictive Analytics**: ~1M tokens/month = $0.38/month
- **RAG Queries**: ~500K tokens/month = $0.19/month
- **Agent Operations**: ~2M tokens/month = $0.75/month
- **Total Estimated**: $1-2/month for AI

⚠️ **Free Tier**: First $300 in credits for 90 days

---

## Troubleshooting

### Error: "Permission denied"
**Solution**: Go back to Step 4 and ensure "Vertex AI User" role is assigned

### Error: "API not enabled"
**Solution**: Go to Step 2 and enable all 3 APIs

### Error: "Invalid credentials"
**Solution**: Re-download JSON key from Step 5

### Error: "Quota exceeded"
**Solution**: Check Quotas page, request increase if needed

---

## Next Steps

After completing this setup:
1. ✅ Test Gemini connection (above)
2. ✅ Update todo list to mark this complete
3. → Move to MCP Inspector testing
4. → Test RAG service with Gemini
5. → Test predictive analytics

---

**Setup Complete!** You now have:
- ✅ Google Cloud project created
- ✅ Vertex AI API enabled
- ✅ Service account with proper permissions
- ✅ JSON credentials downloaded and secured
- ✅ Environment variables configured
- ✅ Vercel deployment updated

**Estimated Cost**: $1-2/month for AI operations

