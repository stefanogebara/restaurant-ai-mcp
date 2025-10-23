# Claude Desktop MCP Server Setup Guide

## 🎯 Overview

This guide walks through integrating the Restaurant AI MCP server with Claude Desktop, allowing Claude to manage reservations, tables, and restaurant operations directly through natural conversation.

---

## 📋 Prerequisites

- ✅ Claude Desktop installed (Windows/Mac/Linux)
- ✅ Node.js 18+ installed
- ✅ MCP server built (`mcp-server/dist/index.js` exists)
- ✅ Airtable credentials configured in environment variables

---

## 🔧 Configuration

### Step 1: Locate Claude Desktop Config

**Windows**:
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Mac/Linux**:
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Step 2: Add MCP Server Configuration

Edit `claude_desktop_config.json` and add the restaurant MCP server:

```json
{
  "mcpServers": {
    "restaurant-ai": {
      "command": "node",
      "args": [
        "C:\\Users\\stefa\\restaurant-ai-mcp\\mcp-server\\dist\\index.js"
      ],
      "env": {
        "AIRTABLE_API_KEY": "YOUR_AIRTABLE_API_KEY_HERE",
        "AIRTABLE_BASE_ID": "appm7zo5vOf3c3rqm",
        "TABLES_TABLE_ID": "tbl0r7fkhuoasis56",
        "RESERVATIONS_TABLE_ID": "tbloL2huXFYQluomn",
        "SERVICE_RECORDS_TABLE_ID": "tblEEHaoicXQA7NcL",
        "RESTAURANT_INFO_TABLE_ID": "tblI0DfPZrZbLC8fz"
      }
    }
  }
}
```

**Important**: Replace `YOUR_AIRTABLE_API_KEY_HERE` with your actual Airtable API key.

**For Mac/Linux**, use forward slashes:
```json
"args": [
  "/Users/username/restaurant-ai-mcp/mcp-server/dist/index.js"
]
```

### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop for the configuration to take effect.

---

## 🧪 Testing the Integration

### Verify Server Connection

In Claude Desktop, try these prompts:

**1. Check availability**:
```
Check if the restaurant has availability for 4 people tomorrow at 7 PM
```

**Expected**: Claude uses `check_restaurant_availability` tool and returns available/unavailable

**2. Create a reservation**:
```
Make a reservation for John Smith, party of 2, tomorrow at 8 PM.
Email: john@example.com, Phone: +1-555-1234
```

**Expected**: Claude uses `create_reservation` tool and confirms with reservation ID

**3. Look up a reservation**:
```
Look up reservation RES-20251024-1234
```

**Expected**: Claude uses `lookup_reservation` tool and shows customer details

**4. Get host dashboard data**:
```
Show me the current restaurant floor status
```

**Expected**: Claude uses `get_host_dashboard_data` tool and summarizes tables, parties, reservations

**5. Seat a walk-in party**:
```
Seat a walk-in party: Mary Johnson, +1-555-5678, party of 4, at tables 1 and 4
```

**Expected**: Claude uses `seat_party` tool and confirms seating

---

## 🛠️ Available MCP Tools

Claude Desktop will have access to all 10 restaurant management tools:

### Customer-Facing Tools (7)

1. **check_restaurant_availability**
   - Check if tables are available for a specific date/time/party size
   - Returns: Available/unavailable with seat counts

2. **create_reservation**
   - Create a new restaurant reservation
   - Requires: customer details, party size, date, time
   - Returns: Reservation ID

3. **lookup_reservation**
   - Retrieve reservation details by ID
   - Returns: Full reservation information

4. **modify_reservation**
   - Update existing reservation (time, party size, etc.)
   - Returns: Updated reservation details

5. **cancel_reservation**
   - Cancel a reservation
   - Returns: Confirmation of cancellation

6. **get_wait_time**
   - Get current wait time estimate
   - Returns: Wait time in minutes, active parties count

7. **get_host_dashboard_data**
   - Get complete floor status (tables, parties, reservations)
   - Returns: Comprehensive dashboard data

### Host Dashboard Tools (3)

8. **seat_party** ✅ Fixed
   - Seat a walk-in or reservation
   - Creates service record, marks tables as occupied
   - Returns: Service ID

9. **complete_service** ✅ Fixed
   - Mark a party as departed
   - Updates tables to "Being Cleaned"
   - Returns: Confirmation

10. **mark_table_clean** ✅ Fixed
    - Mark table as available after cleaning
    - Returns: Updated table status

---

## 🎯 Example Conversation Flows

### Flow 1: Customer Makes Reservation

**User**: I'd like to make a dinner reservation for tomorrow

**Claude**: I can help you with that! Could you provide:
- How many people?
- What time would you prefer?
- Your name, email, and phone number?

**User**: Party of 4, at 7 PM. John Smith, john@example.com, +1-555-1234

**Claude**: *Uses check_restaurant_availability tool*
Great news! We have availability for 4 people tomorrow at 7 PM.

*Uses create_reservation tool*
Your reservation is confirmed!
- Reservation ID: RES-20251024-5678
- Name: John Smith
- Party Size: 4
- Date: 2025-10-24
- Time: 19:00

You'll receive a confirmation email at john@example.com.

---

### Flow 2: Host Manages Walk-in

**Host**: We have a walk-in party of 2, can you seat them?

**Claude**: Sure! I'll need:
- Customer name and phone
- Which tables would you like to assign?

**Host**: Mary Johnson, +1-555-9999, seat them at table 7

**Claude**: *Uses seat_party tool*
Perfect! I've seated the party:
- Customer: Mary Johnson
- Party Size: 2
- Table: 7
- Service ID: SRV-20251024-1234
- Seated at: 4:30 PM

