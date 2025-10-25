# Customer History Database Schema

**Purpose**: Track customer behavior across visits to improve no-show predictions

---

## Airtable Table: `Customer History`

### Fields Configuration

| Field Name | Field Type | Description | Formula/Options |
|------------|-----------|-------------|-----------------|
| **Customer ID** | Auto Number | Unique identifier (auto-generated) | Primary key |
| **Email** | Email | Customer email address | - |
| **Phone** | Phone Number | Customer phone number | - |
| **Customer Name** | Single Line Text | Full name | - |
| **First Visit Date** | Date | Date of first reservation | - |
| **Last Visit Date** | Date | Date of most recent completed reservation | - |
| **Total Reservations** | Number | Count of all reservations made | Integer |
| **Completed Reservations** | Number | Reservations that showed up | Integer |
| **No Shows** | Number | Reservations marked as no-show | Integer |
| **Cancellations** | Number | Reservations cancelled before date | Integer |
| **Average Party Size** | Number | Mean party size across all reservations | Decimal (1 place) |
| **Total Spend** | Currency | Lifetime spend (if tracked) | USD |
| **Average Spend Per Visit** | Currency | Mean spend per completed reservation | USD |
| **Favorite Time Slot** | Single Line Text | Most common reservation time | e.g., "19:00-20:00" |
| **Favorite Day** | Single Line Text | Most common day of week | e.g., "Friday" |
| **VIP Status** | Checkbox | High-value customer flag | Auto-set if spend >$1000 |
| **No Show Risk Score** | Number (Decimal) | Historical no-show probability | 0.00 to 1.00 |
| **Days Since Last Visit** | Number | Days since last completed reservation | Auto-calculated |
| **Notes** | Long Text | Special preferences, allergies, etc. | - |
| **Created At** | Created Time | Record creation timestamp | Auto |
| **Updated At** | Last Modified Time | Last update timestamp | Auto |

### Calculated Fields (Formulas)

**No Show Risk Score**:
```
IF(
  {Total Reservations} > 0,
  {No Shows} / {Total Reservations},
  0.15
)
```
- If customer has history: actual no-show rate
- If new customer: 15% default (industry average)

**Days Since Last Visit**:
```
IF(
  {Last Visit Date},
  DATETIME_DIFF(TODAY(), {Last Visit Date}, 'days'),
  0
)
```

**VIP Status** (Auto-set):
```
OR(
  {Total Spend} > 1000,
  AND(
    {Completed Reservations} >= 5,
    {No Show Risk Score} < 0.05
  )
)
```
- VIP if lifetime spend >$1000 OR (5+ visits AND <5% no-show rate)

### Example Record

```json
{
  "Customer ID": "1234",
  "Email": "john.smith@example.com",
  "Phone": "+1-555-123-4567",
  "Customer Name": "John Smith",
  "First Visit Date": "2024-03-15",
  "Last Visit Date": "2025-10-15",
  "Total Reservations": 8,
  "Completed Reservations": 7,
  "No Shows": 0,
  "Cancellations": 1,
  "Average Party Size": 3.5,
  "Total Spend": 1890.00,
  "Average Spend Per Visit": 270.00,
  "Favorite Time Slot": "19:00-20:00",
  "Favorite Day": "Friday",
  "VIP Status": true,
  "No Show Risk Score": 0.00,
  "Days Since Last Visit": 10,
  "Notes": "Prefers window seats, vegetarian options",
  "Created At": "2024-03-15T10:00:00Z",
  "Updated At": "2025-10-15T19:30:00Z"
}
```

---

## Airtable Table: `Reservations` (New ML Fields)

### New Fields to Add

| Field Name | Field Type | Description | Default Value |
|------------|-----------|-------------|---------------|
| **Customer History** | Link to Customer History | Links to customer record | - |
| **Booking Created At** | Date & Time | When booking was made | Auto (now) |
| **Booking Lead Time Hours** | Number | Hours between booking and reservation | Calculated |
| **Is Repeat Customer** | Checkbox | Customer has 1+ previous visits | From linked record |
| **Previous Visit Count** | Number | Count of past completed reservations | From linked record |
| **Previous No Show Count** | Number | Count of past no-shows | From linked record |
| **Customer No Show Rate** | Number (Decimal) | Historical no-show rate for customer | From linked record |
| **Is Special Occasion** | Checkbox | Birthday, anniversary, etc. | Manual/auto-detect |
| **Occasion Type** | Single Select | Type of special occasion | birthday/anniversary/celebration/none |
| **Confirmation Sent At** | Date & Time | When confirmation was sent | Auto (when sent) |
| **Confirmation Method** | Single Select | How confirmation was sent | email/sms/call/none |
| **Confirmation Clicked** | Checkbox | Customer clicked email/SMS link | Auto (webhook) |
| **Confirmation Response** | Single Select | Customer response to confirmation | confirmed/declined/no_response |
| **Deposit Required** | Checkbox | Deposit required for this reservation | Auto (party >= 6) |
| **Deposit Amount** | Currency | Deposit amount required | USD |
| **Deposit Paid** | Checkbox | Deposit payment received | Manual |
| **Deposit Paid At** | Date & Time | When deposit was received | Manual |
| **ML Risk Score** | Number (Decimal) | ML model no-show probability | 0.00 to 100.00 |
| **ML Risk Level** | Single Select | Risk category | low/medium/high |
| **ML Confidence** | Number (Decimal) | Model confidence in prediction | 0.00 to 1.00 |
| **ML Model Version** | Single Line Text | Version of model used | e.g., "v1.0.3" |
| **ML Top Factors** | Long Text | Top 3 contributing factors (JSON) | JSON array |
| **ML Prediction Timestamp** | Date & Time | When prediction was made | Auto |
| **ML Features Used** | Long Text | All features for this prediction (JSON) | JSON object |

