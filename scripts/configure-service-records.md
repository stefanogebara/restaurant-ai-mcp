# Airtable Service Records Table Configuration Script

## Critical: Service Records Table Setup

The Service Records table (`tblEEHaoicXQA7NcL`) is BLOCKING the walk-in flow. It needs all 11 fields configured.

## 🚨 Current Status: 3/11 Fields Configured

**Configured:**
- Service ID
- Customer Name
- Party Size

**Missing (8 fields):**
- Reservation ID
- Customer Phone
- Table IDs
- Seated At
- Estimated Departure
- Departed At
- Special Requests
- Status

## 📋 Step-by-Step Configuration

### Access Airtable

1. Go to: https://airtable.com/appm7zo5vOf3c3rqm/tblEEHaoicXQA7NcL
2. Login with your Airtable account
3. Click on the Service Records table

### Add Missing Fields

Click "+ Add Field" button and add each field below:

#### Field 1: Reservation ID
- **Field Type**: Single line text
- **Field Name**: Reservation ID
- **Description**: Optional - links to reservation if party is checking in
- **Options**: None

#### Field 2: Customer Phone
- **Field Type**: Phone number
- **Field Name**: Customer Phone
- **Format**: Any format
- **Required**: No (for flexibility)

#### Field 3: Table IDs
**Option A (Recommended)**: Multiple select
- **Field Type**: Multiple select
- **Field Name**: Table IDs
- **Options**: Add these choices:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
  - 9
  - 10

**Option B (Alternative)**: Long text
- **Field Type**: Long text
- **Field Name**: Table IDs
- **Description**: JSON array of table numbers (e.g., [1, 2])

#### Field 4: Seated At
- **Field Type**: Date and time
- **Field Name**: Seated At
- **Date format**: Local (2025-10-15)
- **Time format**: 24 hour (14:30)
- **Include time**: Yes
- **Time zone**: Use the same timezone as your restaurant
- **Use GMT**: No

#### Field 5: Estimated Departure
- **Field Type**: Date and time
- **Field Name**: Estimated Departure
- **Settings**: Same as "Seated At"

#### Field 6: Departed At
- **Field Type**: Date and time
- **Field Name**: Departed At
- **Settings**: Same as "Seated At"

#### Field 7: Special Requests
- **Field Type**: Long text
- **Field Name**: Special Requests
- **Description**: Dietary restrictions, celebrations, accessibility needs

#### Field 8: Status
- **Field Type**: Single select
- **Field Name**: Status
- **Options** (Add these exact values):
  - Active (Color: Green)
  - Completed (Color: Blue)
  - Cancelled (Color: Red)
- **Default**: Active

## ✅ Verification Checklist

After adding all fields, verify:

- [ ] All 11 fields are visible in the table
- [ ] Field names match exactly (including spaces and capitalization)
- [ ] "Status" field has all 3 options: Active, Completed, Cancelled
- [ ] Date fields include both date AND time
- [ ] Table IDs field is either Multiple select or Long text

## 🔧 Update Environment Variable

After configuring the table, ensure this is set in your Vercel environment:

```bash
SERVICE_RECORDS_TABLE_ID=tblEEHaoicXQA7NcL
```

Add it via:
1. Go to Vercel dashboard
2. Your project → Settings → Environment Variables
3. Add: `SERVICE_RECORDS_TABLE_ID` = `tblEEHaoicXQA7NcL`
4. Redeploy your application

## 🧪 Test the Configuration

After setup, test the walk-in flow:

1. Go to: https://restaurant-ai-mcp.vercel.app/host-dashboard
2. Click "Add Walk-In"
3. Enter customer details (party of 2)
4. See table recommendations
5. Click "Confirm Seating"
6. **Expected**: Success message with service ID
7. **Previously**: 500 error "Unknown field name: 'Service ID'"

## 🐛 Troubleshooting

### Error: "Unknown field name: 'Service ID'"
- **Cause**: Service ID field not configured
- **Fix**: Re-add Service ID as Single line text field

### Error: "Unknown field name: 'Table IDs'"
- **Cause**: Field name mismatch (check spaces, capitalization)
- **Fix**: Ensure field is named exactly "Table IDs" (with space)

### Error: "Invalid field type"
- **Cause**: Field type mismatch
- **Fix**: Delete field and recreate with correct type

### Can't see the table
- **Cause**: Permission issue
- **Fix**: Ensure you're logged into the correct Airtable account that owns the base

## 📝 Field Mapping Reference

For developers - this is how the API maps to Airtable:

```javascript
const serviceFields = {
  'Service ID': 'SVC-20251015-1234',           // Single line text
  'Reservation ID': 'RES-20251015-5678',       // Single line text (optional)
  'Customer Name': 'John Smith',                // Single line text
  'Customer Phone': '+15551234567',             // Phone number
  'Party Size': 4,                              // Number
  'Table IDs': [1, 2],                          // Multiple select OR Long text (JSON)
  'Seated At': '2025-10-15T19:00:00Z',         // Date with time
  'Estimated Departure': '2025-10-15T21:00:00Z', // Date with time
  'Departed At': '2025-10-15T20:45:00Z',       // Date with time (optional)
  'Special Requests': 'Window seat please',     // Long text
  'Status': 'Active'                            // Single select: Active/Completed/Cancelled
};
```

## ⏱️ Estimated Time

Total configuration time: **10-15 minutes**

## 🎯 Success Criteria

When complete:
- ✅ Walk-in flow works end-to-end
- ✅ Service records created successfully
- ✅ Tables update to "Occupied" status
- ✅ Complete service marks tables as "Being Cleaned"
- ✅ Host dashboard shows active parties

---

**Last Updated**: 2025-10-13
**Blocking**: Phase 2 Host Dashboard
**Priority**: CRITICAL
