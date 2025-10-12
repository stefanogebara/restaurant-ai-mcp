# Airtable Setup Guide - Table Management System

## Overview

You need to add 2 new tables and modify 1 existing table in your Airtable base.

## Step-by-Step Setup

### Table 1: Tables (NEW) - Physical Restaurant Tables

**Purpose:** Represents actual physical tables in your restaurant.

**How to create:**
1. Open your Airtable base
2. Click "+" to add a new table
3. Name it: **"Tables"**
4. Add these fields:

| Field Name | Field Type | Options/Notes |
|------------|-----------|---------------|
| **Table Number** | Single line text | PRIMARY FIELD - e.g., "T1", "T2", "P1" (Patio), "B1" (Bar) |
| **Capacity** | Number | Integer - Max seats at this table (2, 4, 6, 8) |
| **Location** | Single select | Options: "Main Room", "Patio", "Bar", "Private Room" |
| **Table Type** | Single select | Options: "Standard", "Booth", "High-Top", "Bar Stool" |
| **Status** | Single select | Options: "Available", "Occupied", "Reserved", "Out of Service", "Being Cleaned" |
| **Current Service** | Link to another record | Link to "Service Records" table (create after this) |
| **Is Active** | Checkbox | Checked = Can be used for seating |
| **Notes** | Long text | Internal notes (e.g., "Wobbly chair", "Best view") |

**Sample Data to Add:**
```
Table Number: T1
Capacity: 4
Location: Main Room
Table Type: Standard
Status: Available
Is Active: ☑ (checked)

Table Number: T2
Capacity: 2
Location: Main Room
Table Type: Standard
Status: Available
Is Active: ☑

Table Number: T3
Capacity: 6
Location: Main Room
Table Type: Booth
Status: Available
Is Active: ☑

Table Number: T4
Capacity: 4
Location: Main Room
Table Type: Standard
Status: Available
Is Active: ☑

Table Number: T5
Capacity: 8
Location: Private Room
Table Type: Standard
Status: Available
Is Active: ☑

Table Number: P1
Capacity: 4
Location: Patio
Table Type: Standard
Status: Available
Is Active: ☑

Table Number: P2
Capacity: 4
Location: Patio
Table Type: Standard
Status: Available
Is Active: ☑

Table Number: B1
Capacity: 2
Location: Bar
Table Type: Bar Stool
Status: Available
Is Active: ☑

Table Number: B2
Capacity: 2
Location: Bar
Table Type: Bar Stool
Status: Available
Is Active: ☑
```

**Total Capacity:** 36 seats (adjust to match your restaurant)

---

### Table 2: Service Records (NEW) - Active Seating Sessions

**Purpose:** Tracks who is currently sitting in the restaurant RIGHT NOW.

**How to create:**
1. Click "+" to add another new table
2. Name it: **"Service Records"**
3. Add these fields:

| Field Name | Field Type | Options/Notes |
|------------|-----------|---------------|
| **Service ID** | Autonumber | PRIMARY FIELD - Auto-generates SRV-001, SRV-002, etc. |
| **Type** | Single select | Options: "Reservation", "Walk-in", "Waitlist" |
| **Reservation** | Link to another record | Link to "Reservations" table |
| **Tables** | Link to another record | Link to "Tables" table (allow linking multiple) |
| **Party Size** | Number | Integer - How many guests |
| **Customer Name** | Single line text | Guest name |
| **Customer Phone** | Phone number | Contact for walk-ins |
| **Seated At** | Date | Include time - When they sat down |
| **Expected Duration** | Number | Minutes - Auto-calculated based on party size |
| **Estimated Departure** | Formula | `DATEADD({Seated At}, {Expected Duration}, 'minutes')` |
| **Status** | Single select | Options: "Seated", "Eating", "Paying", "Completed" |
| **Actual Departure** | Date | Include time - When they actually left |
| **Server Notes** | Long text | Internal notes |
| **Created Time** | Created time | Auto-field |

**Formula for Estimated Departure:**
```
DATEADD({Seated At}, {Expected Duration}, 'minutes')
```

**No sample data needed** - This table fills automatically when customers are seated.

---

### Table 3: Reservations (MODIFY EXISTING)

**Purpose:** Add new fields to link reservations with actual seating.

**Fields to ADD to your existing Reservations table:**

| Field Name | Field Type | Options/Notes |
|------------|-----------|---------------|
| **Assigned Tables** | Link to another record | Link to "Tables" table (allow linking multiple) |
| **Service Record** | Link to another record | Link to "Service Records" table |
| **Checked In At** | Date | Include time - When customer arrived |
| **No-Show After** | Formula | `DATEADD(DATETIME_PARSE(CONCATENATE({Date}, ' ', {Time}), 'YYYY-MM-DD HH:mm'), 15, 'minutes')` |
| **Is No-Show** | Formula | `IF(AND({Status} = "Confirmed", {Checked In At} = BLANK(), NOW() > {No-Show After}), "⚠️ Late/No-Show", "")` |

