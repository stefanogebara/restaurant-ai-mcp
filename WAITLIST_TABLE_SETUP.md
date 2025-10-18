# Waitlist Table Setup Guide
## Airtable Configuration for Phase 3.1

**Created**: October 18, 2025
**Table Name**: Waitlist
**Table ID**: `tblMO2kGFhSX98vLT` (created via Playwright)
**Status**: Table created, fields need to be configured

---

## 📋 Required Fields Configuration

The Waitlist table has **11 required fields**. Configure each field exactly as specified below.

### How to Add Fields in Airtable

1. Go to https://airtable.com/appm7zo5vOf3c3rqm/tblMO2kGFhSX98vLT
2. Click the "+" button next to the last column
3. Follow the field specifications below

---

## Field Specifications

### 1. Waitlist ID (Primary Field - Already exists as "Name")
**Instructions**: Rename the existing "Name" field to "Waitlist ID"

- **Field Type**: Single line text
- **Field Name**: `Waitlist ID`
- **Description**: Unique identifier for waitlist entry (auto-generated)
- **Example**: `WAIT-20251018-1234`

**How to Configure**:
1. Click on "Name" column header
2. Click "Customize field type"
3. Change name to "Waitlist ID"
4. Save

---

### 2. Customer Name
- **Field Type**: Single line text
- **Field Name**: `Customer Name`
- **Description**: Name for the waitlist entry
- **Required**: Yes
- **Example**: "John Smith"

---

### 3. Customer Phone
- **Field Type**: Phone number
- **Field Name**: `Customer Phone`
- **Description**: Contact number (required for notifications)
- **Required**: Yes
- **Example**: "+15551234567"

**Configuration**:
- Click "+ Add field"
- Select "Phone number"
- Name: "Customer Phone"
- Save

---

### 4. Customer Email
- **Field Type**: Email
- **Field Name**: `Customer Email`
- **Description**: Optional email for notifications
- **Required**: No
- **Example**: "john@example.com"

---

### 5. Party Size
- **Field Type**: Number
- **Field Name**: `Party Size`
- **Description**: Number of guests waiting
- **Required**: Yes
- **Format**: Integer
- **Min Value**: 1
- **Max Value**: 20
- **Example**: 4

**Configuration**:
- Field type: Number
- Precision: Integer (0 decimal places)
- Allow negative numbers: No

---

### 6. Added At
- **Field Type**: Created time
- **Field Name**: `Added At`
- **Description**: When customer was added to waitlist (auto-populated)
- **Format**: Local time with date and time
- **Example**: "10/18/2025 7:30 PM"

**Configuration**:
- Field type: Created time
- Include date: Yes
- Include time: Yes
- Time zone: Local

---

### 7. Estimated Wait
- **Field Type**: Number
- **Field Name**: `Estimated Wait`
- **Description**: Estimated wait time in minutes
- **Format**: Integer
- **Example**: 25

**Configuration**:
- Field type: Number
- Precision: Integer
- Allow negative: No

---

### 8. Status
- **Field Type**: Single select
- **Field Name**: `Status`
- **Description**: Current waitlist status
- **Required**: Yes
- **Default**: "Waiting"

**Options** (configure exactly as shown):
1. **Waiting** (Blue color)
2. **Notified** (Yellow color)
3. **Seated** (Green color)
4. **Cancelled** (Red color)
5. **No Show** (Gray color)

**Configuration**:
- Field type: Single select
- Add each option with the color specified
- Set "Waiting" as default

---

### 9. Priority
- **Field Type**: Number
- **Field Name**: `Priority`
- **Description**: Queue position (lower = higher priority)
- **Format**: Integer
- **Default**: Auto-incremented
- **Example**: 1, 2, 3...

**Configuration**:
- Field type: Number
- Precision: Integer
- Allow negative: No

---

### 10. Special Requests
- **Field Type**: Long text
- **Field Name**: `Special Requests`
- **Description**: Customer notes/preferences
- **Required**: No
- **Example**: "High chair needed", "Outdoor seating preferred"

**Configuration**:
- Field type: Long text
- Enable rich text formatting: No

---

### 11. Notified At
- **Field Type**: Date
- **Field Name**: `Notified At`
- **Description**: When customer was notified table is ready
- **Required**: No
- **Include time**: Yes
- **Example**: "10/18/2025 8:00 PM"

**Configuration**:
- Field type: Date
- Include a time field: Yes
- Time zone: Local
- Date format: Local (10/18/2025)
- Time format: 12 hour (8:00 PM)

---

## ✅ Verification Checklist

After adding all fields, verify:

