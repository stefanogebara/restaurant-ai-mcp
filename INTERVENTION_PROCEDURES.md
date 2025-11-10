# No-Show Risk Intervention Procedures

## Overview

Your restaurant AI system automatically calculates a **risk score (0-100)** and **risk level** for every reservation, then recommends appropriate interventions to maximize ROI while preventing no-shows.

**Target ROI: 300-500%** (€3-€5 saved per €1 spent on interventions)

---

## Risk Levels & Score Ranges

| Risk Level | Score Range | Action Required | Intervention Needed |
|------------|-------------|-----------------|---------------------|
| **Low** | 0-24 | Monitor only | ❌ No intervention |
| **Medium** | 25-49 | Monitor only | ❌ No intervention |
| **High** | 50-74 | Active intervention | ✅ Confirmation call |
| **Very High** | 75-100 | Strong intervention | ✅ Deposit required |

---

## Intervention Types & Procedures

### 1. ❌ No Intervention (Low/Medium Risk: 0-49)

**When Applied:**
- Reliable repeat customers
- Good booking history
- Small parties (1-4 people)
- Sweet spot lead time (2-7 days)
- Off-peak times

**Procedure:**
- No action required
- Let customer arrive naturally
- Standard automated confirmation email

**Cost:** €0
**Expected ROI:** N/A (no intervention needed)

---

### 2. ✅ Confirmation Call (High Risk: 50-74)

**When Applied:**
- New customers with moderate risk factors
- Medium-large parties (4-6 people)
- Short notice bookings (24-48 hours)
- Prime time slots (Friday/Saturday 7-9 PM)
- Customers with 10-30% no-show history

**Procedure:**
1. **24 Hours Before Reservation:**
   - Staff calls customer to confirm reservation
   - Verify party size, time, and any special requests
   - Remind about cancellation policy (24h notice)
   - Note customer response in system

2. **Script:**
   ```
   "Hello [Name], this is [Restaurant Name] calling to confirm your
   reservation for [Party Size] on [Date] at [Time]. We're looking
   forward to welcoming you! Can you confirm you'll be joining us?"

   If YES: "Perfect! See you tomorrow at [Time]."
   If NO: "Thank you for letting us know. Would you like to reschedule?"
   ```

3. **Documentation:**
   - Update `ml_interventions` table with `action_taken: true`
   - Record `intervention_type: 'confirmation_call'`
   - Track outcome later (showed_up / no_show / cancelled)

**Cost:** €3 (5-10 minutes of staff time)
**Expected Value Saved:** €50 (average table revenue)
**Expected ROI:** 1,567% (€50 / €3 × 100)

---

### 3. ✅ Deposit Required (Very High Risk: 75-100)

**When Applied:**
- Very large parties (8+ people)
- Customers with >30% no-show history
- Last-minute bookings (<2 hours notice)
- Tourist customers (travel uncertainty)
- Prime time + multiple risk factors combined

**Procedure:**
1. **At Booking Time:**
   - System automatically requires credit card deposit
   - Charge €10-20 per person as hold
   - Send confirmation with deposit policy

2. **Email Template:**
   ```
   Dear [Name],

   Your reservation for [Party Size] on [Date] at [Time] is confirmed!

   DEPOSIT REQUIRED: €[Amount] per person
   This deposit will be credited toward your final bill.

   CANCELLATION POLICY:
   - Free cancellation up to 24 hours before
   - Within 24 hours: Deposit is non-refundable

   We look forward to serving you!
   ```

3. **Payment Processing:**
   - Use Stripe/Square to hold funds
   - Automatic release if customer shows up (applied to bill)
   - Automatic charge if no-show occurs

4. **Documentation:**
   - Record `intervention_type: 'deposit_required'`
   - Track deposit amount in `cost_of_intervention`
   - If customer shows: `value_saved = average_table_revenue`
   - If customer no-shows: Deposit partially covers loss

**Cost:** €2 (payment processing fees)
**Expected Value Saved:** €50-150 (large party revenue)
**Expected ROI:** 2,400% (€50 / €2 × 100)

**Research-Backed Impact:**
- Deposits reduce no-shows by **57%** (industry data)
- Customers **72% less likely** to cancel last-minute

---

## Additional Intervention Types (Future Implementation)

Your system's ML model tracks these intervention types, though they may not be fully automated yet:

### 4. SMS Reminder
**When:** Medium-high risk (40-60 score)
**Cost:** €0.05 per SMS
**Procedure:**
- Automated SMS 4 hours before reservation
- Include link to confirm or cancel
- Track click-through rate

### 5. Email Reminder
**When:** Medium risk (30-50 score)
**Cost:** €0 (automated)
**Procedure:**
- Automated email 48 hours before
- Personalized with special requests/dietary needs
- Include "Add to Calendar" button

### 6. Premium Seating Upgrade
**When:** Loyal customers with temporary risk factors
**Cost:** €0 (goodwill gesture)
**Procedure:**
- Offer best table/window seat
- Personal touch to increase commitment
- "We've saved our best table for you"

---

## Risk Factor Breakdown

### What INCREASES No-Show Risk:

**Customer History (30-40 points):**
- New customer with no history: +30
- Previous no-show rate >30%: +40
- Previous no-show rate 10-30%: +20

**Party Size (5-25 points):**
- Very large party (8+ people): +25
- Large party (6-7 people): +15
- Medium party (4-5 people): +5

