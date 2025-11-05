# AWS Lambda Deployment - XGBoost No-Show Prediction Model

This guide will help you deploy the XGBoost ML model to AWS Lambda (100% FREE with AWS Free Tier).

## 📋 Prerequisites

1. **AWS Account** (free to create)
2. **AWS CLI** installed
3. **Python 3.12** installed
4. **zip** command available

## 🚀 Quick Start (5 Minutes)

### Step 1: Create AWS Account (if you don't have one)

1. Go to https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Follow the signup process (requires credit card for verification, but you won't be charged)
4. **Important**: You get 12 months of free tier + permanent free services

### Step 2: Install AWS CLI

**Windows:**
```bash
# Download from: https://aws.amazon.com/cli/
# Or use:
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

**macOS:**
```bash
brew install awscli
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### Step 3: Configure AWS CLI

```bash
aws configure
```

You'll need:
- **AWS Access Key ID**: Get from AWS Console → IAM → Users → Your User → Security Credentials
- **AWS Secret Access Key**: Get when you create the access key (save it!)
- **Default region**: `us-east-1` (recommended)
- **Default output format**: `json`

**How to get AWS Access Keys:**
1. Go to AWS Console: https://console.aws.amazon.com/
2. Click your name (top right) → Security credentials
3. Scroll to "Access keys" → "Create access key"
4. Choose "Command Line Interface (CLI)"
5. Save the Access Key ID and Secret Access Key

### Step 4: Deploy to Lambda

```bash
cd lambda
chmod +x deploy.sh
./deploy.sh
```

That's it! The script will:
- ✅ Create deployment package with XGBoost + NumPy
- ✅ Upload model file (1.1MB)
- ✅ Create Lambda function
- ✅ Set up public API endpoint
- ✅ Configure CORS for your Vercel app

## 🎯 After Deployment

The script will output your API endpoint URL. It looks like:
```
https://abc123xyz.lambda-url.us-east-1.on.aws/
```

### Test Your Endpoint

**Health Check:**
```bash
curl https://YOUR-LAMBDA-URL.lambda-url.us-east-1.on.aws/
```

**Make a Prediction:**
```bash
curl -X POST https://YOUR-LAMBDA-URL.lambda-url.us-east-1.on.aws/ \
  -H "Content-Type: application/json" \
  -d '{"reservation_date":"2025-11-06","party_size":2}'
```

Expected response:
```json
{
  "success": true,
  "prediction": {
    "risk_score": 32.5,
    "risk_level": "MEDIUM",
    "probability": 0.325,
    "will_show": true
  },
  "recommendations": [
    "📧 Send email reminder 24h before",
    "Enable SMS reminder option",
    "Standard confirmation protocol"
  ],
  "model_version": "v2.0-xgboost-hotel-trained"
}
```

## 🔗 Integrate with Vercel App

### Option 1: Environment Variable (Recommended)

1. Go to your Vercel project: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables

2. Add new variable:
   - **Key**: `ML_ENDPOINT_URL`
   - **Value**: `https://YOUR-LAMBDA-URL.lambda-url.us-east-1.on.aws/`
   - **Environment**: Production, Preview, Development

3. Redeploy your Vercel app

### Option 2: Update Code Directly

Update `api/predictive-analytics.js`:

```javascript
// At the top of the file
const ML_ENDPOINT_URL = process.env.ML_ENDPOINT_URL || 'https://YOUR-LAMBDA-URL.lambda-url.us-east-1.on.aws/';

// In your prediction function
async function getPrediction(reservationData) {
  const response = await fetch(ML_ENDPOINT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reservationData)
  });
  return response.json();
}
```

## 💰 Cost Breakdown (FREE!)

### AWS Lambda Free Tier (Permanent):
- ✅ **1 million requests/month** FREE (forever)
- ✅ **400,000 GB-seconds compute** FREE (forever)

### Your Expected Usage:
- **Restaurant with 100-200 reservations/day**
- **~3,000-6,000 predictions/month**
- **Uses < 1% of free tier** ✅

### Estimated Monthly Cost:
- **Month 1-12**: $0.00 (free tier)
- **After 12 months**: $0.00 (still within permanent free tier)

**You'll only pay if you exceed 1 million requests/month!**

## 🔧 Troubleshooting

### Error: "AWS CLI not found"
```bash
# Install AWS CLI first (see Step 2)
```

### Error: "Unable to locate credentials"
```bash
# Configure AWS credentials (see Step 3)
aws configure
```

### Error: "AccessDenied"
```bash
# Your IAM user needs these permissions:
# - lambda:CreateFunction
# - lambda:UpdateFunctionCode
# - iam:CreateRole
# - iam:AttachRolePolicy

# Ask your AWS admin to add the "AdministratorAccess" policy to your user
```

### Error: "Function package size exceeds limit"
```bash
# The script uses manylinux wheels which are optimized for Lambda
# If you still get this error, the deploy script will automatically
# use Lambda Layers for dependencies
```

## 📊 Monitoring

### View Logs:
```bash
aws logs tail /aws/lambda/restaurant-noshow-predictor --follow
```

### Check Function Status:
```bash
aws lambda get-function --function-name restaurant-noshow-predictor
```

### View Metrics (CloudWatch):
1. Go to AWS Console → CloudWatch → Metrics
2. Select "Lambda" → "By Function Name"
3. Select `restaurant-noshow-predictor`
4. View invocations, duration, errors

## 🔄 Updating the Model

If you retrain the model:

1. Replace `ml_models/restaurant_noshow_xgboost.json` with new model
2. Run deployment script again:
```bash
./deploy.sh
```

The script will automatically update the Lambda function with the new model.

## 🗑️ Cleanup (Delete Everything)

If you want to remove the Lambda function:

```bash
# Delete function
aws lambda delete-function --function-name restaurant-noshow-predictor

# Delete IAM role
aws iam detach-role-policy \
  --role-name lambda-restaurant-ml-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam delete-role --role-name lambda-restaurant-ml-role
```

## 📚 Additional Resources

- [AWS Lambda Free Tier Details](https://aws.amazon.com/lambda/pricing/)
- [AWS CLI Installation Guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [Lambda Function URLs](https://docs.aws.amazon.com/lambda/latest/dg/lambda-urls.html)
- [XGBoost on AWS Lambda](https://aws.amazon.com/blogs/machine-learning/)

## ✅ Success Checklist

- [ ] AWS account created
- [ ] AWS CLI installed and configured
- [ ] Deployment script executed successfully
- [ ] Lambda endpoint URL received
- [ ] Health check test passed
- [ ] Prediction test passed
- [ ] Vercel environment variable updated
- [ ] Vercel app redeployed
- [ ] End-to-end test completed

## 🎉 You're Done!

Your XGBoost model is now running on AWS Lambda with:
- ⚡ Sub-200ms response times
- 🌍 Global CDN distribution
- 📈 Auto-scaling to millions of requests
- 💰 $0/month cost (free tier)
- 🔒 Secure HTTPS endpoint
- 🚀 Production-ready infrastructure

If you have any questions, check the troubleshooting section or AWS documentation!