- [ ] Total of 11 fields configured
- [ ] "Waitlist ID" is the primary field (leftmost)
- [ ] "Status" has 5 options: Waiting, Notified, Seated, Cancelled, No Show
- [ ] "Status" default value is "Waiting"
- [ ] "Party Size" is integer with min 1
- [ ] "Added At" is Created time (auto-populated)
- [ ] "Customer Phone" is Phone number type
- [ ] "Customer Email" is Email type
- [ ] All field names match exactly (case-sensitive)

---

## 🔧 Testing the Table

Once all fields are configured, test by creating a sample waitlist entry:

1. Click "+" to add a new record
2. Fill in:
   - **Waitlist ID**: `WAIT-TEST-001`
   - **Customer Name**: `Test Customer`
   - **Customer Phone**: `+15551234567`
   - **Party Size**: `4`
   - **Status**: `Waiting` (should be auto-selected)
   - **Priority**: `1`
   - **Estimated Wait**: `20`

3. Verify:
   - "Added At" auto-populates with current timestamp
   - All fields save correctly
   - No error messages

4. Delete the test record after verification

---

## 🔗 Getting the Table ID

The Waitlist table ID is: **`tblMO2kGFhSX98vLT`**

You can verify this by looking at the URL when viewing the table:
```
https://airtable.com/appm7zo5vOf3c3rqm/tblMO2kGFhSX98vLT/...
                                        ^^^^^^^^^^^^^^^^^^^
                                        This is the table ID
```

---

## 📝 Environment Variable Update

After configuring the table, add the table ID to your environment variables:

**Local (.env)**:
```env
WAITLIST_TABLE_ID=tblMO2kGFhSX98vLT
```

**Vercel**:
1. Go to https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables
2. Click "Add New"
3. Key: `WAITLIST_TABLE_ID`
4. Value: `tblMO2kGFhSX98vLT`
5. Environment: Production, Preview, Development (select all)
6. Save

---

## 🚀 Next Steps

After completing the table setup:

1. ✅ Waitlist table configured with all 11 fields
2. ⏭️ Add `WAITLIST_TABLE_ID` to environment variables
3. ⏭️ Build waitlist API endpoints (`api/routes/waitlist.js`)
4. ⏭️ Create WaitlistPanel component
5. ⏭️ Implement add/remove functionality
6. ⏭️ Test end-to-end waitlist flow

---

## 📊 Field Summary Table

| Field Name | Type | Required | Auto-populated | Default Value |
|------------|------|----------|----------------|---------------|
| Waitlist ID | Single line text | Yes | No | - |
| Customer Name | Single line text | Yes | No | - |
| Customer Phone | Phone number | Yes | No | - |
| Customer Email | Email | No | No | - |
| Party Size | Number (integer) | Yes | No | - |
| Added At | Created time | Yes | Yes | Current time |
| Estimated Wait | Number (integer) | No | No | - |
| Status | Single select | Yes | No | "Waiting" |
| Priority | Number (integer) | No | No | - |
| Special Requests | Long text | No | No | - |
| Notified At | Date | No | No | - |

---

## 🎨 Recommended View Configuration

For optimal usability, configure the Grid view:

**Column Order** (left to right):
1. Waitlist ID
2. Customer Name
3. Party Size
4. Status
5. Estimated Wait
6. Customer Phone
7. Added At
8. Priority
9. Special Requests
10. Customer Email
11. Notified At

**Filters**:
- Create view "Active Waitlist": Status is "Waiting" OR "Notified"
- Create view "All History": No filters

**Sort**:
- Primary: Priority (ascending)
- Secondary: Added At (ascending)

**Color Coding**:
- Enable row colors based on "Status" field
- This will auto-color rows based on status

---

## ⚠️ Common Issues

### Issue: Can't find the Waitlist table
**Solution**: The table was created with ID `tblMO2kGFhSX98vLT`. Navigate directly to: https://airtable.com/appm7zo5vOf3c3rqm/tblMO2kGFhSX98vLT

### Issue: Field names don't match
**Solution**: Field names are case-sensitive. Ensure exact match:
- "Customer Name" (not "customer name" or "CustomerName")
- "Party Size" (not "PartySize" or "party_size")

### Issue: Status dropdown missing options
**Solution**: Manually add all 5 status options in Single Select field configuration

### Issue: Added At not auto-populating
**Solution**: Ensure field type is "Created time" (not Date or Formula)

---

**Time to Complete**: 10-15 minutes
**Difficulty**: Easy (point-and-click configuration)
**Prerequisites**: Access to Airtable base `appm7zo5vOf3c3rqm`
