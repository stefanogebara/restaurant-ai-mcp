# Phase 2: Host Station Interface - Design Document

## Overview

Build a real-time web interface for restaurant hosts to manage table assignments, check-ins, and service flow.

## User Personas

**Primary User:** Restaurant Host/Hostess
- Needs to see all tables at a glance
- Manages customer arrivals (reservations + walk-ins)
- Assigns tables quickly during rush hours
- Tracks when tables will be available
- Marks tables as clean after busser finishes

## Core Features

### 1. Real-Time Dashboard
**Layout:** Split screen design
- **Left Panel (60%):** Visual table grid
- **Right Panel (40%):** Active parties + upcoming reservations

**Table Grid:**
- Visual representation of restaurant floor plan
- Color-coded table status:
  - 🟢 Green: Available
  - 🔴 Red: Occupied (with timer showing time remaining)
  - 🟡 Yellow: Being Cleaned
  - 🔵 Blue: Reserved (for upcoming reservation)
- Click table to see details
- Shows table number, capacity, location

**Active Parties List:**
- Customer name
- Party size
- Time seated
- Estimated departure (countdown timer)
- "Complete Service" button
- Tables assigned

**Upcoming Reservations:**
- Next 2 hours
- Customer name, party size, time
- "Check In" button when customer arrives

### 2. Check-In Flow
**Trigger:** Click "Check In" on reservation

**Steps:**
1. Display reservation details
2. Call `/api/host/check-in` → Get table recommendations
3. Show recommended tables on grid (highlighted)
4. Display alternative options
5. Host clicks preferred table(s)
6. Confirm and proceed to seat

### 3. Seat Party Flow
**Trigger:** After check-in OR for walk-ins

**For Reservations:**
1. Tables pre-selected from check-in
2. Show summary:
   - Customer name
   - Party size
   - Selected tables (with total capacity)
   - Estimated duration & departure time
3. "Confirm Seating" button
4. Call `/api/host/seat-party`
5. Update grid in real-time

**For Walk-ins:**
1. "Add Walk-in" button at top
2. Modal appears:
   - Party size input
   - Customer name
   - Customer phone
   - Preferred location dropdown
3. Call `/api/host/check-walk-in`
4. Show available tables
5. Host selects table(s)
6. Call `/api/host/seat-party` with walk-in type
7. Update grid

### 4. Complete Service Flow
**Trigger:** Click "Complete Service" on active party

**Steps:**
1. Confirm dialog: "Party of 4 for John Smith departing?"
2. Call `/api/host/complete-service`
3. Tables change to "Being Cleaned" (yellow)
4. Show success message
5. Update grid and active parties list

### 5. Mark Table Clean Flow
**Trigger:** Click yellow "Being Cleaned" table

**Steps:**
1. Quick confirmation: "Mark Table T3 as clean?"
2. Call `/api/host/mark-table-clean`
3. Table changes to "Available" (green)
4. Show success notification
5. Update grid

## Component Architecture

```
src/pages/
  HostDashboard.tsx          # Main page, manages state and polling

src/components/host/
  TableGrid.tsx              # Visual table grid
  TableCard.tsx              # Individual table component
  ActivePartiesList.tsx      # Right panel - active services
  UpcomingReservations.tsx   # Right panel - next 2 hours
  CheckInModal.tsx           # Reservation check-in flow
  SeatPartyModal.tsx         # Seat assignment confirmation
  WalkInModal.tsx            # Walk-in customer form
  CompleteServiceDialog.tsx  # Confirmation dialog
  DashboardStats.tsx         # Summary stats at top

src/hooks/
  useHostDashboard.ts        # Fetch dashboard data with polling
  useCheckIn.ts              # Check-in API calls
  useSeatParty.ts            # Seat party API calls
  useCompleteService.ts      # Complete service API calls

src/types/
  host.types.ts              # TypeScript interfaces
```

## API Integration

### Dashboard Polling
```typescript
// Poll every 30 seconds for real-time updates
const { data, refetch } = useQuery({
  queryKey: ['hostDashboard'],
  queryFn: () => fetch('/api/host/dashboard').then(r => r.json()),
  refetchInterval: 30000,
  refetchIntervalInBackground: true
});
```

