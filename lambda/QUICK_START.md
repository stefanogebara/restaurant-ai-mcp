# 🚀 AWS Lambda Deployment - Quick Start Guide

## TL;DR - Deploy in 5 Minutes

```bash
# 1. Install AWS CLI (if not installed)
# Windows: Download from https://aws.amazon.com/cli/
# Mac: brew install awscli
# Linux: See README.md

# 2. Configure AWS (one-time setup)
aws configure
# Enter your AWS Access Key ID and Secret Key

# 3. Deploy!
cd lambda
./deploy.sh
```

## What You'll Get

✅ XGBoost ML model running on AWS Lambda
✅ Public HTTPS API endpoint
✅ Automatic CORS configuration
✅ $0/month cost (AWS Free Tier)
✅ Sub-200ms response times
✅ Auto-scaling to millions of requests

## Next Steps After Deployment

The script will give you an API URL like:
```
https://abc123.lambda-url.us-east-1.on.aws/
```

### 1. Test It

```bash
# Health check
curl https://YOUR-URL-HERE/

# Make prediction
curl -X POST https://YOUR-URL-HERE/ \
  -H "Content-Type: application/json" \
  -d '{"reservation_date":"2025-11-06","party_size":2}'
```

### 2. Add to Vercel

Go to: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables

Add:
- **Key**: `ML_ENDPOINT_URL`
- **Value**: Your Lambda URL
- Click "Save"

### 3. Redeploy Vercel

```bash
git commit -m "Add Lambda ML endpoint"
git push
```

## Cost

**$0.00/month** - Your usage (3,000-6,000 predictions/month) is well within the AWS Free Tier permanent limit of 1 million requests/month.

## Need Help?

See `README.md` for detailed instructions and troubleshooting.

## Don't Have AWS Account Yet?

1. Go to https://aws.amazon.com/
2. Click "Create AWS Account"
3. Follow the signup (takes 5 minutes)
4. No charges - Free Tier covers everything!

---

**Ready?** Run `./deploy.sh` and you're done! 🎉
