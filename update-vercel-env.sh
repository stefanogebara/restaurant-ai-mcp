#!/bin/bash

# Update Vercel Environment Variables with Correct Airtable Table IDs
# This fixes the calendar not showing and dashboard stats issues

echo "🔧 Updating Vercel environment variables with correct Airtable table IDs..."
echo ""

# Airtable Table IDs (from CLAUDE.md)
RESERVATIONS_TABLE_ID="tbloL2huXFYQluomn"
RESTAURANT_INFO_TABLE_ID="tblI0DfPZrZbLC8fz"
TABLES_TABLE_ID="tbl0r7fkhuoasis56"
SERVICE_RECORDS_TABLE_ID="tblEEHaoicXQA7NcL"
MENU_ITEMS_TABLE_ID="tblEcqE5b5kSYzlaf"

# Remove old variables (if they exist)
echo "📋 Step 1: Removing old environment variables..."
vercel env rm RESERVATIONS_TABLE_ID production -y 2>/dev/null || echo "  ℹ️  RESERVATIONS_TABLE_ID not found (will create new)"
vercel env rm RESTAURANT_INFO_TABLE_ID production -y 2>/dev/null || echo "  ℹ️  RESTAURANT_INFO_TABLE_ID not found (will create new)"
vercel env rm TABLES_TABLE_ID production -y 2>/dev/null || echo "  ℹ️  TABLES_TABLE_ID not found (will create new)"
vercel env rm SERVICE_RECORDS_TABLE_ID production -y 2>/dev/null || echo "  ℹ️  SERVICE_RECORDS_TABLE_ID not found (will create new)"
vercel env rm MENU_ITEMS_TABLE_ID production -y 2>/dev/null || echo "  ℹ️  MENU_ITEMS_TABLE_ID not found (will create new)"

echo ""
echo "✅ Step 2: Adding correct environment variables..."

# Add new variables
echo "$RESERVATIONS_TABLE_ID" | vercel env add RESERVATIONS_TABLE_ID production
echo "  ✓ RESERVATIONS_TABLE_ID=$RESERVATIONS_TABLE_ID"

echo "$RESTAURANT_INFO_TABLE_ID" | vercel env add RESTAURANT_INFO_TABLE_ID production
echo "  ✓ RESTAURANT_INFO_TABLE_ID=$RESTAURANT_INFO_TABLE_ID"

echo "$TABLES_TABLE_ID" | vercel env add TABLES_TABLE_ID production
echo "  ✓ TABLES_TABLE_ID=$TABLES_TABLE_ID"

echo "$SERVICE_RECORDS_TABLE_ID" | vercel env add SERVICE_RECORDS_TABLE_ID production
echo "  ✓ SERVICE_RECORDS_TABLE_ID=$SERVICE_RECORDS_TABLE_ID"

echo "$MENU_ITEMS_TABLE_ID" | vercel env add MENU_ITEMS_TABLE_ID production
echo "  ✓ MENU_ITEMS_TABLE_ID=$MENU_ITEMS_TABLE_ID"

echo ""
echo "🚀 Step 3: Redeploying to production..."
vercel --prod

echo ""
echo "✅ Done! Environment variables updated and redeploying..."
echo ""
echo "📊 What this fixes:"
echo "  1. Calendar will now show Jonas reservation (Oct 19, 8PM)"
echo "  2. Dashboard stats will count manually occupied tables"
echo "  3. All future reservations will be visible (not just 2-hour window)"
echo ""
echo "⏳ Wait 30-60 seconds for deployment, then test:"
echo "   https://restaurant-ai-mcp.vercel.app/host-dashboard"
echo ""
