# Restaurant Table Management System Design

## The Problem

You have TWO separate flows that need to work together:

1. **Reservations (Phone/Online)** - Future bookings via AI agent
2. **Walk-ins (In-Person)** - Customers arriving at restaurant right now

**Challenges:**
- Walk-ins take tables reserved for future guests
- No-shows leave tables empty when walk-ins were turned away
- No way to track which physical table each party is sitting at
- Can't see real-time occupancy vs. reservations

## The Solution: Unified Table Management

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AIRTABLE DATABASE                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ Tables      │  │ Reservations │  │ Service Records │    │
│  │ (Physical)  │  │ (Bookings)   │  │ (Real Seating)  │    │
│  └─────────────┘  └──────────────┘  └─────────────────┘    │
│        │                  │                    │             │
│        └──────────────────┴────────────────────┘             │
│                           │                                   │
└───────────────────────────┼───────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
   ┌────▼─────┐                         ┌──────▼──────┐
   │  Phone   │                         │    Host     │
   │  Agent   │                         │   Station   │
   │  (AI)    │                         │  (Tablet)   │
   └──────────┘                         └─────────────┘

   Makes future                         Seats customers
   reservations                         right now
```

## Database Schema

### Table 1: Tables (Physical Tables)

Represents actual physical tables in your restaurant.

| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| Table Number | Text | "T1", "T2", "Bar-1" | Unique identifier |
| Capacity | Number | 4 | Max seats at this table |
| Location | Single Select | "Main Room", "Patio", "Bar" | Where it's located |
| Type | Single Select | "Standard", "Booth", "High-Top" | Table style |
| Status | Single Select | "Available", "Occupied", "Reserved", "Out of Service" | Real-time status |
| Current Service Record | Link to Service Records | [Link] | Who's sitting here now |
| Is Active | Checkbox | ☑ | Can be used for seating |

**Example Data:**
```
T1  - 4 seats - Main Room - Available
T2  - 2 seats - Main Room - Occupied (links to current party)
T3  - 6 seats - Patio - Out of Service (broken chair)
B1  - 4 seats - Bar - Available
```

### Table 2: Reservations (Bookings) - EXISTING

What you already have, enhanced with new fields:

| Field | Type | Purpose |
|-------|------|---------|
| Reservation ID | Text | Unique booking reference |
| Date | Date | Reservation date |
| Time | Text | Reservation time (HH:MM) |
| Party Size | Number | Number of guests |
| Customer Name | Text | Guest name |
| Customer Phone | Text | Contact number |
| Status | Single Select | "Confirmed", "Seated", "No-Show", "Cancelled", "Waitlist" |
| **Assigned Tables** | Link to Tables | **NEW** - Which tables assigned |
| **Service Record** | Link to Service Records | **NEW** - Active service session |
| **Checked In At** | DateTime | **NEW** - When they arrived |
| **No-Show After** | DateTime | **NEW** - Auto-mark no-show after this time |

### Table 3: Service Records (Active Seating Sessions) - NEW

Tracks who is currently sitting in the restaurant RIGHT NOW.

| Field | Type | Purpose |
|-------|------|---------|
| Service ID | Auto Number | Unique session ID |
| Type | Single Select | "Reservation", "Walk-in", "Waitlist" |
| Reservation | Link to Reservations | If from reservation |
| Tables | Link to Tables | Which tables they're using |
| Party Size | Number | How many people |
| Customer Name | Text | Guest name |
| Seated At | DateTime | When they sat down |
| Expected Duration | Number | Minutes (auto-calculated) |
| Estimated Departure | Formula | Seated At + Duration |
| Status | Single Select | "Seated", "Eating", "Paying", "Completed" |
| Actual Departure | DateTime | When they left |
| Notes | Long Text | Server notes |

## Workflow: Reservation Flow

### 1. Customer Calls to Book (AI Agent)

```
Customer → AI Agent → check_availability → create_reservation
                                          ↓
                                    Status: "Confirmed"
                                    Assigned Tables: [Empty]
