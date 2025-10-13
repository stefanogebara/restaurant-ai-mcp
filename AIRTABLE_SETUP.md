# Airtable Setup Guide

## Current Issue

The application is failing with error: **"Unknown field name: 'Service ID'"**

This means the **Service Records table does not exist** in your Airtable base.

## Required Action: Create Service Records Table

### Option 1: Create via Airtable Web Interface (Recommended)

1. Go to your Airtable base: https://airtable.com/
2. Click "+ Add or import" → "Create empty table"
3. Name it: **Service Records**
4. Create these fields in exact order:

| Field Name | Field Type | Options/Notes |
|------------|------------|---------------|
| Service ID | Single line text | Primary field |
| Reservation ID | Single line text | Leave empty for walk-ins |
| Customer Name | Single line text | |
| Customer Phone | Phone number | |
| Party Size | Number | Precision: Integer (0 decimal places) |
| Table IDs | Single line text | Store as comma-separated: "4,5" |
| Seated At | Date | Format: ISO (2025-01-13T19:30:00.000Z) |
| Estimated Departure | Date | Format: ISO |
| Departed At | Date | Format: ISO, Leave empty initially |
| Special Requests | Long text | |
| Status | Single select | Options: Active, Completed, Cancelled |

5. After creating, copy the table ID from the URL:
   - URL will look like: `https://airtable.com/{BASE_ID}/{TABLE_ID}`
   - Copy the `{TABLE_ID}` part (starts with `tbl`)

6. Add to Vercel environment variables:
   - Go to: https://vercel.com/your-project/settings/environment-variables
   - Add: `SERVICE_RECORDS_TABLE_ID` = `tbl...` (your table ID)
   - Redeploy the application

### Option 2: Use Airtable API (If you have meta API access)

Run this script after setting your Airtable API key with meta permissions:

```bash
node scripts/create-service-records-table.js
```

## Alternative Solution: Use Table IDs as JSON Array

If you prefer, you can simplify the Table IDs field:

**Current approach** (simpler):
- Field Type: Single line text
- Value format: `"4,5,6"` or `"[4,5,6]"`
- Pros: No need to link records
- Cons: No referential integrity

**Alternative approach** (more robust):
- Field Type: Link to another record → Tables
- Links to: Tables table
- Pros: Proper relationships, can't reference non-existent tables
- Cons: Requires passing Airtable record IDs instead of table numbers

If you choose the alternative, you'll need to update the code to convert table numbers to Airtable record IDs before creating service records.

## Verification

After creating the Service Records table, test the walk-in flow:

1. Go to: https://restaurant-ai-mcp.vercel.app
2. Click "+ Add Walk-in"
3. Fill in: Party Size: 4, Name: "Test Customer", Phone: "555-0123"
4. Click "Find Tables" → Should show available tables
5. Click "Confirm Seating" → Should succeed without errors
6. Check Airtable - you should see a new record in Service Records table

## Current Status

✅ Tables table - Exists and populated with 12 tables (42 seats total)
✅ Reservations table - Exists (mentioned in previous conversations)
❌ Service Records table - **MISSING - needs to be created**

## Environment Variables Needed

Make sure these are set in Vercel:

```env
AIRTABLE_API_KEY=patXXXXXXXXXXXX
AIRTABLE_BASE_ID=appXXXXXXXXXXXX
TABLES_TABLE_ID=tblXXXXXXXXXXXX
RESERVATIONS_TABLE_ID=tblXXXXXXXXXXXX
SERVICE_RECORDS_TABLE_ID=tblXXXXXXXXXXXX  # ← Add this after creating table
RESTAURANT_INFO_TABLE_ID=tblXXXXXXXXXXXX
```

## Next Steps After Setup

Once the Service Records table is created and the environment variable is set:

1. Test walk-in customer flow (seating a party)
2. Test complete service flow (marking party as departed)
3. Test mark table clean flow
4. Test reservation check-in flow
5. Verify real-time dashboard updates