**Booking Lead Time (5-20 points):**
- **Last-minute (<2 hours):** +20 ⚠️
- **Short notice (<24 hours):** +10 ⚠️
- Far advance (>7 days): +5

> **NOTE:** After your recent fix, same-day URGENT bookings (<4 hours) should actually be LOWER risk in the ML model, but this older heuristic system still treats them as higher risk. Consider updating mlRiskScoring.js to match the new research-backed logic.

**Time Slot (8-15 points):**
- Prime time (Fri/Sat 7-9 PM): +15
- Peak dinner (any day 7-9 PM): +8

**Contact Info (10 points):**
- No email provided: +10

**Segovia-Specific Factors:**
- Tourist (international): +15
- Language barrier: +10
- Terrace + last-minute + weather: +12
- First-time visitor: +8

### What DECREASES No-Show Risk:

**Customer Reliability (-10 points):**
- Good history (<10% no-shows): -10

**Special Commitment (-10 points):**
- Birthday/Anniversary/Celebration: -10

**Dietary Planning (-5 points):**
- Dietary restrictions noted: -5 (shows intentionality)

**Local Customer (-5 points):**
- Local vs tourist: -5

---

## ROI Calculation

For each intervention, the system tracks:

**Cost of Intervention:**
- Confirmation call: €3 (staff time)
- Deposit processing: €2 (payment fees)
- SMS reminder: €0.05 per message
- Email reminder: €0 (automated)

**Value Saved (if successful):**
- Small party (2 people): €50-80
- Medium party (4 people): €100-150
- Large party (6+ people): €150-300

**ROI Formula:**
```
ROI = (value_saved / cost_of_intervention) × 100
```

**Example:**
- Intervention: Confirmation call (€3)
- Customer shows up (would have no-showed without call)
- Party of 4 spends €120
- Value saved: €120
- ROI: (€120 / €3) × 100 = **4,000%** ✅

**Target ROI: 300-500%** means every €1 spent should save €3-€5.

---

## Workflow Integration

### 1. **Reservation Created** (Automated)
```
Customer makes reservation
    ↓
ML risk score calculated (0-100)
    ↓
Risk level determined (low/medium/high/very-high)
    ↓
Intervention recommendation generated
    ↓
Record saved to ml_interventions table
```

### 2. **Intervention Execution** (Manual/Automated)
```
IF risk_level = 'very-high':
    → Require deposit at booking time
    → Send deposit policy email

ELSE IF risk_level = 'high':
    → Schedule confirmation call for T-24 hours
    → Staff receives call reminder
    → Staff makes call and logs result

ELSE:
    → No intervention needed
    → Standard confirmation email only
```

### 3. **Outcome Tracking** (Post-Reservation)
```
Reservation time arrives
    ↓
Customer shows up OR no-shows
    ↓
Staff updates actual_outcome in ml_interventions
    ↓
System calculates:
    - value_saved (if showed up)
    - ROI percentage
    - Success rate of intervention
    ↓
Data feeds back into ML model training
```

---

## Dashboard Views

### ML Performance Dashboard (`/host-dashboard/ml`)

Shows real-time intervention performance:
- **Total ROI:** Current % across all interventions
- **Total Interventions:** Count in last 30 days
- **Success Rate:** % of interventions where customer showed up
- **Value Saved:** Total revenue protected
- **Cost:** Total spent on interventions
- **ROI Trend:** Weekly performance graph
- **Breakdown by Type:** Which interventions work best
- **Recent Interventions:** Live timeline of actions taken

### Recommendations Engine

System generates smart recommendations like:
- 🔥 **High Priority:** "Confirmation calls have 85% success rate - increase usage"
- ⚠️ **Medium Priority:** "Large party no-shows up 15% - consider deposits"
- ℹ️ **Low Priority:** "Prime time slots showing elevated risk"

---

## Best Practices

### ✅ DO:
- Call customers 24 hours before (not same-day)
- Be friendly and helpful on confirmation calls
- Make deposits clear and fair (24h cancellation policy)
- Track outcomes religiously for ML improvement
- Review ML Performance Dashboard weekly
- Adjust intervention thresholds based on your restaurant's data

### ❌ DON'T:
- Over-intervene on low-risk reservations (wastes money)
- Under-intervene on very-high risk (lose revenue)
- Forget to log intervention outcomes
- Charge deposits without clear policy
- Apply same rules to all customers (personalize based on history)

---

## Future Improvements

### Short-term:
- [ ] Automate SMS reminders for medium-risk reservations
- [ ] A/B test different intervention thresholds
- [ ] Add weather API for terrace booking risk

### Long-term:
- [ ] Train full ML model on your restaurant's actual data
- [ ] Implement dynamic pricing based on risk (higher deposits for higher risk)
- [ ] Add sentiment analysis on special requests
- [ ] Integrate with POS to track actual revenue per table
- [ ] Build automated calling system with AI voice

---

## Summary

**Your intervention strategy:**

| Risk Score | Risk Level | Action | Cost | Expected ROI |
|------------|------------|--------|------|--------------|
| 0-24 | Low | None | €0 | N/A |
| 25-49 | Medium | None | €0 | N/A |
| 50-74 | High | Confirmation Call | €3 | 1,500%+ |
| 75-100 | Very High | Deposit Required | €2 | 2,400%+ |

**The system automatically identifies high-risk reservations so you can take targeted action on the ~20% of bookings that need it, rather than burdening all customers with deposits or calls.**