```

**Database State:**
- Reservation created with Status = "Confirmed"
- NO tables assigned yet (done at arrival)
- Counts toward availability calculation

### 2. Customer Arrives at Restaurant (Host Station)

**Host checks in the reservation:**

```javascript
POST /check-in-reservation
{
  "reservation_id": "RES-20251012-1234",
  "actual_party_size": 4,  // May differ from booking
  "arrival_time": "2025-10-12T19:05:00Z"
}
```

**System Response:**
```json
{
  "success": true,
  "suggested_tables": [
    {
      "combination": ["T1"],
      "total_capacity": 4,
      "location": "Main Room",
      "match": "Perfect"
    },
    {
      "combination": ["T2", "T3"],
      "total_capacity": 6,
      "location": "Main Room",
      "match": "Acceptable"
    }
  ]
}
```

**Host selects tables:**

```javascript
POST /seat-party
{
  "reservation_id": "RES-20251012-1234",
  "table_numbers": ["T1"],
  "seated_at": "2025-10-12T19:08:00Z"
}
```

**Database Updates:**
1. **Reservation:**
   - Status: "Confirmed" → "Seated"
   - Checked In At: "19:08"
   - Assigned Tables: [T1]
   - Service Record: [Link to new Service Record]

2. **Service Record (Created):**
   - Type: "Reservation"
   - Tables: [T1]
   - Seated At: "19:08"
   - Expected Duration: 120 minutes
   - Status: "Seated"

3. **Table T1:**
   - Status: "Available" → "Occupied"
   - Current Service Record: [Link to Service Record]

### 3. Customer Leaves (Host Station)

```javascript
POST /complete-service
{
  "service_id": 123,
  "departure_time": "2025-10-12T21:15:00Z"
}
```

**Database Updates:**
1. **Service Record:**
   - Status: "Seated" → "Completed"
   - Actual Departure: "21:15"

2. **Table T1:**
   - Status: "Occupied" → "Available"
   - Current Service Record: [Cleared]

3. **Reservation:**
   - Status remains "Seated" (historical record)

## Workflow: Walk-in Flow

### Customer Walks In Without Reservation

```javascript
POST /check-walk-in-availability
{
  "party_size": 3,
  "current_time": "2025-10-12T19:30:00Z"
}
```

**System Checks:**
1. Are there available tables for 3?
2. Are there future reservations we'd block?
3. Can we seat them for 90 minutes and have table ready for next booking?

**Response:**
```json
{
  "success": true,
  "can_seat": true,
  "available_tables": [
    {
      "combination": ["T4"],
      "capacity": 4,
      "location": "Patio",
      "available_until": "21:00",  // Next reservation
      "safe_duration": 90  // Minutes they can stay
    }
  ],
  "message": "Yes, we can seat you at Table T4 on the patio"
}
```

**If accepting walk-in:**

```javascript
POST /seat-walk-in
{
  "party_size": 3,
  "customer_name": "Smith",
  "table_numbers": ["T4"],
  "seated_at": "2025-10-12T19:32:00Z"
}
```

**Creates:**
- Service Record (Type: "Walk-in")
- NO Reservation record
- Updates Table T4 status to "Occupied"

## Workflow: No-Show Management

### Automatic No-Show Detection

**Background Job (runs every 15 minutes):**

```javascript
// Find reservations that should have arrived
SELECT * FROM Reservations
WHERE Status = "Confirmed"
  AND Date = TODAY
  AND Time < (CURRENT_TIME - 15 minutes)
  AND "Checked In At" IS EMPTY