### ML Fields Example

```json
{
  "Reservation ID": "RES-20251025-4321",
  "Customer Name": "Jane Doe",
  "Party Size": 2,
  "Date": "2025-10-30",
  "Time": "19:00",

  // CUSTOMER HISTORY LINK
  "Customer History": ["rec123abc"],
  "Booking Created At": "2025-10-25T14:30:00Z",
  "Booking Lead Time Hours": 124.5,
  "Is Repeat Customer": false,
  "Previous Visit Count": 0,
  "Previous No Show Count": 0,
  "Customer No Show Rate": 0.15,

  // SPECIAL OCCASION
  "Is Special Occasion": true,
  "Occasion Type": "birthday",

  // CONFIRMATION TRACKING
  "Confirmation Sent At": "2025-10-29T10:00:00Z",
  "Confirmation Method": "email",
  "Confirmation Clicked": true,
  "Confirmation Response": "confirmed",

  // DEPOSIT
  "Deposit Required": false,
  "Deposit Amount": null,
  "Deposit Paid": null,
  "Deposit Paid At": null,

  // ML PREDICTION
  "ML Risk Score": 18.5,
  "ML Risk Level": "low",
  "ML Confidence": 0.91,
  "ML Model Version": "v1.0.3",
  "ML Top Factors": "[\"Birthday reservation (-10%)\", \"Confirmation clicked (-12%)\", \"New customer (+15%)\"]",
  "ML Prediction Timestamp": "2025-10-25T14:31:00Z",
  "ML Features Used": "{\"booking_lead_time_hours\": 124.5, \"is_repeat_customer\": false, \"hour_of_day\": 19, \"is_prime_time\": true, \"is_special_occasion\": true, \"confirmation_clicked\": true}"
}
```

---

## Customer Lookup Strategy

### Find or Create Customer Flow

```javascript
async function findOrCreateCustomer(email, phone, name) {
  // 1. Try to find by email (primary)
  let customer = await findCustomerByEmail(email);

  // 2. If not found, try phone
  if (!customer && phone) {
    customer = await findCustomerByPhone(phone);
  }

  // 3. If still not found, create new
  if (!customer) {
    customer = await createCustomer({
      Email: email,
      Phone: phone,
      'Customer Name': name,
      'First Visit Date': TODAY,
      'Total Reservations': 0,
      'Completed Reservations': 0,
      'No Shows': 0,
      'Cancellations': 0,
      'No Show Risk Score': 0.15  // Default for new customers
    });
  }

  return customer;
}
```

### Update Customer History Flow

```javascript
async function updateCustomerHistory(customerId, reservation, outcome) {
  const customer = await getCustomer(customerId);

  // Increment counters based on outcome
  const updates = {
    'Total Reservations': customer.Total_Reservations + 1
  };

  if (outcome === 'completed') {
    updates['Completed Reservations'] = customer.Completed_Reservations + 1;
    updates['Last Visit Date'] = reservation.Date;
  } else if (outcome === 'no-show') {
    updates['No Shows'] = customer.No_Shows + 1;
  } else if (outcome === 'cancelled') {
    updates['Cancellations'] = customer.Cancellations + 1;
  }

  // Recalculate no-show risk score
  const totalReservations = updates['Total Reservations'];
  const noShows = updates['No Shows'] || customer.No_Shows;
  updates['No Show Risk Score'] = noShows / totalReservations;

  await updateCustomer(customerId, updates);
}
```

---

## Data Migration Plan

### Step 1: Backfill Customer History (Historical Data)