### Optimistic Updates
After actions, immediately refetch dashboard to show changes:
```typescript
const completeMutation = useMutation({
  mutationFn: (serviceId) =>
    fetch('/api/host/complete-service', {
      method: 'POST',
      body: JSON.stringify({ service_record_id: serviceId })
    }),
  onSuccess: () => {
    queryClient.invalidateQueries(['hostDashboard']);
  }
});
```

## UI/UX Specifications

### Colors
- **Available:** `bg-green-100 border-green-500`
- **Occupied:** `bg-red-100 border-red-500`
- **Being Cleaned:** `bg-yellow-100 border-yellow-500`
- **Reserved:** `bg-blue-100 border-blue-500`

### Table Card Layout
```
┌─────────────────┐
│  T3        👥4  │  ← Table number + capacity icon
│  Main Room      │  ← Location
│  🔴 Occupied    │  ← Status with color
│  ⏱ 45 min left │  ← Time remaining (if occupied)
└─────────────────┘
```

### Responsive Design
- **Desktop (>1024px):** Split 60/40 layout
- **Tablet (768-1024px):** Stack vertically, tables on top
- **Mobile (<768px):** List view only, simplified interface

## State Management

Use React Query for server state:
- Dashboard data (polled)
- Mutations for check-in, seat, complete, clean

Use React useState for UI state:
- Selected tables
- Open modals
- Form inputs

## Error Handling

### Network Errors
- Show toast notification
- Retry button
- Don't clear UI state

### Validation Errors
- Inline error messages
- Highlight invalid fields
- Prevent submission

### Success Feedback
- Green toast notification
- Auto-dismiss after 3 seconds
- Update UI immediately

## Performance Optimizations

1. **Memoization:** Memoize table grid to prevent unnecessary re-renders
2. **Virtualization:** If >50 tables, use virtual scrolling
3. **Debouncing:** Debounce search/filter inputs
4. **Lazy Loading:** Code-split modals
5. **Optimistic Updates:** Update UI before API response

## Accessibility

- **Keyboard Navigation:** Tab through tables, Enter to select
- **Screen Reader:** Descriptive labels for all interactive elements
- **Focus Management:** Return focus after modal closes
- **ARIA Labels:** Proper roles and labels for dynamic content

## Mobile Considerations

### Gestures
- Swipe on party to reveal "Complete" button
- Pull to refresh dashboard
- Long press table for details

### Simplified View
- Remove table grid, show list instead
- Priority: Active parties first, then available tables
- Sticky "Add Walk-in" button at bottom

## Testing Strategy

### Unit Tests
- Table status color logic
- Time calculations (remaining, duration)
- Form validation

### Integration Tests
- Check-in flow
- Walk-in flow
- Complete service flow
- Polling behavior

### E2E Tests (Playwright)
- Full reservation arrival → seating → departure
- Walk-in customer flow
- Multiple simultaneous actions
- Real-time updates across tabs

## Deployment

### Build
```bash
npm run build
```

### Environment Variables (Already Set)
- API calls go to same domain (Vercel)
- No additional env vars needed

### Monitoring
- Track API response times
- Monitor polling interval performance
- Log user actions for analytics

## Future Enhancements (Phase 3+)

- **Drag & Drop:** Drag reservations onto tables
- **Floor Plan Editor:** Visual table layout designer
- **Waitlist:** Queue management for no available tables
- **Notifications:** Alert when table is ready
- **Multi-location:** Support multiple restaurant locations
- **Server Assignment:** Assign servers to tables
- **Table Combinations:** Visual indicator for combined tables

## Timeline Estimate

- **Dashboard Layout:** 2-3 hours
- **Table Grid Component:** 3-4 hours
- **Check-in Flow:** 2-3 hours
- **Seat Party Flow:** 2-3 hours
- **Complete Service Flow:** 1-2 hours
- **Real-time Polling:** 1 hour
- **Styling & Polish:** 2-3 hours
- **Testing:** 2-3 hours

**Total:** ~15-20 hours

## Getting Started

1. Create page route: `/host` or `/host/dashboard`
2. Build TableGrid with mock data first
3. Add API integration with real endpoints
4. Implement modals one by one
5. Add polling last
6. Test thoroughly

---

**Status:** Ready to implement ✅
**Dependencies:** Phase 1 API endpoints (deployed)
**Next Step:** Create `src/pages/HostDashboard.tsx`
