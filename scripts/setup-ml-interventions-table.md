# ML_Interventions Table Setup Guide

## Phase 2.1: Complete ML Interventions Table Configuration

This guide provides step-by-step instructions to finish setting up the ML_Interventions table in Airtable.

---

## Current Status

✅ **Table Created**: ML_Interventions (ID: `tbluYNiJ0PaiNy6LA`)
✅ **Field 1 Added**: Intervention ID (Autonumber)

**Remaining**: 11 fields need to be added manually

---

## Table Purpose

Track ML-driven interventions (deposits, confirmation calls, etc.) and link them to actual outcomes to calculate ROI and prove ML value.

---

## Quick Access

**Direct Table URL**: https://airtable.com/appm7zo5vOf3c3rqm/tbluYNiJ0PaiNy6LA

---

## Remaining Fields to Add (11 Fields)

### Field 2: Reservation ID (Link to Reservations)
- **Field Type**: Link to another record
- **Link to Table**: Reservations
- **Allow linking to multiple records**: No (single link only)
- **Description**:
  ```
  Links this intervention to the reservation that triggered it.
  Used to track which reservations received ML-driven interventions.
  ```

---

### Field 3: ML Risk Score (Number)
- **Field Type**: Number
- **Format**:
  - Precision: **2 decimal places**
  - Allow negative numbers: **No**
- **Description**:
  ```
  ML model no-show probability (0.00 to 100.00) at time of intervention.
  Stored here to track what risk level triggered the intervention.
  ```

---

### Field 4: ML Risk Level (Single Select)
- **Field Type**: Single select
- **Options** (add in this order with colors):
  1. `low` (Green)
  2. `medium` (Yellow)
  3. `high` (Orange)
  4. `very-high` (Red)
- **Description**:
  ```
  Risk category at time of intervention:
  - low: 0-25
  - medium: 25-50
  - high: 50-75
  - very-high: 75-100
  ```

---

### Field 5: Intervention Type (Single Select)
- **Field Type**: Single select
- **Options** (add in this order with colors):
  1. `deposit_required` (Red)
  2. `confirmation_call` (Orange)
  3. `premium_seating` (Blue)
  4. `none` (Gray)
- **Description**:
  ```
  Type of intervention applied:
  - deposit_required: Required prepayment to secure reservation
  - confirmation_call: Manual phone call to confirm attendance
  - premium_seating: Offered better table to increase commitment
  - none: High risk but no intervention taken (control group)
  ```

---

### Field 6: Action Taken (Checkbox)
- **Field Type**: Checkbox
- **Description**:
  ```
  Whether the intervention was actually applied.
  False = intervention recommended but not executed.
  True = intervention was applied to this reservation.
  ```

---

### Field 7: Action Timestamp (Date & Time)
- **Field Type**: Date & Time
- **Format**:
  - Date format: **ISO (2025-10-31)**
  - Time format: **24 hour (14:30)**
  - Include time: **Yes**
  - Time zone: **GMT**
- **Description**:
  ```
  When the intervention was applied.
  Used to calculate time between prediction and intervention.
  ```

---

### Field 8: Actual Outcome (Single Select)
- **Field Type**: Single select
- **Options** (add in this order with colors):
  1. `showed_up` (Green)
  2. `no_show` (Red)
  3. `cancelled` (Yellow)
- **Description**:
  ```
  What actually happened with this reservation:
  - showed_up: Customer arrived and was seated
  - no_show: Customer did not arrive (no-show)
  - cancelled: Customer cancelled before reservation time
  ```

---

### Field 9: Outcome Timestamp (Date & Time)
- **Field Type**: Date & Time
- **Format**:
  - Date format: **ISO (2025-10-31)**
  - Time format: **24 hour (14:30)**
  - Include time: **Yes**
  - Time zone: **GMT**
- **Description**:
  ```
  When the outcome was recorded.
  For showed_up: when party was seated
  For no_show: 15 minutes after reservation time
  For cancelled: when cancellation was processed
  ```

---

### Field 10: Cost of Intervention (Currency EUR)
- **Field Type**: Currency
- **Format**:
  - Currency: **EUR (€)**
  - Precision: **2 decimal places**
- **Description**:
  ```
  Direct cost of applying this intervention:
  - deposit_required: €0 (revenue neutral - refunded if shown)
  - confirmation_call: €5 (staff time cost)
  - premium_seating: €0 (no direct cost)
  - none: €0
  ```

---

### Field 11: Value Saved (Currency EUR)
- **Field Type**: Currency
- **Format**:
  - Currency: **EUR (€)**
  - Precision: **2 decimal places**
- **Description**:
  ```
  Revenue saved by preventing no-show:
  - If predicted high risk + intervention + showed_up: avg revenue per cover
  - Otherwise: €0

  Calculation: party_size × €45 (average revenue per cover)
  Example: Party of 4 × €45 = €180 saved
  ```