The table is now marked as occupied.

---

### Flow 3: Complete Service

**Host**: Table 7 is ready to leave, mark them as departed

**Claude**: *Uses complete_service tool*
Service completed for table 7!
- Departed at: 6:15 PM
- Service duration: 1 hour 45 minutes
- Table status: Being Cleaned

Would you like me to mark the table as clean and available?

**Host**: Yes please

**Claude**: *Uses mark_table_clean tool*
Table 7 is now clean and available for the next party!

---

## 🔍 Troubleshooting

### Issue: Claude says tools aren't available

**Fix 1**: Check config file syntax
```bash
# Validate JSON syntax
node -e "console.log(JSON.parse(require('fs').readFileSync('C:\\\\Users\\\\stefa\\\\AppData\\\\Roaming\\\\Claude\\\\claude_desktop_config.json')))"
```

**Fix 2**: Verify file path
- Make sure `dist/index.js` exists
- Use absolute paths, not relative

**Fix 3**: Check environment variables
- Ensure AIRTABLE_API_KEY is valid
- Verify all table IDs are correct

---

### Issue: Tools timeout or error

**Fix 1**: Test MCP server directly
```bash
cd C:\Users\stefa\restaurant-ai-mcp\mcp-server
npx @modelcontextprotocol/inspector dist/index.js
```

**Fix 2**: Check Airtable connectivity
```bash
# Test API key
curl https://api.airtable.com/v0/meta/bases \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

### Issue: Seat party fails with table ID error

**Status**: ✅ **FIXED** in commit `e78b1f5`

The MCP server now automatically converts table numbers (1, 2, 3) to Airtable record IDs (recXXX). No manual intervention needed.

---

## 📊 Testing Checklist

After setting up Claude Desktop, verify these scenarios:

### Basic Operations
- [ ] Check restaurant availability
- [ ] Create a new reservation
- [ ] Look up existing reservation
- [ ] Modify reservation time
- [ ] Cancel a reservation
- [ ] Get current wait time
- [ ] View dashboard data

### Host Operations
- [ ] Seat a walk-in party
- [ ] Seat a reservation
- [ ] Complete a service
- [ ] Mark table as clean

### Error Handling
- [ ] Try booking for a past date (should error)
- [ ] Try looking up non-existent reservation
- [ ] Try seating with invalid table number

---

## 🎓 Advanced Usage

### Custom Tool Combinations

**Scenario**: Find availability and book in one conversation
```
Host: Find me a table for 4 tomorrow evening, and if available,
      book it for Sarah Williams, sarah@example.com, +1-555-4444
```

Claude will:
1. Use `check_restaurant_availability` for multiple time slots
2. Present options to host
3. Use `create_reservation` for selected time
4. Confirm booking

---

### Multi-step Workflows

**Scenario**: Complete table turnover workflow
```
Host: Table 5 just left, please process the turnover
```

Claude will:
1. Use `complete_service` to mark departed
2. Ask if ready to clean
3. Use `mark_table_clean` to make available
4. Confirm table is ready for next party

---

## 📝 Configuration Reference

### Full Config Example (Windows)

```json
{
  "mcpServers": {
    "restaurant-ai": {
      "command": "node",
      "args": [
        "C:\\Users\\stefa\\restaurant-ai-mcp\\mcp-server\\dist\\index.js"
      ],
      "env": {
        "AIRTABLE_API_KEY": "patAbc123...",
        "AIRTABLE_BASE_ID": "appm7zo5vOf3c3rqm",
        "TABLES_TABLE_ID": "tbl0r7fkhuoasis56",
        "RESERVATIONS_TABLE_ID": "tbloL2huXFYQluomn",
        "SERVICE_RECORDS_TABLE_ID": "tblEEHaoicXQA7NcL",
        "RESTAURANT_INFO_TABLE_ID": "tblI0DfPZrZbLC8fz"
      }
    }
  }
}
```

### Full Config Example (Mac/Linux)

```json
{
  "mcpServers": {
    "restaurant-ai": {
      "command": "node",
      "args": [
        "/Users/username/restaurant-ai-mcp/mcp-server/dist/index.js"
      ],
      "env": {
        "AIRTABLE_API_KEY": "patAbc123...",
        "AIRTABLE_BASE_ID": "appm7zo5vOf3c3rqm",
        "TABLES_TABLE_ID": "tbl0r7fkhuoasis56",
        "RESERVATIONS_TABLE_ID": "tbloL2huXFYQluomn",
        "SERVICE_RECORDS_TABLE_ID": "tblEEHaoicXQA7NcL",
        "RESTAURANT_INFO_TABLE_ID": "tblI0DfPZrZbLC8fz"
      }
    }
  }
}
```

---

## ✅ Production Readiness

The MCP server has been thoroughly tested and is production-ready:

- ✅ All 10 tools functional (100% pass rate)
- ✅ Table ID conversion working correctly
- ✅ Comprehensive error handling
- ✅ Tested with MCP Inspector
- ✅ Full documentation available

**Test Report**: See `MCP-SERVER-TEST-REPORT.md` for complete testing results.

---

## 🚀 Next Steps

1. **Configure Claude Desktop** using this guide
2. **Test all 10 tools** with the testing checklist above
3. **Train staff** on using Claude for restaurant operations
4. **Monitor usage** and gather feedback
5. **Consider deploying ADK agents** to Vertex AI for advanced features (see `VERTEX-AI-DEPLOYMENT-GUIDE.md`)

---

**Setup Guide Created**: October 23, 2025
**MCP Server Status**: ✅ Production Ready
**Tools Available**: 10/10 Functional

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
