# MCP Server Testing Guide

## Inspector URL
```
http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=95f679bebe480d288511e6f86443b4d3a1163737c21ef157df927e7a2e96ad42
```

---

## Test All 10 Tools

### ✅ **Tool 1: check_restaurant_availability**

**Purpose**: Check if tables are available for specific date/time/party size

**Test Input**:
```json
{
  "date": "2025-10-25",
  "time": "19:00",
  "party_size": 4
}
```

**Expected Output**:
```json
{
  "available": true,
  "details": {
    "estimated_duration": "120 minutes",
    "available_seats": 34
  },
  "alternative_times": []
}
```

**✅ Success Criteria**: Returns availability status and capacity details

---

### ✅ **Tool 2: create_reservation**

**Purpose**: Create a new restaurant reservation

**Test Input**:
```json
{
  "date": "2025-10-25",
  "time": "19:00",
  "party_size": 4,
  "customer_name": "John Doe",
  "customer_phone": "+1234567890",
  "customer_email": "john@example.com",
  "special_requests": "Window seat, celebrating anniversary"
}
```

**Expected Output**:
```json
{
  "success": true,
  "reservation_id": "RES-20251025-XXXX",
  "message": "Reservation confirmed for John Doe, party of 4 on 2025-10-25 at 19:00"
}
```

**✅ Success Criteria**: Creates reservation and returns confirmation with ID

---

### ✅ **Tool 3: lookup_reservation**

**Purpose**: Find existing reservation by ID, phone, or name

**Test Input (by ID)**:
```json
{
  "reservation_id": "RES-20251025-XXXX"
}
```

**Test Input (by phone)**:
```json
{
  "phone": "+1234567890"
}
```

**Expected Output**:
```json
{
  "success": true,
  "reservation": {
    "reservation_id": "RES-20251025-XXXX",
    "customer_name": "John Doe",
    "party_size": 4,
    "date": "2025-10-25",
    "time": "19:00",
    "status": "Confirmed",
    "special_requests": "Window seat, celebrating anniversary"
  }
}
```

**✅ Success Criteria**: Returns reservation details

---

### ✅ **Tool 4: modify_reservation**

**Purpose**: Update existing reservation details

**Test Input**:
```json
{
  "reservation_id": "RES-20251025-XXXX",
  "new_time": "20:00",
  "new_party_size": 6
}
```

**Expected Output**:
```json
{
  "success": true,
  "message": "Reservation modified successfully",
  "updated_reservation": {
    "reservation_id": "RES-20251025-XXXX",
    "time": "20:00",
    "party_size": 6
  }
}
```

**✅ Success Criteria**: Updates reservation and returns confirmation

---

### ✅ **Tool 5: cancel_reservation**

**Purpose**: Cancel an existing reservation

**Test Input**:
```json
{
  "reservation_id": "RES-20251025-XXXX"
}
```

**Expected Output**:
```json
{
  "success": true,
  "message": "Reservation cancelled successfully"
}
```

**✅ Success Criteria**: Cancels reservation and confirms

---

### ✅ **Tool 6: get_wait_time**

**Purpose**: Get current estimated wait time for walk-ins

**Test Input**:
```json
{}
```

**Expected Output**:
```json
{
  "estimated_wait_minutes": 25,
  "current_occupancy": "75%",
  "message": "Current wait time is approximately 25 minutes"
}
```

**✅ Success Criteria**: Returns wait time estimate

---

### ✅ **Tool 7: get_host_dashboard_data**

**Purpose**: Retrieve complete dashboard data for hosts

**Test Input**:
```json
{}
```

**Expected Output**:
```json
{
  "tables": [
    {
      "table_number": 1,
      "capacity": 4,
      "status": "Available",
      "location": "Indoor"
    }
  ],
  "active_parties": [
    {
      "service_id": "SVC-20251023-123",
      "customer_name": "Jane Smith",
      "party_size": 2,
      "table_ids": [5],
      "seated_at": "2025-10-23T18:30:00Z"
    }
  ],
  "upcoming_reservations": [
    {
      "reservation_id": "RES-20251023-456",
      "customer_name": "Bob Johnson",
      "party_size": 6,
      "time": "20:00",
      "date": "2025-10-23"
    }
  ],
  "summary": {
    "total_capacity": 40,
    "available_seats": 20,
    "occupancy_rate": 50,
    "active_parties_count": 5
  }
}
```

**✅ Success Criteria**: Returns complete dashboard with tables, parties, and stats

---

