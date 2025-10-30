# Airtable Onboarding Tables Setup Guide

This guide will walk you through creating the 4 new Airtable tables required for the restaurant onboarding system.

## 📊 Tables Overview

You need to create these 4 new tables in your Airtable base:
1. **Restaurants** - Customer restaurant accounts
2. **Restaurant Areas** - Dining zones (Indoor, Patio, Bar, etc.)
3. **Restaurant Business Hours** - Operating hours per day
4. **Team Members** - Staff access control

## 🔧 Setup Instructions

### 1. Create "Restaurants" Table

1. Go to https://airtable.com/appm7zo5vOf3c3rqm
2. Click **"Add or import"** → **"Create empty table"**
3. Name it: **Restaurants**
4. Add these fields:

| Field Name | Field Type | Configuration |
|------------|------------|---------------|
| `Restaurant ID` | Single line text | PRIMARY KEY |
| `Customer Email` | Email | |
| `Restaurant Name` | Single line text | |
| `Restaurant Type` | Single select | Options: Fine Dining, Casual Dining, Fast Casual, Cafe, Bar, Bistro, Other |
| `City` | Single line text | |
| `Country` | Single line text | |
| `Phone Number` | Phone number | |
| `Email` | Email | |
| `Website` | URL | |
| `Average Dining Duration` | Number | Integer, minutes |
| `Advance Booking Days` | Number | Integer |
| `Buffer Time` | Number | Integer, minutes |
| `Cancellation Policy` | Long text | |
| `Special Notes` | Long text | |
| `Onboarding Completed` | Checkbox | |
| `Created At` | Date | |
| `Status` | Single select | Options: active, trial, suspended, cancelled |

5. Note the **Table ID** from the URL: `tblXXXXXXXXXXXXXX`

---

### 2. Create "Restaurant Areas" Table

1. Click **"Add or import"** → **"Create empty table"**
2. Name it: **Restaurant Areas**
3. Add these fields:

| Field Name | Field Type | Configuration |
|------------|------------|---------------|
| `Area ID` | Single line text | PRIMARY KEY |
| `Restaurant ID` | Link to another record | Link to "Restaurants" table |
| `Area Name` | Single line text | |
| `Is Active` | Checkbox | |
| `Display Order` | Number | Integer |
| `Created At` | Date | |

4. Note the **Table ID** from the URL

---

### 3. Create "Restaurant Business Hours" Table

1. Click **"Add or import"** → **"Create empty table"**
2. Name it: **Restaurant Business Hours**
3. Add these fields:

| Field Name | Field Type | Configuration |
|------------|------------|---------------|
| `Hours ID` | Single line text | PRIMARY KEY |
| `Restaurant ID` | Link to another record | Link to "Restaurants" table |
| `Day of Week` | Single select | Options: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday |
| `Is Open` | Checkbox | |
| `Open Time` | Single line text | Format: HH:MM (e.g., 09:00) |
| `Close Time` | Single line text | Format: HH:MM (e.g., 22:00) |

4. Note the **Table ID** from the URL

---

### 4. Create "Team Members" Table

1. Click **"Add or import"** → **"Create empty table"**
2. Name it: **Team Members**
3. Add these fields:

| Field Name | Field Type | Configuration |
|------------|------------|---------------|
| `Member ID` | Single line text | PRIMARY KEY |
| `Restaurant ID` | Link to another record | Link to "Restaurants" table |
| `Email` | Email | |
| `Role` | Single select | Options: Owner, Manager, Host |
| `Status` | Single select | Options: active, pending, disabled |
| `Invited At` | Date | |
| `Joined At` | Date | |

4. Note the **Table ID** from the URL

---

### 5. Update Existing "Tables" Table

You need to add 2 new fields to your existing **Tables** table (`tbl0r7fkhuoasis56`):

1. Go to the **Tables** table
2. Click the **+** button to add a new field
3. Add these fields:

| New Field Name | Field Type | Configuration |
|----------------|------------|---------------|
| `Restaurant ID` | Link to another record | Link to "Restaurants" table |
| `Area ID` | Link to another record | Link to "Restaurant Areas" table |

---

## 🔐 Environment Variables

After creating all tables, add these environment variables to Vercel:

```bash
# New Onboarding Tables
RESTAURANTS_TABLE_ID=tblYourRestaurantsTableID
AREAS_TABLE_ID=tblYourAreasTableID
BUSINESS_HOURS_TABLE_ID=tblYourBusinessHoursTableID
TEAM_MEMBERS_TABLE_ID=tblYourTeamMembersTableID
```

### How to Add to Vercel:

1. Go to: https://vercel.com/stefanogebara/restaurant-ai-mcp/settings/environment-variables
2. For each variable:
   - Click **"Add New"**
   - Name: `RESTAURANTS_TABLE_ID`
   - Value: `tblXXXXXXXXXXXXXX` (your table ID)
   - Environment: **Production, Preview, Development**
   - Click **"Save"**
3. Repeat for all 4 table IDs
4. **Redeploy** your application after adding all variables

---

## ✅ Verification Checklist

Before testing onboarding:

- [ ] Restaurants table created with all 17 fields
- [ ] Restaurant Areas table created with all 6 fields
- [ ] Restaurant Business Hours table created with all 6 fields
- [ ] Team Members table created with all 7 fields
- [ ] Tables table updated with 2 new link fields
- [ ] All 4 table IDs added to Vercel environment variables
- [ ] Application redeployed

---

## 🧪 Testing the Onboarding Flow

1. Complete a Stripe checkout at https://restaurant-ai-mcp.vercel.app/#pricing
2. After checkout, you should be redirected to `/onboarding?email=your@email.com`
3. Complete all 5 onboarding steps
4. Click "Complete Setup"
5. Verify in Airtable:
   - ✅ New record in Restaurants table
   - ✅ 7 records in Business Hours table (one per day)
   - ✅ Records in Restaurant Areas table (for each area you created)
   - ✅ Records in Tables table (linked to restaurant and areas)
   - ✅ Records in Team Members table (if you invited team members)

---

## 🐛 Troubleshooting

### Error: "Unknown field name"
- **Cause**: Field name in API doesn't match Airtable field name exactly
- **Fix**: Check field names are exactly as specified (case-sensitive, spaces included)

### Error: "Table not found"
- **Cause**: Table ID environment variable is incorrect
- **Fix**: Double-check table IDs from Airtable URL, ensure all 4 are added to Vercel

### Error: "Invalid record ID"
- **Cause**: Link field not configured correctly
- **Fix**: Ensure link fields are linking to the correct tables

### Onboarding completes but no data in Airtable
- **Cause**: Environment variables not loaded
- **Fix**: Redeploy application after adding environment variables

---

## 📚 Related Files

- **Schema Documentation**: `ONBOARDING_SCHEMA.md`
- **Feature Strategy**: `FEATURE_STRATEGY.md`
- **API Endpoint**: `api/onboarding/complete.js`
- **Frontend Components**: `client/src/pages/Onboarding.tsx`, `client/src/components/onboarding/*.tsx`

---

**Need help?** Check the Airtable API documentation or contact support.