---

### Field 12: Notes (Long Text)
- **Field Type**: Long text
- **Description**:
  ```
  Additional context about this intervention:
  - Why was this intervention chosen?
  - Customer feedback about deposit/call
  - Special circumstances
  - Any issues during intervention process
  ```

---

## Step-by-Step Adding Process

1. **Open Table**: Navigate to https://airtable.com/appm7zo5vOf3c3rqm/tbluYNiJ0PaiNy6LA
2. **Click "+ Add Field"**: At the right end of the table header
3. **For each field above**:
   - Select the field type
   - Enter the field name exactly as shown
   - Configure format/options as specified
   - Click "Add description" and paste the description
   - Click "Create field"
4. **Verify**: All 12 fields should appear in the table

---

## Verification Checklist

After adding all fields, verify:
- [ ] Total of 12 fields in ML_Interventions table
- [ ] Intervention ID (Autonumber) exists
- [ ] Reservation ID links to Reservations table
- [ ] ML Risk Score and ML Risk Level use correct precision/options
- [ ] Intervention Type has 4 options (deposit_required, confirmation_call, premium_seating, none)
- [ ] Action Taken is a checkbox
- [ ] Action Timestamp and Outcome Timestamp include date and time
- [ ] Actual Outcome has 3 options (showed_up, no_show, cancelled)
- [ ] Cost of Intervention and Value Saved use EUR currency
- [ ] Notes is long text field
- [ ] All descriptions are clear and complete

---

## Integration Points

Once all fields are added:

### 1. Update Environment Variables (.env)
```bash
ML_INTERVENTIONS_TABLE_ID=tbluYNiJ0PaiNy6LA
```

### 2. Update Vercel Environment Variables
Add to Vercel dashboard:
```
ML_INTERVENTIONS_TABLE_ID=tbluYNiJ0PaiNy6LA
```

### 3. Next Phase - Build ROI Tracking (Phase 2.2)
After table setup is complete:
- Create outcome attribution logic (`api/_lib/ml-roi.js`)
- Link predictions → interventions → outcomes
- Calculate ROI metrics
- Build ROI API endpoint (`GET /api/ml-roi`)

---

## Field Mapping Reference

| Code Variable | Airtable Field Name |
|---------------|---------------------|
| `interventionId` | `Intervention ID` |
| `reservationId` | `Reservation ID` |
| `mlRiskScore` | `ML Risk Score` |
| `mlRiskLevel` | `ML Risk Level` |
| `interventionType` | `Intervention Type` |
| `actionTaken` | `Action Taken` |
| `actionTimestamp` | `Action Timestamp` |
| `actualOutcome` | `Actual Outcome` |
| `outcomeTimestamp` | `Outcome Timestamp` |
| `costOfIntervention` | `Cost of Intervention` |
| `valueSaved` | `Value Saved` |
| `notes` | `Notes` |

---

## Example Populated Record

```json
{
  "Intervention ID": 1,
  "Reservation ID": ["recABC123"],
  "ML Risk Score": 78.45,
  "ML Risk Level": "very-high",
  "Intervention Type": "deposit_required",
  "Action Taken": true,
  "Action Timestamp": "2025-11-01T10:30:00Z",
  "Actual Outcome": "showed_up",
  "Outcome Timestamp": "2025-11-01T19:00:00Z",
  "Cost of Intervention": 0.00,
  "Value Saved": 180.00,
  "Notes": "Customer initially hesitant about deposit but agreed. Showed up on time."
}
```

---

## ROI Calculation Logic (Phase 2.2)

Once table is complete, ROI will be calculated as:

```javascript
// For each intervention where action_taken = true and outcome = "showed_up"
const valueSaved = partySize * 45; // avg revenue per cover
const costOfIntervention = interventionType === 'confirmation_call' ? 5 : 0;
const netValue = valueSaved - costOfIntervention;

// Aggregate across all interventions
const totalValueSaved = sum(all netValue);
const totalCost = sum(all costOfIntervention);
const roi = (totalValueSaved - totalCost) / totalCost * 100;
```

**Target ROI**: 300-500% (€3-€5 saved for every €1 spent)

---

## Troubleshooting

### Field not saving values
- Check field type matches specification exactly
- Ensure number fields allow the full range (0-100)
- Verify Single select options are typed correctly (case-sensitive)

### Link to Reservations not working
- Ensure you selected "Reservations" table (not "Restaurant Tables" or other)
- Verify "Allow linking to multiple records" is set to NO

### Currency fields showing wrong symbol
- Change currency to EUR (€)
- Precision should be 2 decimal places

---

**Estimated Time**: 15-20 minutes

**Status**: 1 of 12 fields complete (Intervention ID added)

**Next Steps**:
1. Add remaining 11 fields manually using this guide
2. Update environment variables
3. Proceed to Phase 2.2 (Outcome Attribution Logic)

**Last Updated**: 2025-11-01
