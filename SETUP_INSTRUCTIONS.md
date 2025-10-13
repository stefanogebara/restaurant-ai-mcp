# Critical Setup Required - Service Records Table

## ⚠️ ACTION REQUIRED

The application **cannot function** without the Service Records table. You must create it manually.

## Step-by-Step Instructions (5 minutes)

### 1. Open Your Airtable Base
Go to: https://airtable.com/ and open your restaurant management base

### 2. Create New Table
Click **"+ Add or import"** → **"Create empty table"**

### 3. Name It
Change the table name to: **Service Records**

### 4. Configure Fields

Airtable creates a default field. Rename and configure each field:

#### Field 1: Service ID (Primary Field)
- **Name**: Service ID
- **Type**: Single line text
- Click the field name → rename to "Service ID"

#### Field 2: Reservation ID
- Click **"+"** to add field
- **Name**: Reservation ID
- **Type**: Single line text

#### Field 3: Customer Name
- Click **"+"** to add field
- **Name**: Customer Name
- **Type**: Single line text

#### Field 4: Customer Phone
- Click **"+"** to add field
- **Name**: Customer Phone
- **Type**: Phone number

#### Field 5: Party Size
- Click **"+"** to add field
- **Name**: Party Size
- **Type**: Number
- **Formatting**: Integer (0 decimal places)

#### Field 6: Table IDs
- Click **"+"** to add field
- **Name**: Table IDs
- **Type**: Single line text
- (This will store comma-separated table numbers like "4,5")

#### Field 7: Seated At
- Click **"+"** to add field
- **Name**: Seated At
- **Type**: Date
- **Format**: ISO (includes time)
- **Time zone**: GMT

#### Field 8: Estimated Departure
- Click **"+"** to add field
- **Name**: Estimated Departure
- **Type**: Date
- **Format**: ISO (includes time)
- **Time zone**: GMT

#### Field 9: Departed At
- Click **"+"** to add field
- **Name**: Departed At
- **Type**: Date
- **Format**: ISO (includes time)
- **Time zone**: GMT

#### Field 10: Special Requests
- Click **"+"** to add field
- **Name**: Special Requests
- **Type**: Long text

#### Field 11: Status
- Click **"+"** to add field
- **Name**: Status
- **Type**: Single select
- **Options**:
  - Active (green)
  - Completed (blue)
  - Cancelled (red)

### 5. Get Table ID

After creating the table:
1. Look at the URL in your browser
2. It will look like: `https://airtable.com/{BASE_ID}/{TABLE_ID}`
3. Copy the `{TABLE_ID}` part (starts with `tbl`, like `tblXXXXXXXXXXXX`)

### 6. Update Vercel Environment Variables

1. Go to: https://vercel.com/
2. Navigate to your project → **Settings** → **Environment Variables**
3. Add new variable:
   - **Name**: `SERVICE_RECORDS_TABLE_ID`
   - **Value**: `tblXXXXXXXXXXXX` (your table ID from step 5)
4. Make sure to add it to all environments (Production, Preview, Development)

### 7. Redeploy

After adding the environment variable:
- Vercel will automatically redeploy on next push, OR
- Go to **Deployments** → Click on latest → Click **"Redeploy"**

## Verification

After setup, run this to verify:

```bash
# This will test if the table is accessible
curl -s "https://api.airtable.com/v0/$AIRTABLE_BASE_ID/$SERVICE_RECORDS_TABLE_ID?maxRecords=1" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY"
```

Should return `{"records": []}` (empty array) instead of an error.

## Testing the Application

After setup:
1. Go to: https://restaurant-ai-mcp.vercel.app
2. Click **"+ Add Walk-in"**
3. Fill: Party Size: 4, Name: "Test", Phone: "555-0123"
4. Click **"Find Tables"** → Should show table 4
5. Click **"Confirm Seating"** → Should succeed!
6. Check Airtable → You should see a new record in Service Records

## Quick Reference

**Exact field names** (case-sensitive, must match exactly):
```
Service ID
Reservation ID
Customer Name
Customer Phone
Party Size
Table IDs
Seated At
Estimated Departure
Departed At
Special Requests
Status
```

## Troubleshooting

**Error: "Unknown field name: X"**
- Field name doesn't match exactly (check spelling and capitalization)

**Error: "NOT_FOUND"**
- Table ID is wrong or not set in Vercel environment variables

**Error: "INVALID_VALUE_FOR_COLUMN"**
- Field type is wrong (e.g., text field instead of number)

## Why Can't This Be Automated?

- Airtable requires manual table creation via web UI, OR
- A Personal Access Token with `schema.bases:write` scope
- Your current API key doesn't have schema modification permissions
- This is an Airtable security feature to prevent accidental schema changes

---

**Estimated time**: 5 minutes
**Current blocker**: This is the ONLY thing preventing the app from working
**Impact**: Walk-in seating, reservation check-in, service completion all blocked
