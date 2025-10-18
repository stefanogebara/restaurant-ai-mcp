# Waitlist "Seat Now" Integration Guide

## Overview
This guide shows how to connect the "Seat Now" buttons in WaitlistPanel to the existing SeatPartyModal flow.

## Changes Required

### 1. Update HostDashboard.tsx

**File**: `client/src/pages/HostDashboard.tsx`

**Change**: Add `onSeatFromWaitlist` prop to WaitlistPanel

```typescript
// Line ~137: Replace this
<WaitlistPanel />

// With this
<WaitlistPanel
  onSeatFromWaitlist={(entry) => {
    // Open table recommendation and seating flow
    setSeatPartyData({
      type: 'walk-in',
      customer_name: entry.customer_name,
      customer_phone: entry.customer_phone,
      party_size: entry.party_size,
      special_requests: entry.special_requests || '',
      table_ids: [], // Will show table recommendations first
    });
  }}
/>
```

### 2. Update WaitlistPanel.tsx  

**File**: `client/src/components/host/WaitlistPanel.tsx`

**Changes**:

**A. Add Props Interface** (after line 23)
```typescript
interface WaitlistPanelProps {
  onSeatFromWaitlist?: (entry: WaitlistEntry) => void;
}
```

**B. Update Component Declaration** (line 25)
```typescript
// Replace this
export default function WaitlistPanel() {

// With this
export default function WaitlistPanel({ onSeatFromWaitlist }: WaitlistPanelProps = {}) {
```

**C. Replace "Seat Now" Button Logic** (lines 202-210)
```typescript
// Replace this
<button
  onClick={() => {
    alert('Seat Now functionality will be integrated with existing seat party flow');
  }}
  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
>
  Seat Now
</button>

// With this
<button
  onClick={() => onSeatFromWaitlist?.(entry)}
  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
>
  Seat Now
</button>
```

**D. Replace Second "Seat Now" Button** (lines 219-227 - for Notified status)
```typescript
// Same replacement as above
<button
  onClick={() => onSeatFromWaitlist?.(entry)}
  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
>
  Seat Now
</button>
```

## How It Works

### Flow Diagram
```
1. Host clicks "Seat Now" on waitlist entry
   ↓
2. onSeatFromWaitlist() handler called
   ↓
3. setSeatPartyData() opens table recommendation
   ↓
4. Host sees available table options (via checkWalkIn API)
   ↓
5. Host selects tables and confirms
   ↓
6. SeatPartyModal creates service record
   ↓
7. Customer is seated, waitlist entry can be marked "Seated"
```

### Optional Enhancement: Auto-Mark Seated

After seating completes, automatically update waitlist status:

```typescript
// In HostDashboard.tsx, modify SeatPartyModal onClose
<SeatPartyModal
  isOpen={seatPartyData !== null}
  data={seatPartyData}
  onClose={() => {
    // If this was from waitlist, mark as seated
    if (seatPartyData?.from_waitlist) {
      // Call API to update waitlist status
      fetch(`/api/waitlist?id=${seatPartyData.waitlist_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Seated' }),
      });
    }
    setSeatPartyData(null);
    success('Party seated successfully!');
  }}
/>
```

## Testing

1. Add customer to waitlist
2. Click "Notify" button
3. Click "Seat Now"
4. Verify SeatPartyModal opens with pre-filled customer info
5. Select tables and confirm seating
6. Verify service record is created

## Estimated Time

**Total**: 5-10 minutes
- Update HostDashboard.tsx: 2 minutes
- Update WaitlistPanel.tsx: 3-5 minutes
- Testing: 2-3 minutes

