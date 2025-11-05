#!/bin/bash
# AWS Lambda Deployment Script for XGBoost No-Show Prediction Model
# This script packages and deploys the ML model to AWS Lambda

set -e  # Exit on error

echo "🚀 Deploying XGBoost Model to AWS Lambda..."
echo ""

# Configuration
FUNCTION_NAME="restaurant-noshow-predictor"
REGION="us-east-1"  # Change if needed
RUNTIME="python3.12"
HANDLER="predict.lambda_handler"
MEMORY_SIZE=1024  # MB
TIMEOUT=30  # seconds

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check AWS CLI is installed
echo -e "${BLUE}Step 1: Checking AWS CLI...${NC}"
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed${NC}"
    echo "Install it from: https://aws.amazon.com/cli/"
    exit 1
fi
echo -e "${GREEN}✅ AWS CLI found${NC}"
echo ""

# Step 2: Check AWS credentials are configured
echo -e "${BLUE}Step 2: Checking AWS credentials...${NC}"
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✅ AWS credentials configured (Account: $AWS_ACCOUNT_ID)${NC}"
echo ""

# Step 3: Create deployment package
echo -e "${BLUE}Step 3: Creating deployment package...${NC}"
rm -rf package lambda-package.zip
mkdir -p package

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt -t package/ --platform manylinux2014_x86_64 --only-binary=:all:

# Copy Lambda function
cp predict.py package/

# Copy model files
echo "Copying model files..."
mkdir -p package/ml_models
cp ../ml_models/restaurant_noshow_xgboost.json package/ml_models/
cp ../ml_models/model_metadata.json package/ml_models/

# Create ZIP package
echo "Creating ZIP package..."
cd package
zip -r ../lambda-package.zip . -q
cd ..

PACKAGE_SIZE=$(du -h lambda-package.zip | cut -f1)
echo -e "${GREEN}✅ Package created: lambda-package.zip ($PACKAGE_SIZE)${NC}"
echo ""

# Step 4: Create or update Lambda function
echo -e "${BLUE}Step 4: Deploying to AWS Lambda...${NC}"

# Check if function exists
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION &> /dev/null; then
    echo "Function exists, updating code..."
    aws lambda update-function-code \
        --function-name $FUNCTION_NAME \
        --zip-file fileb://lambda-package.zip \
        --region $REGION > /dev/null

    echo "Updating function configuration..."
    aws lambda update-function-configuration \
        --function-name $FUNCTION_NAME \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --region $REGION > /dev/null

    echo -e "${GREEN}✅ Function updated${NC}"
else
    echo "Creating new function..."

    # Create IAM role if it doesn't exist
    ROLE_NAME="lambda-restaurant-ml-role"
    ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"

    if ! aws iam get-role --role-name $ROLE_NAME &> /dev/null; then
        echo "Creating IAM role..."

        # Create trust policy
        cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

        aws iam create-role \
            --role-name $ROLE_NAME \
            --assume-role-policy-document file://trust-policy.json > /dev/null

        # Attach basic Lambda execution policy
        aws iam attach-role-policy \
            --role-name $ROLE_NAME \
            --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

        echo "Waiting 10 seconds for IAM role to propagate..."
        sleep 10

        rm trust-policy.json
        echo -e "${GREEN}✅ IAM role created${NC}"
    fi

    # Create Lambda function
    aws lambda create-function \
        --function-name $FUNCTION_NAME \
        --runtime $RUNTIME \
        --role $ROLE_ARN \
        --handler $HANDLER \
        --zip-file fileb://lambda-package.zip \
        --memory-size $MEMORY_SIZE \
        --timeout $TIMEOUT \
        --region $REGION > /dev/null

    echo -e "${GREEN}✅ Function created${NC}"
fi

echo ""

# Step 5: Create or update API Gateway (Function URL)
echo -e "${BLUE}Step 5: Setting up public API endpoint...${NC}"

# Check if function URL already exists
FUNCTION_URL=$(aws lambda get-function-url-config --function-name $FUNCTION_NAME --region $REGION 2>/dev/null | jq -r '.FunctionUrl' || echo "")

if [ -z "$FUNCTION_URL" ]; then
    echo "Creating Function URL..."

    # Create function URL configuration
    FUNCTION_URL=$(aws lambda create-function-url-config \
        --function-name $FUNCTION_NAME \
        --auth-type NONE \
        --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST","OPTIONS"],"AllowHeaders":["Content-Type"]}' \
        --region $REGION | jq -r '.FunctionUrl')

    # Add permission for public access
    aws lambda add-permission \
        --function-name $FUNCTION_NAME \
        --statement-id FunctionURLAllowPublicAccess \
        --action lambda:InvokeFunctionUrl \
        --principal "*" \
        --function-url-auth-type NONE \
        --region $REGION > /dev/null

    echo -e "${GREEN}✅ Function URL created${NC}"
else
    echo -e "${GREEN}✅ Function URL already exists${NC}"
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}        🎉 DEPLOYMENT SUCCESSFUL! 🎉${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📍 Lambda Function:${NC} $FUNCTION_NAME"
echo -e "${YELLOW}🌍 Region:${NC} $REGION"
echo -e "${YELLOW}🔗 API Endpoint:${NC}"
echo -e "   ${BLUE}$FUNCTION_URL${NC}"
echo ""
echo -e "${YELLOW}Test your endpoint:${NC}"
echo -e "   ${BLUE}curl $FUNCTION_URL${NC}"
echo ""
echo -e "${YELLOW}Make a prediction:${NC}"
echo -e '   curl -X POST '"$FUNCTION_URL"' \\'
echo -e '     -H "Content-Type: application/json" \\'
echo -e '     -d '"'"'{"reservation_date":"2025-11-06","party_size":2}'"'"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Test the endpoint with the curl commands above"
echo "2. Update your Vercel app to use: $FUNCTION_URL"
echo "3. Set ML_ENDPOINT_URL in Vercel environment variables"
echo ""
echo -e "${YELLOW}💰 Cost estimate:${NC} $0/month (within AWS Free Tier)"
echo ""

# Cleanup
echo "Cleaning up temporary files..."
rm -rf package lambda-package.zip
echo -e "${GREEN}✅ Cleanup complete${NC}"
echo ""
echo "🚀 Deployment complete!"
