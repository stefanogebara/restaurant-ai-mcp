# Quick GCP Setup Guide (5 Minutes)

## Project Info
- **Project ID**: twinme-473216
- **Project Number**: 298873888709

## Step 1: Enable Required APIs (2 minutes)

Click these links to enable each API (they'll open in your Google Cloud Console):

1. **Vertex AI API** (Required for Gemini 2.5)
   https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=twinme-473216

2. **Generative Language API** (Required for Gemini models)
   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=twinme-473216

3. **Cloud Run API** (For serverless deployment)
   https://console.cloud.google.com/apis/library/run.googleapis.com?project=twinme-473216

**For each link**: Click "ENABLE" button → Wait ~10 seconds → Move to next

## Step 2: Create Service Account (3 minutes)

1. **Go to Service Accounts page**:
   https://console.cloud.google.com/iam-admin/serviceaccounts?project=twinme-473216

2. **Click "CREATE SERVICE ACCOUNT"**

3. **Fill in details**:
   - Service account name: `restaurant-ai-agent`
   - Service account ID: (auto-fills to `restaurant-ai-agent`)
   - Description: `Service account for restaurant AI predictive analytics`
   - Click "CREATE AND CONTINUE"

4. **Grant roles** (click "Add Another Role" for each):
   - Role 1: `Vertex AI User`
   - Role 2: `Service Account Token Creator`
   - Click "CONTINUE"

5. **Skip the 3rd step** (Grant users access)
   - Click "DONE"

6. **Generate JSON Key**:
   - Click on the newly created `restaurant-ai-agent@twinme-473216.iam.gserviceaccount.com`
   - Go to "KEYS" tab
   - Click "ADD KEY" → "Create new key"
   - Select "JSON"
   - Click "CREATE"
   - JSON file downloads automatically

7. **Save the JSON file**:
   - Move the downloaded JSON file to: `C:\Users\stefa\restaurant-ai-mcp\gcp-credentials.json`

## Step 3: Update Environment Variables

The .env file will be automatically updated once you place the credentials file.

## Verification

Run this command to verify setup:
```bash
node -e "console.log(require('./gcp-credentials.json').project_id)"
```

Should output: `twinme-473216`

---

**Total Time**: ~5 minutes
**Next Step**: Update .env file with GCP configuration
