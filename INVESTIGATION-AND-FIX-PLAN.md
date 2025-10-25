# MCP Server Tables Configuration - Investigation & Fix Plan

**Date**: October 24, 2025
**Status**: Ready for manual investigation and fix
**Browser Tabs Opened**: Vercel Environment Variables, Airtable Tables Table

---

## Problem Summary

**Issue**: MCP server tools `seat_party` and `mark_table_clean` fail because Airtable Tables table has no field definitions.

**Evidence**:
```bash
# Direct Airtable API Query
curl "https://api.airtable.com/v0/appm7zo5vOf3c3rqm/tbl0r7fkhuoasis56"
# Returns: 3 records with ONLY "Attachment Summary" field (error state)

# Attempt to query "Table Number" field
curl with field filter
# Returns: "Unknown field name: Table Number"
```

**But**: Production API returns 12 properly formatted tables with all fields!

---

## Investigation Steps (OPEN IN BROWSER NOW)

### Tab 1: Vercel Environment Variables
**URL**: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables

**CHECK THESE VARIABLES:**
1. ✅ `TABLES_TABLE_ID` - What value is set?
   - Expected: `tbl0r7fkhuoasis56`
   - Question: Is it using a different table?

2. ✅ Compare ALL table IDs:
   - RESERVATIONS_TABLE_ID
   - RESTAURANT_INFO_TABLE_ID
   - SERVICE_RECORDS_TABLE_ID
   - MENU_ITEMS_TABLE_ID

3. ✅ Check if there's a different table ID for production vs development

**ACTION**: Copy the actual TABLES_TABLE_ID value you see in Vercel

---

### Tab 2: Airtable Tables Table
**URL**: https://airtable.com/appm7zo5vOf3c3rqm/tbl0r7fkhuoasis56

**INVESTIGATE:**
1. ✅ How many records are in the table?
2. ✅ What fields (columns) exist?
3. ✅ Are there any records with data?

**EXPECTED FIELDS** (based on production API code):
- `Table Number` (Number field)
- `Capacity` (Number field)
- `Status` (Single Select: Available/Occupied/Being Cleaned/Reserved)
- `Is Active` (Checkbox field)
- `Location` (Single Select: Indoor/Patio/Bar)
- `Current Service ID` (Single Line Text)

**EXPECTED DATA** (12 tables):
| Table Number | Capacity | Status | Is Active | Location |
|--------------|----------|--------|-----------|----------|
| 1 | 2 | Available | ✓ | Indoor |
| 2 | 2 | Available | ✓ | Indoor |
| 3 | 4 | Available | ✓ | Indoor |
| 4 | 4 | Available | ✓ | Indoor |
| 5 | 6 | Available | ✓ | Indoor |
| 6 | 8 | Available | ✓ | Indoor |
| 7 | 2 | Available | ✓ | Patio |
| 8 | 4 | Available | ✓ | Patio |
| 9 | 4 | Available | ✓ | Patio |
| 10 | 6 | Available | ✓ | Bar |
| 11 | 4 | Available | ✓ | Bar |
| 12 | 2 | Available | ✓ | Bar |

---

## Fix Options

### Option A: Table Has No Fields (Most Likely)

**If you see**: Table exists but has NO columns/fields defined

**FIX STEPS:**
1. In Airtable, click "+" to add a new field
2. Add each field one by one:
   
   **Field 1: Table Number**
   - Type: Number
   - Format: Integer
   - Required: Yes

   **Field 2: Capacity**
   - Type: Number
   - Format: Integer
   - Required: Yes

   **Field 3: Status**
   - Type: Single Select
   - Options: Available, Occupied, Being Cleaned, Reserved
   - Default: Available

   **Field 4: Is Active**
   - Type: Checkbox
   - Default: Checked

   **Field 5: Location**
   - Type: Single Select
   - Options: Indoor, Patio, Bar
   - Default: Indoor

   **Field 6: Current Service ID**
   - Type: Single Line Text
   - Allow empty: Yes

3. Populate with 12 table records (use data above)
4. Test MCP server again

---

### Option B: Production Uses Different Table

**If you see**: Vercel has a different TABLES_TABLE_ID value

**FIX STEPS:**
1. Copy the production TABLES_TABLE_ID from Vercel
2. Update MCP server `.env` file:
   ```bash
   # In C:\Users\stefa\restaurant-ai-mcp\mcp-server\.env
   TABLES_TABLE_ID=<value from Vercel>
   ```
3. Rebuild MCP server:
   ```bash
   cd /c/Users/stefa/restaurant-ai-mcp/mcp-server
   npm run build
   ```
4. Re-run tests

---

### Option C: Schema Migration Needed

**If you see**: Table has some fields but not all

**FIX STEPS:**
1. Add missing fields (see Field definitions above)
2. Update existing records to have all required data
3. Delete any empty/broken records
4. Test MCP server again

---

## Testing After Fix

### Test 1: Direct Airtable Query
```bash
# Should return records with all fields
curl -s "https://api.airtable.com/v0/appm7zo5vOf3c3rqm/tbl0r7fkhuoasis56" \
  -H "Authorization: Bearer $AIRTABLE_API_KEY" | \
  python3 -c "import sys, json; data = json.load(sys.stdin); \
  print('Tables found:', len(data.get('records', []))); \
  [print(f\"  Table {r['fields'].get('Table Number', 'N/A')}: \
  Status={r['fields'].get('Status', 'N/A')}, \
  Capacity={r['fields'].get('Capacity', 'N/A')}\") \
  for r in data.get('records', [])[:5]]"
```

**Expected Output**:
```
Tables found: 12
  Table 1: Status=Available, Capacity=2
  Table 2: Status=Available, Capacity=2
  Table 3: Status=Available, Capacity=4
  Table 4: Status=Available, Capacity=4
  Table 5: Status=Available, Capacity=6
```

### Test 2: Re-run MCP Server Tests
```bash
cd /c/Users/stefa/restaurant-ai-mcp/mcp-server
node test-client.js
```

**Expected**: All 10 tests should pass (100% success rate)

---

## What to Report Back

After investigating, please provide:

1. **Vercel TABLES_TABLE_ID value**: `________________`

2. **Airtable table current state**:
   - Number of records: `____`
   - Number of fields: `____`
   - Fields that exist: `____________________`

3. **Which option you chose**: A / B / C

4. **Test results after fix**: Pass / Fail

---

## Quick Reference Commands

```bash
# Check local MCP server .env
cat /c/Users/stefa/restaurant-ai-mcp/mcp-server/.env

# Test Airtable API directly
curl -s "https://api.airtable.com/v0/appm7zo5vOf3c3rqm/tbl0r7fkhuoasis56" \
  -H "Authorization: Bearer patAvc1iw5cPE146l.6450b0bd5b8ffa2186708971d294c23f29011e5e849d55124e1a0552753d07bf"

# Test production API
curl -s "https://restaurant-ai-mcp.vercel.app/api/host-dashboard?action=dashboard"

# Rebuild MCP server after changes
cd /c/Users/stefa/restaurant-ai-mcp/mcp-server && npm run build

# Re-run all MCP tests
cd /c/Users/stefa/restaurant-ai-mcp/mcp-server && node test-client.js
```

---

## Expected Timeline

- **Investigation**: 5 minutes
- **Fix (Option A - Add fields)**: 15 minutes
- **Fix (Option B - Update env var)**: 2 minutes
- **Testing**: 5 minutes
- **Total**: 15-30 minutes

---

**Next Action**: Review the two browser tabs opened and follow the investigation steps above!
