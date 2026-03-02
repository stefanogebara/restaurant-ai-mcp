# Phase 10 — Premium Booking Experience: Design

## Goal

Make the platform demo-ready for a live end-to-end walkthrough with restaurant owners and investors. Three vertical slices that tell one coherent story: a guest books on their phone, pays a deposit, and the host sees smart table suggestions and no-show risk — all in real time.

## Demo Story

> A guest opens the booking link on their phone, installs it to their home screen, selects a table, and pays a €20 deposit. The host dashboard instantly shows the reservation with a suggested table and a no-show risk score. The manager AI knows tonight has €60 in deposits at risk.

---

## Slice 1: PWA (Add to Home Screen + Push Notifications)

### What changes

The existing `/book/:slug` booking page becomes an installable PWA with push notifications.

### Manifest

Update `client/public/manifest.json` to support the booking page:
- `display: standalone`
- Correct icons (192×192, 512×512)
- `start_url: /book`

Chrome and Safari show the "Add to home screen" prompt automatically when the manifest is valid and the page is served over HTTPS.

### Service Worker

Register a service worker in `client/src/main.tsx`. Responsibilities:
1. Cache the booking page shell (offline support)
2. Handle incoming push events → show notification

### Push Notifications

After booking confirmation:
1. Browser requests push permission
2. `PushSubscription` (endpoint + p256dh + auth keys) stored in new `customer_push_subscriptions` table
3. Backend sends two notifications via `web-push` npm package:
   - Immediate: "Your booking at [Restaurant] is confirmed for [date/time]"
   - Reminder: 2 hours before reservation time (cron or scheduled job)

No login required — subscription tied to the booking record by `reservation_id`.

### New DB table

```sql
CREATE TABLE customer_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  reservation_id UUID REFERENCES reservations(id),
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New backend endpoints

- `POST /api/push-subscribe` — stores subscription, associates with reservation
- `POST /api/push-send` (internal, called by reminder cron) — sends notification via web-push

---

## Slice 2: Reservation Intelligence

### What changes

Two read-only intelligence signals surfaced in the host dashboard. No automated actions — suggestions only.

### No-show risk score

`api/batch-predict.js` already calculates no-show probabilities. Wire them into `ReservationsList.tsx`:

- Green badge: 0–20% risk
- Amber badge: 20–50% risk
- Red badge: 50%+ risk

No new backend endpoint needed — predictions already stored or computable from existing data.

### Smart table suggestion

New `tableAssignmentService.js` scores available tables by:
1. **Party size fit** — capacity ≥ party size; prefer smallest that fits
2. **Floor spread** — prefer tables far from already-occupied ones
3. **Host notes** — respect any per-table flags

New endpoint: `GET /api/table-suggestion?reservation_id=X`

Returns:
```json
{
  "suggested_table_id": "uuid",
  "table_name": "Table 4",
  "reasoning": "Seats 4, closest fit for party of 3, window area currently free"
}
```

Host dashboard shows "Suggested: Table 4" as a pre-fill in the assign-table flow. Host can override freely.

---

## Slice 3: Stripe Deposit

### What changes

Restaurants can require a card deposit to confirm a booking. Collected at booking time, captured on no-show, released on arrival.

### Configuration

New `deposit_config` JSONB column on `restaurant.restaurant_config`:
```json
{ "enabled": true, "type": "flat", "amount": 20 }
// or
{ "enabled": true, "type": "per_person", "amount": 10 }
```

Managed via `GET/PATCH /api/deposit-config`. UI in a new Payments tab in dashboard settings.

### Booking flow

After party size selection on `/book/:slug`, if deposit configured:
1. Frontend calls `POST /api/create-deposit-intent` → returns `client_secret`
2. Stripe Payment Element rendered (card input)
3. `stripe.confirmPayment()` with `capture_method: manual` — authorises card, does not charge
4. On success: reservation confirmed, `payment_intent_id` + `deposit_amount` stored on `reservations`

### New DB columns

```sql
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS deposit_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2);

ALTER TABLE restaurant.restaurant_config
  ADD COLUMN IF NOT EXISTS deposit_config JSONB DEFAULT '{"enabled": false}'::jsonb;
```

### Host dashboard

- Reservation cards show "€20 held" badge when deposit exists
- No-show flow: "Capture deposit" button → `POST /api/capture-deposit`
- Guest arrival: deposit hold released → `POST /api/release-deposit`

### Manager AI

Restaurant snapshot includes:
```
[DEPOSITS TONIGHT]
3 reservations with deposits held — total €60 at risk
```

### New backend endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/deposit-config` | GET/PATCH | Read/write restaurant deposit settings |
| `/api/create-deposit-intent` | POST | Create Stripe PaymentIntent (capture_method: manual) |
| `/api/capture-deposit` | POST | Capture held deposit on no-show |
| `/api/release-deposit` | POST | Cancel hold on guest arrival |

---

## Implementation Order

1. **DB migrations** — `customer_push_subscriptions`, deposit columns, `deposit_config`
2. **Slice 2: Reservation Intelligence** — lowest risk, no external dependencies
3. **Slice 1: PWA** — manifest + service worker + push subscribe/send
4. **Slice 3: Stripe Deposit** — deposit-config + create-intent + booking flow + capture/release

---

## Out of Scope

- Offline booking submission
- Partial deposit refunds
- Deposit reporting / reconciliation
- Automated no-show capture (always manual by host)
