# Quick Start Guide - Table Availability System

## 🎯 What Problem Does This Solve?

**Old System:**
- Counted total guests for the day
- If 100 people booked and capacity is 60, it would reject everyone after 60 guests
- ❌ Didn't consider that guests leave after eating

**New System:**
- Tracks who's sitting when
- Considers overlapping reservations
- ✅ Can book 100+ people in a day if they come at different times

## 📊 Visual Example

### Scenario
Restaurant has **50 seats**, here are the bookings:

```
TIME    RESERVATIONS                          OCCUPIED SEATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
18:00   Party of 4 arrives (stays until 20:00)      4/50
18:30   Party of 6 arrives (stays until 20:30)     10/50
19:00   Party of 4 arrives (stays until 21:00)     14/50
19:30   Party of 2 arrives (stays until 21:00)     16/50  ← Peak time
20:00   Party of 8 arrives (stays until 22:30)     20/50
20:30   First party leaves                         16/50
21:00   Two parties leave                           8/50
21:30   —                                           8/50
22:00   —                                           8/50
22:30   Last party leaves                           0/50
```

### Can We Book a Party of 35 at 19:00?

**Check Process:**
1. Party of 35 needs 150 minutes (until 21:30)
2. Check every 15 minutes from 19:00 to 21:30
3. At 19:30, there are already 16 seats occupied
4. 16 + 35 = 51 seats needed
5. **REJECT** - Exceeds 50 seat capacity

**Alternative Suggestions:**
- 18:00 (only 4 seats occupied, 46 available ✅)
- 21:00 (only 8 seats occupied, 42 available ✅)

## 🔢 Dining Duration Rules

Based on restaurant industry standards:

| Party Size | Duration | Why? |
|-----------|----------|------|
| 1-2 people | 90 min | Quick meal, couple |
| 3-4 people | 120 min | Standard family dinner |
| 5-6 people | 120 min | Larger group coordination |
| 7-8 people | 150 min | Celebration, multiple courses |

## 🚀 How to Use

### In Your AI Agent Prompt

```
IMPORTANT: Before creating any reservation:

1. ALWAYS call check_availability first
2. If NOT available, offer the alternative_times from the response
3. Only call create_reservation after customer confirms

Example conversation:
Customer: "I need a table for 6 at 7pm tomorrow"
Agent: *calls check_availability*
Agent: "Let me check... I'm sorry, 7pm is fully booked.
       However, I have availability at:
       - 6:30pm (plenty of space)
       - 7:30pm (good availability)
       Would either of these work for you?"
```

### API Response Structure

**✅ Available:**
```json
{
  "success": true,
  "available": true,
  "message": "Yes, we have availability for 4 guests...",
  "details": {
    "estimated_duration": "120 minutes",
    "occupied_seats": 16,
    "available_seats": 34
  }
}
```

**❌ Not Available:**
```json
{
  "success": true,
  "available": false,
  "message": "Sorry, 19:00 is fully booked...",
  "alternative_times": [
    {
      "time": "18:30",
      "available_seats": 40,
      "message": "18:30 has 40 seats available"
    },
    {
      "time": "19:30",
      "available_seats": 34,
      "message": "19:30 has 34 seats available"
    }
  ]
}
```

## ⚙️ Configuration

### In Airtable - Restaurant Info Table

You need these fields (all optional, have defaults):

1. **Capacity** (Number)
   - Total seats in restaurant
   - Default: 60
   - Example: 50

2. **Opening Time** (Text)
   - Format: "HH:MM" (24-hour)
   - Default: "17:00" (5pm)
   - Example: "17:30"

3. **Closing Time** (Text)
   - Format: "HH:MM" (24-hour)
   - Default: "22:00" (10pm)
   - Example: "23:00"

### Reservation Status Values

The system only counts reservations with these statuses:
- ✅ "Confirmed"
- ✅ "Seated"

It ignores:
- ❌ "Cancelled"
- ❌ "No-show"
- ❌ "Pending"

## 🧪 Testing

Run the test file to see it in action:

```bash
node api/_lib/availability-calculator.test.js
```

This shows:
- How dining durations work
- How overlapping reservations are tracked
- Real-world scenarios with multiple bookings
- Edge cases (full restaurant, large parties)

## 💡 Tips

### For Best Results

1. **Book in 30-minute intervals**
   - 18:00, 18:30, 19:00, 19:30, etc.
   - Staggers guest arrivals
   - Prevents kitchen overload

2. **Set realistic capacity**
   - Count actual seats, not theoretical max
   - Account for wheelchair accessible tables
   - Consider staff capacity too

3. **Update promptly**
   - Mark no-shows immediately
   - Cancel early if possible
   - This frees up capacity for walk-ins

### Common Mistakes

❌ **Don't:** Accept walk-ins without checking availability
✅ **Do:** Run check_availability for all bookings, even phone calls

❌ **Don't:** Override the system for "just one more table"
✅ **Do:** Trust the algorithm - overbooking causes bad reviews

❌ **Don't:** Book parties larger than capacity
✅ **Do:** Suggest splitting large groups or alternative dates

## 📈 Benefits

### For Restaurant
- **No overbooking** - Never seat more than capacity
- **Maximize revenue** - Fill more tables throughout service
- **Better reviews** - No overcrowding, smooth service

### For Customers
- **Honest availability** - Clear yes/no answers
- **Better alternatives** - Smart suggestions near requested time
- **Realistic expectations** - Know how long they can dine

### For Staff
- **Predictable flow** - Staggered arrivals
- **Proper spacing** - Not everyone arrives at once
- **Less stress** - No scrambling to fit extra tables

## 🆘 Troubleshooting

### "Everything shows as unavailable"

**Check:**
1. Is Capacity set in Restaurant Info table?
2. Are existing reservations marked as "Confirmed"?
3. Is the Time field in "HH:MM" format (not "7pm")?

**Fix:**
```
Capacity: 60  ← Must be a number
Time: 19:00   ← Not "7:00 PM" or "7pm"
Status: Confirmed  ← Exact spelling matters
```

### "System allows overbooking"

**Check:**
1. Are party sizes entered correctly?
2. Is Date field properly formatted?
3. Are all reservations in the same table?

**Fix:**
- Verify Party Size is a number field
- Check Date is YYYY-MM-DD format
- Confirm using RESERVATIONS_TABLE_ID

### "No alternative times suggested"

**Reasons:**
1. Party size exceeds capacity (40 people in 30-seat restaurant)
2. All time slots genuinely full
3. Outside opening/closing hours

**Solution:**
- Suggest different date
- Offer waiting list
- Recommend off-peak times (lunch vs dinner)

## 📚 More Information

- Full technical details: See `AVAILABILITY-SYSTEM.md`
- Run tests: `node api/_lib/availability-calculator.test.js`
- API documentation: See `README.md`

## 🎓 Key Takeaways

1. **Always check availability before booking**
2. **Offer alternatives when slot is full**
3. **Trust the system** - it prevents overbooking
4. **Configure properly** - capacity and hours matter
5. **Test thoroughly** - run test file to understand behavior

---

**Remember:** This system is designed to maximize your capacity while preventing overbooking. Trust it, and you'll serve more customers with better experiences! 🎉
