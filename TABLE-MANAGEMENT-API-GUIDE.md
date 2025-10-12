# Table Management API - Integration Guide

## Overview

This guide covers the new table management system endpoints for real-time seating and capacity management.

## Prerequisites

1. **Complete Airtable Setup** - Follow [AIRTABLE-SETUP-GUIDE.md](AIRTABLE-SETUP-GUIDE.md)
2. **Environment Variables** - Add to Vercel:
   ```env
   TABLES_TABLE_ID=tblXXXXXXXXXX
   SERVICE_RECORDS_TABLE_ID=tblYYYYYYYYYY
   ```

## API Endpoints

### 1. Host Dashboard
**GET** `/api/host/dashboard`

Real-time overview of restaurant status.

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-01-12T18:30:00.000Z",
  "summary": {
    "total_capacity": 50,
    "available_seats": 18,
    "occupied_seats": 32,
    "occupancy_percentage": 64,
    "active_parties": 8,
    "upcoming_reservations": 5
  },
  "tables_by_status": {
    "available": 4,
    "occupied": 8,
    "being_cleaned": 2,
    "reserved": 1,
    "total_active": 15
  },
  "locations": {
    "Main Room": {
      "total_tables": 9,
      "total_capacity": 36,
      "available": 2,
      "occupied": 6,
      "cleaning": 1
    },
    "Patio": {
      "total_tables": 4,
      "total_capacity": 16,
      "available": 2,
      "occupied": 1,
      "cleaning": 1
    }
  },
  "active_parties": [
    {
      "service_id": "SRV-001",
      "customer_name": "John Smith",
      "party_size": 4,
      "type": "Reservation",
      "status": "Eating",
      "seated_at": "2025-01-12T17:00:00.000Z",
      "estimated_departure": "2025-01-12T19:00:00.000Z",
      "time_elapsed_minutes": 90,
      "time_remaining_minutes": 30,
      "is_overdue": false
    }
  ],
  "upcoming_reservations": [
    {
      "reservation_id": "RES-20250112-1234",
      "customer_name": "Jane Doe",
      "party_size": 2,
      "time": "19:00",
      "status": "Confirmed",
      "checked_in": false
    }
  ]
}
```

**Use case:** Display on host station screen for real-time monitoring.

---

### 2. Check-in Reservation
**POST** `/api/host/check-in`

Mark customer as arrived and get table suggestions.

**Request:**
```json
{
  "reservation_id": "RES-20250112-1234"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully checked in John Smith",
  "reservation": {
    "id": "RES-20250112-1234",
    "record_id": "recABC123",
    "customer_name": "John Smith",
    "party_size": 4,
    "checked_in_at": "2025-01-12T18:30:00.000Z",
    "special_requests": "Window seat preferred"
  },
  "recommendation": {
    "match_quality": "perfect",
    "reason": "Perfect match: Table T3 seats exactly 4 guests",
    "tables": [
      {
        "table_number": "T3",
        "capacity": 4,
        "location": "Main Room",
        "table_type": "Booth",
        "record_id": "recTBL001"
      }
    ],
    "total_capacity": 4,
    "location": "Main Room"
  },
  "all_options": [
    {
      "match": "Perfect",
      "score": 100,
      "tables": ["T3"],
      "total_capacity": 4,
      "waste_seats": 0,
      "location": "Main Room"
    },
    {
      "match": "Good",
      "score": 90,
      "tables": ["T4"],
      "total_capacity": 6,
      "waste_seats": 2,
      "location": "Main Room"
    }
  ],
  "next_step": "Use /api/host/seat-party to assign tables and seat the party"
}
```

**Error cases:**
- `404` - Reservation not found
- `400` - Reservation cancelled/no-show/already seated

---

### 3. Seat Party
**POST** `/api/host/seat-party`

Assign tables and create service record. Works for reservations AND walk-ins.

**Request (with reservation):**
```json
{
  "reservation_id": "RES-20250112-1234",
  "table_record_ids": ["recTBL001"],
  "party_size": 4,
  "type": "Reservation"
}
```

**Request (walk-in):**
```json
{
  "table_record_ids": ["recTBL001", "recTBL002"],
  "party_size": 8,
  "customer_name": "Walk-in Party",
  "customer_phone": "+1234567890",
  "type": "Walk-in"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully seated John Smith, party of 4",
  "service_record": {
    "id": "recSRV123",
    "service_id": "SRV-042",
    "type": "Reservation",
    "customer_name": "John Smith",
    "party_size": 4,
    "seated_at": "2025-01-12T18:35:00.000Z",
    "expected_duration_minutes": 120,
    "estimated_departure": "2025-01-12T20:35:00.000Z",
    "status": "Seated"
  },
  "tables": [
    {
      "table_number": "T3",
      "capacity": 4,
      "location": "Main Room",
      "status": "Occupied"
    }
  ],
  "total_capacity": 4,
  "reservation": {
    "id": "RES-20250112-1234",
    "status": "Seated"
  },
  "next_step": "When party is ready to leave, use /api/host/complete-service"
}
```

**Validation:**
- Tables must be "Available"
- Tables must be "Is Active"
- Total capacity >= party size
- Reservation must be checked in first (if applicable)

**Dining duration calculation:**
- 2 people: 90 minutes
- 3-4 people: 120 minutes
- 5-6 people: 135 minutes
- 7+ people: 150 minutes

---

### 4. Complete Service
**POST** `/api/host/complete-service`

Mark party as departed, free tables.

**Request:**
```json
{
  "service_record_id": "recSRV123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Service completed for John Smith",
  "service_record": {
    "id": "recSRV123",
    "service_id": "SRV-042",
    "customer_name": "John Smith",
    "party_size": 4,
    "seated_at": "2025-01-12T18:35:00.000Z",
    "actual_departure": "2025-01-12T20:45:00.000Z",
    "duration_minutes": 130,
    "expected_duration_minutes": 120,
    "type": "Reservation"
  },
  "tables_freed": [
    {
      "table_number": "T3",
      "location": "Main Room",
      "status": "Being Cleaned"
    }
  ],
  "reservation_completed": true,
  "next_step": "Tables marked 'Being Cleaned'. Use /api/host/mark-table-clean to make them available again"
}
```

**Actions performed:**
1. Service Record → Status: "Completed", Actual Departure: now
2. Tables → Status: "Being Cleaned"
3. Reservation → Status: "Completed" (if linked)

---

### 5. Mark Table Clean
**POST** `/api/host/mark-table-clean`

After cleaning, make tables available again.

**Request:**
```json
{
  "table_record_ids": ["recTBL001", "recTBL002"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "2 table(s) marked as available",
  "tables": [
    {
      "table_number": "T3",
      "capacity": 4,
      "location": "Main Room",
      "status": "Available"
    },
    {
      "table_number": "T4",
      "capacity": 6,
      "location": "Main Room",
      "status": "Available"
    }
  ]
}
```

**Validation:**
- Tables must be in "Being Cleaned" status

---

### 6. Check Walk-in Availability
**GET** `/api/host/check-walk-in?party_size=4&preferred_location=Patio`

Check if walk-in can be seated immediately.

**Query params:**
- `party_size` (required) - Number of guests
- `preferred_location` (optional) - "Main Room", "Patio", "Bar", "Private Room"

**Response (can seat):**
```json
{
  "success": true,
  "can_seat": true,
  "message": "Can seat party of 4 immediately",
  "party_size": 4,
  "preferred_location": "Patio",
  "recommendation": {
    "match_quality": "perfect",
    "reason": "Perfect match: Table P1 seats exactly 4 guests",
    "tables": [
      {
        "table_number": "P1",
        "capacity": 4,
        "location": "Patio",
        "table_type": "Standard",
        "record_id": "recTBL005"
      }
    ],
    "total_capacity": 4,
    "location": "Patio"
  },
  "all_options": [...],
  "next_step": "Use /api/host/seat-party with type='Walk-in' to seat the party"
}
```

**Response (cannot seat):**
```json
{
  "success": true,
  "can_seat": false,
  "message": "Cannot accommodate party of 8 with available tables",
  "recommendation": null,
  "all_options": [],
  "available_tables_count": 3,
  "largest_available_capacity": 6,
  "next_step": "Add to waitlist or suggest alternative time"
}
```

---

## Workflow Examples

### Scenario 1: Reservation Arrival and Seating

```javascript
// 1. Customer arrives
const checkIn = await fetch('/api/host/check-in', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reservation_id: 'RES-20250112-1234'
  })
});