### ✅ **Tool 8: seat_party**

**Purpose**: Seat a walk-in customer or reservation

**Test Input (Walk-in)**:
```json
{
  "type": "walk-in",
  "customer_name": "Alice Brown",
  "customer_phone": "+1555123456",
  "party_size": 2,
  "table_ids": [3, 4],
  "special_requests": "High chair needed"
}
```

**Test Input (Reservation)**:
```json
{
  "type": "reservation",
  "reservation_id": "RES-20251023-789",
  "table_ids": [7, 8]
}
```

**Expected Output**:
```json
{
  "success": true,
  "service_id": "SVC-20251023-XXX",
  "message": "Party of 2 seated successfully",
  "tables_assigned": [3, 4],
  "estimated_departure": "2025-10-23T20:30:00Z"
}
```

**✅ Success Criteria**: Creates service record and assigns tables

---

### ✅ **Tool 9: complete_service**

**Purpose**: Mark dining service as complete, free tables

**Test Input**:
```json
{
  "service_record_id": "SVC-20251023-XXX"
}
```

**Expected Output**:
```json
{
  "success": true,
  "message": "Service completed successfully",
  "tables_freed": [3, 4],
  "tables_to_clean": [3, 4]
}
```

**✅ Success Criteria**: Marks service complete and frees tables

---

### ✅ **Tool 10: mark_table_clean**

**Purpose**: Update table status to Available after cleaning

**Test Input**:
```json
{
  "table_id": 3
}
```

**Expected Output**:
```json
{
  "success": true,
  "message": "Table 3 marked as clean and available",
  "table_status": "Available"
}
```

**✅ Success Criteria**: Updates table to Available status

---

## 📝 Testing Checklist

Use this checklist while testing:

- [ ] Tool 1: check_restaurant_availability ✅ / ❌
- [ ] Tool 2: create_reservation ✅ / ❌
- [ ] Tool 3: lookup_reservation ✅ / ❌
- [ ] Tool 4: modify_reservation ✅ / ❌
- [ ] Tool 5: cancel_reservation ✅ / ❌
- [ ] Tool 6: get_wait_time ✅ / ❌
- [ ] Tool 7: get_host_dashboard_data ✅ / ❌
- [ ] Tool 8: seat_party ✅ / ❌
- [ ] Tool 9: complete_service ✅ / ❌
- [ ] Tool 10: mark_table_clean ✅ / ❌

---

## 🐛 Common Issues & Solutions

### Issue: "Missing environment variables"
**Solution**: Create `.env` file in `mcp-server/` with:
```env
AIRTABLE_API_KEY=your-key
AIRTABLE_BASE_ID=appm7zo5vOf3c3rqm
RESERVATIONS_TABLE_ID=tbloL2huXFYQluomn
TABLES_TABLE_ID=tbl0r7fkhuoasis56
SERVICE_RECORDS_TABLE_ID=tblEEHaoicXQA7NcL
```

### Issue: "Connection timeout"
**Solution**: Check that Airtable API key has read/write permissions

### Issue: "Table not found"
**Solution**: Verify table IDs match your Airtable base

---

## 📊 Test Results Template

**Test Date**: 2025-10-23
**Tester**: [Your Name]
**Environment**: Local (MCP Inspector)

| Tool | Status | Response Time | Notes |
|------|--------|---------------|-------|
| check_availability | ✅ / ❌ | ___ ms | |
| create_reservation | ✅ / ❌ | ___ ms | |
| lookup_reservation | ✅ / ❌ | ___ ms | |
| modify_reservation | ✅ / ❌ | ___ ms | |
| cancel_reservation | ✅ / ❌ | ___ ms | |
| get_wait_time | ✅ / ❌ | ___ ms | |
| get_host_dashboard_data | ✅ / ❌ | ___ ms | |
| seat_party | ✅ / ❌ | ___ ms | |
| complete_service | ✅ / ❌ | ___ ms | |
| mark_table_clean | ✅ / ❌ | ___ ms | |

**Overall Result**: ✅ All Pass / ❌ Some Failed

**Issues Found**: [List any problems encountered]

**Next Steps**: [What needs to be fixed]

---

## 🎯 Success Criteria

**✅ All tests pass** means:
- All 10 tools respond without errors
- Response times < 2 seconds
- Data correctly saved to Airtable
- Error messages are clear and helpful

**Ready for**: Step 3 (Verify Waitlist UI Integration)

---

**Testing Guide Created**: 2025-10-23
**MCP Server Version**: 1.0.0
