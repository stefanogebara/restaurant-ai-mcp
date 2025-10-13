# Service Records Table Configuration

## Overview
This document tracks the configuration of the Service Records table in Airtable, which is required for the Host Dashboard walk-in flow functionality.

## Table Information
- **Table Name**: Service Records
- **Table ID**: `tblEEHaoicXQA7NcL`
- **Base ID**: `appm7zo5vOf3c3rqm`
- **URL**: https://airtable.com/appm7zo5vOf3c3rqm/tblEEHaoicXQA7NcL

## Configuration Status

### ✅ Completed Fields (3/11)
1. **Service ID** (Primary Field)
   - Type: Single line text
   - Status: ✅ Renamed from "Name"

2. **Reservation ID**
   - Type: Single line text
   - Status: ✅ Created

3. **Customer Name**
   - Type: Single line text
   - Status: ✅ Created

### ⏸️ Remaining Fields to Add (8/11)

4. **Customer Phone**
   - Type: Single line text (or Phone number)
   - Purpose: Contact information for walk-in customers

5. **Party Size**
   - Type: Number
   - Format: Integer
   - Purpose: Number of guests in the party

6. **Table IDs**
   - Type: Single line text
   - Format: Comma-separated table numbers (e.g., "4,5")
   - Purpose: Which tables are assigned to this service

7. **Seated At**
   - Type: Date
   - Format: ISO 8601 (e.g., "2025-01-15T18:30:00.000Z")
   - Include time: Yes
   - Purpose: When the party was seated

8. **Estimated Departure**
   - Type: Date
   - Format: ISO 8601
   - Include time: Yes
   - Purpose: Calculated based on seated time + average dining duration

9. **Departed At**
   - Type: Date
   - Format: ISO 8601
   - Include time: Yes
   - Purpose: Actual departure time (null until party leaves)

10. **Special Requests**
    - Type: Long text
    - Purpose: Any special accommodations or notes

11. **Status**
    - Type: Single select
    - Options:
      - Active (default for new services)
      - Completed (when party has departed)
      - Cancelled (if service was cancelled)
    - Purpose: Track service lifecycle

### 🗑️ Fields to Delete (4)
These are default Airtable fields that are not needed:
- Notes (Long text)
- Assignee (User)
- Attachments (Attachment)
- Attachment Summary (Long text with AI)

## Manual Configuration Steps

Since automated field creation via API requires elevated permissions, these steps must be completed manually in the Airtable web interface:

### Step 1: Add Remaining Fields

For each field in the "Remaining Fields" section above:
1. Click the "+" button to add a field
2. Select the appropriate field type
3. Enter the field name exactly as shown
4. Configure any additional options (format, options list, etc.)
5. Click "Create field"

### Step 2: Configure Status Field
The Status field already exists but needs to be reconfigured:
1. Click on the Status column header menu
2. Select "Edit field"
3. Update the options to:
   - Active
   - Completed
   - Cancelled
4. Remove any existing options that don't match
5. Save changes

### Step 3: Delete Unnecessary Fields

For each field in the "Fields to Delete" section:
1. Click on the field column header menu
2. Select "Delete field"
3. Confirm deletion

### Step 4: Verify Configuration

After completing the above steps, verify:
- [ ] All 11 required fields exist with correct types
- [ ] Status field has exactly 3 options: Active, Completed, Cancelled
- [ ] No unnecessary fields remain
- [ ] Service ID is the primary field

## Environment Variable Update

After completing the field configuration, update the Vercel environment variable:

```bash
SERVICE_RECORDS_TABLE_ID=tblEEHaoicXQA7NcL
```

Then redeploy the application.

## Expected API Payload

Once configured, the `createServiceRecord` function will send data in this format:

```javascript
{
  "Service ID": "SVC-1234567890",
  "Reservation ID": "RES-1234567890" || null,
  "Customer Name": "Sarah Johnson",
  "Customer Phone": "555-0123",
  "Party Size": 4,
  "Table IDs": "4,5",
  "Seated At": "2025-01-15T18:30:00.000Z",
  "Estimated Departure": "2025-01-15T20:00:00.000Z",
  "Departed At": null,
  "Special Requests": "Window seat preferred",
  "Status": "Active"
}
```

## Testing Checklist

After configuration is complete:
- [ ] Test walk-in flow: Add party details
- [ ] Verify table recommendations appear
- [ ] Click "Confirm Seating"
- [ ] Check that service record is created in Airtable
- [ ] Verify dashboard shows occupied tables
- [ ] Test "Complete Service" flow
- [ ] Verify service status changes to "Completed"
- [ ] Verify Departed At timestamp is set
- [ ] Check that tables return to available status

## Troubleshooting

### If walk-in flow still fails after configuration:

1. **Verify table ID in environment variables**
   ```bash
   echo $SERVICE_RECORDS_TABLE_ID
   # Should output: tblEEHaoicXQA7NcL
   ```

2. **Check field names match exactly**
   - Field names are case-sensitive
   - Must include spaces exactly as shown
   - No extra spaces or special characters

3. **Verify field types**
   - Date fields must have "Include time" enabled
   - Number fields should allow decimals = false (integer only)
   - Single select must have all 3 status options

4. **Check Airtable API permissions**
   - API key must have write access to the base
   - Service Records table must not have restricted permissions

## Related Files

- `api/services/airtable.js` - Core Airtable operations
- `api/routes/host-dashboard.js` - Host dashboard endpoints (handleSeatParty)
- `AIRTABLE_SETUP.md` - Detailed Airtable setup documentation
- `SETUP_INSTRUCTIONS.md` - Step-by-step manual setup guide

## References

- [Airtable Field Types Documentation](https://support.airtable.com/docs/supported-field-types-in-airtable-overview)
- [Airtable API - Create Records](https://airtable.com/developers/web/api/create-records)
- Previous session summary showing walk-in flow testing results