const { recommendation, reservation } = await checkIn.json();

// 2. Host selects table and seats party
const seat = await fetch('/api/host/seat-party', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reservation_id: reservation.id,
    table_record_ids: recommendation.tables.map(t => t.record_id),
    party_size: reservation.party_size,
    type: 'Reservation'
  })
});

const { service_record } = await seat.json();

// 3. Party finishes and leaves
const complete = await fetch('/api/host/complete-service', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    service_record_id: service_record.id
  })
});

const { tables_freed } = await complete.json();

// 4. Busser cleans tables
const clean = await fetch('/api/host/mark-table-clean', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    table_record_ids: tables_freed.map(t => t.record_id)
  })
});
```

### Scenario 2: Walk-in Customer

```javascript
// 1. Check if we can seat them
const check = await fetch('/api/host/check-walk-in?party_size=4&preferred_location=Patio');
const { can_seat, recommendation } = await check.json();

if (!can_seat) {
  // Add to waitlist or turn away
  console.log('No tables available');
  return;
}

// 2. Seat immediately
const seat = await fetch('/api/host/seat-party', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    table_record_ids: recommendation.tables.map(t => t.record_id),
    party_size: 4,
    customer_name: 'Walk-in Party',
    customer_phone: '+1234567890',
    type: 'Walk-in'
  })
});

