#!/bin/bash

# This script sets up the required Airtable tables for the restaurant management system
# Make sure to set these environment variables before running:
# - AIRTABLE_API_KEY
# - AIRTABLE_BASE_ID
# - TABLES_TABLE_ID

echo "🌱 Setting up Airtable tables..."
echo ""

# Step 1: Seed the Tables table
echo "📊 Step 1: Creating 12 restaurant tables..."
node scripts/seed-tables-direct.js

if [ $? -ne 0 ]; then
  echo "❌ Failed to create tables"
  exit 1
fi

echo ""
echo "✅ Tables created successfully!"
echo ""

# Step 2: Instructions for Service Records table
echo "📝 Step 2: Service Records Table Setup"
echo ""
echo "The Service Records table needs to be created manually in Airtable."
echo ""
echo "Please create a table named 'Service Records' with these fields:"
echo ""
echo "1. Service ID (Single line text)"
echo "2. Reservation ID (Single line text)"
echo "3. Customer Name (Single line text)"
echo "4. Customer Phone (Phone number)"
echo "5. Party Size (Number, integer)"
echo "6. Table IDs (Single line text) - Store as JSON array like [4,5]"
echo "7. Seated At (Date, ISO format)"
echo "8. Estimated Departure (Date, ISO format)"
echo "9. Departed At (Date, ISO format)"
echo "10. Special Requests (Long text)"
echo "11. Status (Single select: Active, Completed, Cancelled)"
echo ""
echo "After creating the table, add the table ID to your Vercel environment variables:"
echo "SERVICE_RECORDS_TABLE_ID=<your-table-id>"
echo ""
echo "Then redeploy the app for changes to take effect."