```javascript
async function backfillCustomerHistory() {
  console.log('[BACKFILL] Starting customer history backfill...');

  // Get all historical reservations (past 12 months)
  const reservations = await getAllReservations();

  // Group by customer (email + phone)
  const customerMap = new Map();

  for (const res of reservations) {
    const key = res.Customer_Email || res.Customer_Phone;
    if (!customerMap.has(key)) {
      customerMap.set(key, []);
    }
    customerMap.get(key).push(res);
  }

  console.log(`[BACKFILL] Found ${customerMap.size} unique customers`);

  // Create customer history records
  for (const [key, reservations] of customerMap.entries()) {
    const firstRes = reservations[0];
    const completedRes = reservations.filter(r => r.Status === 'completed');
    const noShows = reservations.filter(r => r.Status === 'no-show');
    const cancellations = reservations.filter(r => r.Status === 'cancelled');

    const customerData = {
      Email: firstRes.Customer_Email,
      Phone: firstRes.Customer_Phone,
      'Customer Name': firstRes.Customer_Name,
      'First Visit Date': findEarliestDate(reservations),
      'Last Visit Date': findLatestCompletedDate(completedRes),
      'Total Reservations': reservations.length,
      'Completed Reservations': completedRes.length,
      'No Shows': noShows.length,
      'Cancellations': cancellations.length,
      'Average Party Size': calculateAvgPartySize(completedRes),
      'No Show Risk Score': noShows.length / reservations.length
    };

    await createCustomer(customerData);
  }

  console.log(`[BACKFILL] ✅ Created ${customerMap.size} customer records`);
}
```

### Step 2: Link Reservations to Customer History

```javascript
async function linkReservationsToCustomers() {
  const reservations = await getAllReservations();

  for (const res of reservations) {
    const customer = await findOrCreateCustomer(
      res.Customer_Email,
      res.Customer_Phone,
      res.Customer_Name
    );

    await updateReservation(res.id, {
      'Customer History': [customer.id],
      'Is Repeat Customer': customer.Total_Reservations > 1,
      'Previous Visit Count': customer.Completed_Reservations,
      'Previous No Show Count': customer.No_Shows,
      'Customer No Show Rate': customer.No_Show_Risk_Score
    });
  }
}
```

---

## API Integration Points

### On New Reservation Created

```javascript
// api/reservations.js
async function createReservation(data) {
  // 1. Find or create customer
  const customer = await findOrCreateCustomer(
    data.customer_email,
    data.customer_phone,
    data.customer_name
  );

  // 2. Calculate booking lead time
  const bookingLeadTimeHours = calculateLeadTime(
    new Date(),
    new Date(`${data.date}T${data.time}`)
  );

  // 3. Create reservation with customer link
  const reservation = await airtableCreateReservation({
    ...data,
    'Customer History': [customer.id],
    'Booking Created At': new Date().toISOString(),
    'Booking Lead Time Hours': bookingLeadTimeHours,
    'Is Repeat Customer': customer.Total_Reservations > 0,
    'Previous Visit Count': customer.Completed_Reservations,
    'Previous No Show Count': customer.No_Shows,
    'Customer No Show Rate': customer.No_Show_Risk_Score
  });

  // 4. Update customer total reservations
  await updateCustomerHistory(customer.id, reservation, 'created');

  return reservation;
}
```

### On Reservation Completed

```javascript
// api/host-dashboard.js - handleCompleteService
async function completeReservation(reservationId) {
  const reservation = await getReservation(reservationId);

  // Update reservation status
  await updateReservation(reservationId, {
    Status: 'completed'
  });

  // Update customer history
  const customerId = reservation.Customer_History[0];
  await updateCustomerHistory(customerId, reservation, 'completed');
}
```

### On No-Show Detection

```javascript
// api/cron/check-late-reservations.js
async function markAsNoShow(reservationId) {
  const reservation = await getReservation(reservationId);

  // Update reservation
  await updateReservation(reservationId, {
    Status: 'no-show'
  });

  // Update customer history (increase no-show count)
  const customerId = reservation.Customer_History[0];
  await updateCustomerHistory(customerId, reservation, 'no-show');
}
```

---

## Privacy & Data Retention

### GDPR Compliance

- **Data Minimization**: Only collect necessary fields
- **Retention Policy**: Keep customer history for 24 months max
- **Right to Erasure**: Provide delete customer function
- **Data Export**: Allow customers to download their data

### Delete Customer Function

```javascript
async function deleteCustomerData(customerId) {
  // 1. Remove link from all reservations
  const reservations = await getReservationsByCustomer(customerId);
  for (const res of reservations) {
    await updateReservation(res.id, {
      'Customer History': []
    });
  }

  // 2. Delete customer record
  await deleteCustomer(customerId);

  console.log(`Customer ${customerId} data deleted successfully`);
}
```

---

**Schema Version**: 1.0
**Created**: 2025-10-25
**Status**: Ready for Implementation
**Next**: Create customer-history.js service