// 3. Continue with complete-service and mark-table-clean...
```

### Scenario 3: Host Dashboard (Real-time Monitoring)

```javascript
// Poll every 30 seconds
setInterval(async () => {
  const dashboard = await fetch('/api/host/dashboard');
  const data = await dashboard.json();

  // Update UI
  updateOccupancy(data.summary.occupancy_percentage);
  updateActiveParties(data.active_parties);
  updateUpcomingReservations(data.upcoming_reservations);

  // Alert for overdue parties
  const overdue = data.active_parties.filter(p => p.is_overdue);
  if (overdue.length > 0) {
    alertHost(`${overdue.length} parties past estimated departure`);
  }
}, 30000);
```

---

## Table Assignment Algorithm

The system uses a 4-strategy approach to find the best tables:

### Strategy 1: Perfect Match (Score: 100)
- Exact capacity match
- Example: Party of 4 → Table seats 4

### Strategy 2: Good Match (Score: 90)
- One size up (within 2 extra seats)
- Example: Party of 4 → Table seats 5 or 6

### Strategy 3: Acceptable Match (Score: 75-85)
- Table combination (2-3 tables)
- Prefer same location
- Example: Party of 8 → Two 4-seat tables

### Strategy 4: Waste Seats (Score: 70)
- Larger table (more than 2 extra seats)
- Example: Party of 4 → Table seats 8

**Preferences:**
- Same location combinations ranked higher
- Fewer tables preferred over more tables
- Minimal wasted capacity

---

## Status Transitions

### Table Status Flow
```
Available → Occupied → Being Cleaned → Available
     ↓
  Reserved (for upcoming reservations)
     ↓
  Occupied
```

### Service Record Status Flow
```
Seated → Eating → Paying → Completed
```

### Reservation Status Flow
```
Confirmed → Checked In → Seated → Completed
    ↓
  No-Show (auto-detected after 15 min)
    ↓
Cancelled (manual)
```

---

## Error Handling

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": true,
  "message": "Human-readable error message"
}
```

**Common HTTP status codes:**
- `200` - Success (even if `can_seat: false`)
- `400` - Bad request (validation error)
- `404` - Resource not found
- `405` - Method not allowed
- `500` - Server error

---

## Testing Checklist

### Phase 1 Tests

- [ ] Dashboard loads with correct summary
- [ ] Check-in marks reservation as arrived
- [ ] Check-in suggests appropriate tables
- [ ] Seat-party creates service record
- [ ] Seat-party updates table statuses
- [ ] Seat-party links reservation correctly
- [ ] Complete-service marks tables "Being Cleaned"
- [ ] Complete-service calculates actual duration
- [ ] Mark-table-clean makes tables available
- [ ] Walk-in check returns correct availability
- [ ] Walk-in seating works without reservation
- [ ] Table combinations work for large parties
- [ ] Preferred location is respected
- [ ] Validation prevents double-seating

### Integration Tests

- [ ] Full reservation flow (check-in → seat → complete → clean)
- [ ] Full walk-in flow (check → seat → complete → clean)
- [ ] Multiple simultaneous parties
- [ ] Dashboard updates in real-time
- [ ] No-show detection (15 min after reservation time)
- [ ] Table turnover (multiple services on same table)

---

## Deployment

1. **Push to Vercel:**
   ```bash
   git add .
   git commit -m "Add table management API endpoints"
   git push
   ```

2. **Set environment variables in Vercel dashboard:**
   - `TABLES_TABLE_ID`
   - `SERVICE_RECORDS_TABLE_ID`

3. **Test endpoints:**
   ```bash
   curl https://your-app.vercel.app/api/host/dashboard
   ```

---

## Next Steps (Future Phases)

### Phase 2: Host Station Interface
- Real-time dashboard UI
- Drag-and-drop table assignment
- Visual floor plan

### Phase 3: Automation
- Auto no-show detection (15 min)
- Auto table status updates
- SMS notifications for table ready

### Phase 4: Advanced Features
- Waitlist management
- Table combination suggestions
- Peak time analytics
- Server rotation

---

## Support

For questions or issues:
1. Check Airtable setup: [AIRTABLE-SETUP-GUIDE.md](AIRTABLE-SETUP-GUIDE.md)
2. Review system design: [TABLE-MANAGEMENT-DESIGN.md](TABLE-MANAGEMENT-DESIGN.md)
3. Check Vercel logs for errors
4. Verify environment variables are set

---

**Last Updated:** 2025-01-12
**API Version:** 1.0
**Status:** Phase 1 Complete ✅