**Formula for No-Show After:**
```
DATEADD(
  DATETIME_PARSE(
    CONCATENATE({Date}, ' ', {Time}),
    'YYYY-MM-DD HH:mm'
  ),
  15,
  'minutes'
)
```

**Formula for Is No-Show:**
```
IF(
  AND(
    {Status} = "Confirmed",
    {Checked In At} = BLANK(),
    NOW() > {No-Show After}
  ),
  "⚠️ Late/No-Show",
  ""
)
```

---

### Table 4: Restaurant Info (MODIFY EXISTING)

**Fields to ADD if not present:**

| Field Name | Field Type | Default Value |
|------------|-----------|---------------|
| **Opening Time** | Single line text | "17:00" |
| **Closing Time** | Single line text | "22:00" |
| **Last Seating Time** | Single line text | "21:30" (30 min before close) |

---

## Get Table IDs for Environment Variables

After creating tables, you need their IDs for API calls.

### Method 1: From URL (Easiest)

1. Open the "Tables" table
2. Look at the URL in your browser
3. Find the part that looks like: `tblXXXXXXXXXXXX`

**Example URL:**
```
https://airtable.com/appXXXXXXXXXX/tblABCD1234567890/viwXXXXXXXX
                                  ↑ This is the table ID
```

### Method 2: From API Documentation

1. Go to https://airtable.com/api
2. Select your base
3. Scroll down to find table names
4. Table IDs are shown in the API examples

### Add to Environment Variables

In your Vercel dashboard (or `.env` file), add:

```env
# Existing
AIRTABLE_API_KEY=your_api_key
AIRTABLE_BASE_ID=your_base_id
RESERVATIONS_TABLE_ID=tblXXXXXXXXXX
RESTAURANT_INFO_TABLE_ID=tblYYYYYYYYYY

# NEW - Add these
TABLES_TABLE_ID=tblZZZZZZZZZZ
SERVICE_RECORDS_TABLE_ID=tblAAAAAAAAA
```

---

## Verification Checklist

After setup, verify:

- [ ] **Tables table exists** with 9+ sample tables
- [ ] **Service Records table exists** (empty is OK)
- [ ] **Reservations table** has 3 new fields
- [ ] **Restaurant Info** has opening/closing times
- [ ] All **Status field options** match exactly (case-sensitive!)
- [ ] All **link fields** point to correct tables
- [ ] **Formulas** are working (no errors shown)
- [ ] **Environment variables** updated in Vercel

---

## Status Field Values - IMPORTANT!

These must match EXACTLY (case-sensitive) for the API to work:

### Tables → Status
- `Available`
- `Occupied`
- `Reserved`
- `Out of Service`
- `Being Cleaned`

### Service Records → Status
- `Seated`
- `Eating`
- `Paying`
- `Completed`

### Reservations → Status (Existing + New)
- `Confirmed`
- `Seated`
- `Completed`
- `Cancelled`
- `No-Show`
- `Waitlist`

---

## Common Issues

### Issue: Formula shows "#ERROR!"

**Solution:** Check field names in formula match exactly:
- Field names are case-sensitive
- Use curly braces: `{Field Name}`
- Date fields need proper format

### Issue: Link fields won't connect

**Solution:**
- Make sure target table exists first
- Try deleting and re-adding the link field
- Verify you're linking to correct table

### Issue: Can't find Table ID in URL

**Solution:**
- Make sure you're viewing the table (not a form or interface)
- Look for `/tbl` in URL
- Use Method 2 (API documentation) instead

---

## Visual Reference

### Expected Table Structure

```
Your Airtable Base
├── Reservations (Modified) ✏️
│   ├── Existing fields...
│   ├── Assigned Tables → [Links to Tables]
│   ├── Service Record → [Links to Service Records]
│   ├── Checked In At
│   └── No-Show After
│
├── Tables (NEW) 🆕
│   ├── Table Number (Primary)
│   ├── Capacity
│   ├── Location
│   ├── Status
│   └── Current Service → [Links to Service Records]
│
├── Service Records (NEW) 🆕
│   ├── Service ID (Primary)
│   ├── Type
│   ├── Reservation → [Links to Reservations]
│   ├── Tables → [Links to Tables]
│   ├── Seated At
│   └── Status
│
└── Restaurant Info (Modified) ✏️
    ├── Existing fields...
    ├── Opening Time
    └── Closing Time
```

---

## Next Steps

After completing this setup:

1. **Test the formulas** - Create a test reservation, verify No-Show After calculates
2. **Add your real tables** - Match your actual restaurant layout
3. **Update environment variables** - Add table IDs to Vercel
4. **Proceed to API implementation** - System is ready for code integration

---

## Need Help?

- **Formula not working?** - Check field names match exactly
- **Link fields broken?** - Verify target table exists
- **Can't find table ID?** - Use Airtable API documentation method
- **Status values not matching?** - Copy-paste from this guide (case-sensitive!)

Once this setup is complete, we can proceed with building the API endpoints! 🚀
