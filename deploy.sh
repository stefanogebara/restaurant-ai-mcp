#!/bin/bash

echo "🚀 Deploying Restaurant AI MCP Server to Vercel..."
echo ""
echo "Step 1: Installing dependencies..."
npm install

echo ""
echo "Step 2: Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Copy the production URL from above"
echo "2. Update ElevenLabs webhook URLs"
echo "3. Test all 6 endpoints"