```

**Action:**
```javascript
POST /mark-no-show
{
  "reservation_id": "RES-20251012-5678"
}
```

**Updates:**
- Reservation Status: "Confirmed" → "No-Show"
- No-Show After: Current time
- Frees up capacity for walk-ins

### Manual No-Show (Host Station)

Host can manually mark:
- Customer called to cancel late
- Customer confirmed but never showed
- Wrong date/time booking

## Workflow: Waitlist Management

### Customer Calls, No Availability

**AI Agent:**
```javascript
POST /add-to-waitlist
{
  "date": "2025-10-12",
  "time": "19:00",
  "party_size": 4,
  "customer_name": "Johnson",
  "customer_phone": "+15551234567",
  "wait_time_estimate": 30  // minutes
}
```

**Creates:**
- Reservation with Status: "Waitlist"
- Priority: Based on time added

### Table Opens Up

**When no-show occurs or walk-in leaves early:**

```javascript
POST /check-waitlist
{
  "party_size_available": 4,
  "current_time": "2025-10-12T19:15:00Z"
}
```

**System Finds:**
- Waitlist entries for similar party sizes
- Orders by priority/time added
- Returns next customer to call

**Host calls customer:**
- If accepts: Update to Status "Confirmed", proceed with check-in flow
- If declines: Mark as "Cancelled", move to next on waitlist

## Table Assignment Algorithm

### Smart Table Matching

**Priority Rules:**
1. **Exact match** - Party of 4 → 4-seat table
2. **One size up** - Party of 3 → 4-seat table (acceptable)
3. **Combine tables** - Party of 8 → Two 4-seat tables
4. **Large table** - Party of 2 → 6-seat table (waste, but acceptable if no other option)

**Code Example:**
```javascript
function findBestTableCombination(partySize, availableTables) {
  // 1. Try exact match
  const exactMatch = availableTables.find(t => t.capacity === partySize);
  if (exactMatch) return [exactMatch];

  // 2. Try one size up (within 2 seats)
  const sizeUp = availableTables.find(t =>
    t.capacity > partySize && t.capacity <= partySize + 2
  );
  if (sizeUp) return [sizeUp];

  // 3. Try combining tables
  const combinations = findTableCombinations(partySize, availableTables);
  if (combinations.length > 0) return combinations[0];

  // 4. Last resort: larger table
  const largerTable = availableTables
    .filter(t => t.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity)[0];

  return largerTable ? [largerTable] : [];
}
```

### Location Preferences

**Priority:**
1. Main dining room (default)
2. Window seats (if requested)
3. Patio (weather-dependent)
4. Bar seating (for small parties or walk-ins)

## Real-Time Capacity Dashboard

### Host Station View

```
┌──────────────────────────────────────────────────────┐
│  Bella Vita - Saturday, Oct 12, 7:30 PM             │
├──────────────────────────────────────────────────────┤
│  CAPACITY: 40/50 SEATS OCCUPIED                      │
│  AVAILABLE: 10 seats (Tables: T3, T7, T8)            │
│                                                       │
│  UPCOMING ARRIVALS (Next 30 min):                    │
│  ├─ 7:30 PM - Smith, Party of 4 [READY TO SEAT]     │
│  ├─ 7:45 PM - Johnson, Party of 2 [15 min]          │
│  └─ 8:00 PM - Davis, Party of 6 [30 min]            │
│                                                       │
│  CURRENT SEATING:                                    │
│  ├─ T1: Party of 4 (Kim) - Seated 6:00 PM → 8:00 PM │
│  ├─ T2: Party of 2 (Lee) - Seated 6:30 PM → 8:00 PM │
│  └─ T4: WALK-IN, Party of 3 - Seated 7:15 PM → ...  │
│                                                       │
│  NO-SHOWS TODAY: 2                                   │
│  WAITLIST: 3 parties                                 │
└──────────────────────────────────────────────────────┘
```

## API Endpoints Needed

### For Host Station (New)

1. **GET /host/dashboard** - Real-time status
2. **POST /host/check-in** - Check in a reservation
3. **POST /host/seat-party** - Assign tables and seat
4. **POST /host/walk-in-check** - Check walk-in availability
5. **POST /host/seat-walk-in** - Seat walk-in customer
6. **POST /host/complete-service** - Mark party as left
7. **POST /host/mark-no-show** - Manual no-show marking
8. **GET /host/waitlist** - View and manage waitlist
9. **POST /host/call-waitlist** - Contact waitlist customer
10. **GET /host/table-status** - See all tables with current status

### For AI Agent (Enhanced)

1. **POST /check-availability** - Already exists ✓
2. **POST /create-reservation** - Already exists ✓
3. **POST /add-to-waitlist** - NEW
4. **POST /cancel-reservation** - Already exists ✓
5. **POST /modify-reservation** - Already exists ✓

## Benefits of This System

### For Restaurant Operations
✅ **No overbooking** - Real-time occupancy tracking
✅ **Efficient seating** - Smart table assignment
✅ **Handle no-shows** - Auto-detect and free capacity
✅ **Maximize revenue** - Seat walk-ins in gaps
✅ **Waitlist management** - Never lose a customer

### For Staff
✅ **Clear visibility** - See who's coming and when
✅ **Easy check-in** - Quick reservation lookup
✅ **Smart suggestions** - System recommends best tables
✅ **Less confusion** - One source of truth

### For Customers
✅ **Faster seating** - No confusion at door
✅ **Better tables** - Smart assignment based on party size
✅ **Waitlist option** - Don't have to call back
✅ **Fair treatment** - First come, first served

## Implementation Phases

### Phase 1: Core Table Management (MVP)
- [ ] Add Tables table to Airtable
- [ ] Add Service Records table
- [ ] Add fields to Reservations table
- [ ] Create table assignment algorithm
- [ ] Build check-in API endpoint

### Phase 2: Host Station Interface
- [ ] Create dashboard API endpoint
- [ ] Build table status view
- [ ] Add walk-in check and seating
- [ ] Implement service completion

### Phase 3: Automation
- [ ] Auto no-show detection
- [ ] Waitlist management
- [ ] Smart table suggestions
- [ ] Capacity alerts

### Phase 4: Advanced Features
- [ ] Mobile app for servers
- [ ] Customer SMS notifications
- [ ] Historical analytics
- [ ] Predictive no-show detection

## Next Steps

1. **Review this design** - Does it match your needs?
2. **Set up Tables in Airtable** - Create the physical table records
3. **Add Service Records table** - Track active seating
4. **Build check-in endpoint** - Connect reservations to actual seating
5. **Create host station interface** - Simple web page or tablet app

---

**Question for you:**
Would you like me to start building Phase 1 (Core Table Management)? I can create:
1. Airtable schema setup guide
2. Table assignment algorithm
3. Check-in API endpoints
4. Basic host station dashboard

Let me know what makes most sense for your restaurant!
