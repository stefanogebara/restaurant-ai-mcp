# Restaurant Availability Management System

## Overview

This system implements intelligent table availability checking that prevents overbooking by considering:
- **Overlapping reservations** - Guests stay for different durations
- **Party size-based dining duration** - Larger groups need more time
- **Real-time capacity calculation** - Checks every 15 minutes during dining period
- **Alternative time suggestions** - Offers nearby times if requested slot is full

## How It Works

### 1. Dining Duration Rules

Different party sizes have different expected dining times:

| Party Size | Duration | Reasoning |
|------------|----------|-----------|
| 1-2 people | 90 minutes (1.5 hours) | Quick dining, couples |
| 3-4 people | 120 minutes (2 hours) | Standard family/friend group |
| 5-6 people | 120 minutes (2 hours) | Larger group, more coordination |
| 7+ people | 150 minutes (2.5 hours) | Large party, celebrations |

**Why these durations?**
- Industry standard based on restaurant analytics
- Includes ordering, eating, dessert, and payment time
- No explicit buffer needed - duration already accounts for table turnover

### 2. Overlapping Reservation Logic

**Example Scenario:**
```
Restaurant capacity: 50 seats
Reservations:
- 18:00-20:00: Party of 4
- 18:30-20:30: Party of 6
- 19:00-21:00: Party of 4
```

**Occupancy Timeline:**
```
18:00 ━━━━ 4 seats occupied
18:30 ━━━━━━━━ 10 seats occupied (4 + 6)
19:00 ━━━━━━━━━━━━ 14 seats occupied (4 + 6 + 4)
20:00 ━━━━━━━━ 10 seats occupied (6 + 4)
20:30 ━━━━ 4 seats occupied (only last party)
21:00 ━━ 0 seats occupied
```

The system checks **every 15 minutes** during a party's expected stay to ensure capacity is never exceeded.

### 3. Availability Check Process

When checking if time slot 19:00 is available for 8 people:

1. **Calculate dining duration**: 8 people = 150 minutes (until 21:30)
2. **Check time points**: 19:00, 19:15, 19:30, 19:45, 20:00, 20:15, 20:30, 20:45, 21:00, 21:15, 21:30
3. **For each time point**: Count how many seats are occupied by overlapping reservations
4. **If any point** would exceed capacity with new party → REJECT
5. **If all points** have enough space → APPROVE

### 4. Alternative Time Suggestions

If requested time is unavailable, the system suggests alternatives:

**Search Pattern:**
- Check ±30, ±60, ±90, ±120 minutes from requested time
- Filter by restaurant operating hours
- Sort by proximity to original request
- Return top 3 suggestions

**Example:**
```
Requested: 19:00 (FULL)
Alternatives:
1. 18:30 - 30 seats available (30 min earlier)
2. 19:30 - 25 seats available (30 min later)
3. 18:00 - 40 seats available (60 min earlier)
```

## Restaurant Configuration Requirements

### Airtable Fields Needed

**Restaurant Info Table:**
- `Capacity` (Number) - Total seats (default: 60)
- `Opening Time` (Single line text) - Format: "HH:MM" (default: "17:00")
- `Closing Time` (Single line text) - Format: "HH:MM" (default: "22:00")

**Reservations Table:**
- `Date` (Date) - Reservation date
- `Time` (Single line text) - Format: "HH:MM"
- `Party Size` (Number) - Number of guests
- `Status` (Single select) - Must include "Confirmed" and "Seated"

## Time Slot Interval Best Practices

### Recommended: 30-minute intervals

**Why 30 minutes?**
- ✅ Staggers guest arrivals (kitchen/service load)
- ✅ Reduces wait time at entrance
- ✅ Allows flexible scheduling
- ✅ Industry standard for most restaurants

**15-minute intervals:**
- Use for high-volume, fast-casual restaurants
- Requires more efficient kitchen operations
- Can cause entrance congestion

**60-minute intervals:**
- Use for fine dining establishments
- Longer preparation per table
- More luxurious dining experience

## Examples

### Example 1: Available Time Slot

```json
POST /check-availability
{
  "date": "2025-10-15",
  "time": "19:00",
  "party_size": 4
}

Response:
{
  "success": true,
  "available": true,
  "message": "Yes, we have availability for 4 guests on 2025-10-15 at 19:00",
  "details": {
    "estimated_duration": "120 minutes",
    "occupied_seats": 16,
    "available_seats": 34
  }
}
```

### Example 2: Full Time Slot with Alternatives

```json
POST /check-availability
{
  "date": "2025-10-15",
  "time": "19:00",
  "party_size": 40
}

Response:
{
  "success": true,
  "available": false,
  "message": "Sorry, 19:00 is fully booked. Restaurant will be at capacity around 19:30. We have 34 seats available at that time, but your party needs 40 seats.",
  "details": {
    "requested_time": "19:00",
    "party_size": 40,
    "available_seats_at_time": 34,
    "occupied_seats": 16
  },
  "alternative_times": [
    {
      "time": "18:00",
      "available_seats": 46,
      "message": "18:00 has 46 seats available"
    },
    {
      "time": "21:00",
      "available_seats": 42,
      "message": "21:00 has 42 seats available"
    }
  ]
}
```

## AI Agent Integration

The AI agent should:

1. **Always check availability** before creating reservation
2. **Offer alternatives** if requested time is full
3. **Confirm details** with customer before booking
4. **Mention duration** for transparency: "Your table will be ready for approximately 2 hours"

**Prompt Enhancement:**
```
When a customer requests a time:
1. Call check_availability FIRST
2. If available: "Great! We have availability for X people at Y time"
3. If not available: "That time is fully booked, but I can offer you [alternative times]"
4. Always confirm before calling create_reservation
```

## Performance Considerations

- **Cache restaurant info** - Changes rarely
- **Index reservations by date** - Faster queries
- **Limit reservation lookback** - Only check today + future
- **Time complexity**: O(n × m) where n = existing reservations, m = check intervals
  - Typical: 20 reservations × 8 checks = 160 operations (~instant)

## Troubleshooting

### Issue: Too many rejections

**Solution:**
- Reduce dining duration estimates
- Increase restaurant capacity in config
- Check if Status filter is too restrictive

### Issue: Overbooking occurring

**Solution:**
- Verify Status field values ("Confirmed" and "Seated")
- Check date filtering in Airtable formula
- Ensure Time field is in "HH:MM" format

### Issue: No alternative times offered

**Solution:**
- Check Opening Time / Closing Time are set correctly
- Verify party size isn't exceeding total capacity
- Increase time search range (currently ±2 hours)

## Future Enhancements

1. **Table assignment** - Track specific table numbers
2. **VIP tables** - Reserve certain tables for special guests
3. **Peak hour pricing** - Charge more for popular times
4. **Weather-based capacity** - Adjust for patio seating
5. **Historical data** - Learn actual dining durations per party size
6. **Waitlist management** - Auto-book when slots open up

## Summary

This system prevents overbooking by:
- ✅ Calculating realistic dining durations
- ✅ Checking overlapping time slots
- ✅ Verifying capacity at 15-minute intervals
- ✅ Offering intelligent alternatives

**Result:** A restaurant that never overbooks, maximizes capacity, and provides excellent customer experience.
