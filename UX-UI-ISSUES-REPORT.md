# UX/UI Issues Report - Restaurant AI MCP
**Date**: 2025-10-27
**Testing Method**: Playwright Browser Automation + Visual Inspection
**Production URL**: https://restaurant-ai-mcp.vercel.app

---

## 🚨 CRITICAL ISSUES (Must Fix Immediately)

### Issue #1: Absurd Time Display - "2328 min ago"
**Location**: Host Dashboard > Active Parties
**Severity**: 🔴 CRITICAL - User Experience Breaking

**Problem**:
- Party shows "Seated 2328 min ago" (38+ hours!)
- Shows "⚠️ 2239 min OVERDUE" (37+ hours overdue!)
- Clearly old test data that was never cleaned up

**Visual Evidence**:
```
Test ML Customer 2
Party of 2
Seated 2328 min ago  ⚠️ 2239 min OVERDUE
```

**Root Cause**:
- Service record created during ML prediction testing
- Never completed/cleaned from production database
- Time calculation is technically correct but absurd

**Fix Required**:
1. Clean up old test service records from Airtable
2. Better time formatting for long durations:
   - < 60 min: "45 min ago"
   - 60-120 min: "1h 15m ago"
   - > 24h: "1 day 14h ago" OR mark as data error

**Impact**: Makes entire dashboard look broken/unreliable

---

### Issue #2: Waitlist Shows Invalid Data - "? guests"
**Location**: Host Dashboard > Waitlist Panel
**Severity**: 🔴 CRITICAL - Shows Broken Data

**Problem**:
Multiple waitlist entries with invalid/null data:
- Name: "Unknown"
- Party size: "?"
- Wait time: "~? min wait"
- "Added 214h 44m ago" (9 days old!)
- "Added 142h 47m ago" (6 days old!)

**Visual Evidence**:
```
? Unknown Notified
👥 ? guests
⏱️ ~? min wait
Added 214h 44m ago
```

**Root Cause**:
- Old test waitlist entries with NULL values
- No data validation on waitlist creation
- No automatic cleanup of old entries

**Fix Required**:
1. Add NULL checks in waitlist display component
2. Clean old test data from production Airtable
3. Add data validation: require party_size, customer_name
4. Auto-archive waitlist entries older than 24 hours

**Impact**: Users cannot trust waitlist data, looks unprofessional

---

### Issue #3: Missing Refresh Indicator
**Location**: Host Dashboard > Header
**Severity**: 🟡 MEDIUM - User Awareness

**Problem**:
- Real-time polling is working (30s interval)
- BUT users don't know when data refreshes
- Just added refresh indicator but not deployed yet

**Fix Required**:
- Deploy current changes with refresh indicator
- Shows "Refreshing..." with pulsing dot when fetching
- Shows "Updated Xs ago" when idle

**Status**: ✅ ALREADY FIXED - Awaiting deployment

---

## ⚠️ MEDIUM PRIORITY ISSUES

### Issue #4: Time Formatting Inconsistency
**Location**: Multiple components
**Severity**: 🟡 MEDIUM - UX Polish

**Problem**:
- Active parties: "2328 min ago"
- Waitlist: "214h 44m ago"
- Inconsistent formatting across components

**Fix Required**:
Create unified time formatting utility:
```typescript
// utils/timeFormatting.ts
export function formatTimeAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes/60)}h ${minutes%60}m ago`;
  return `${Math.floor(minutes/1440)}d ${Math.floor((minutes%1440)/60)}h ago`;
}
```

**Impact**: Improved readability and professional appearance

---

### Issue #5: Old Test Data Pollution
**Location**: Production Airtable Database
**Severity**: 🟡 MEDIUM - Data Quality

**Problem**:
Production contains old test data:
- Service record from ML testing (38+ hours old)
- 3 waitlist entries (6-9 days old)
- Likely other test reservations

**Fix Required**:
1. Connect to Airtable and clean:
   - Delete service records older than 12 hours
   - Delete waitlist entries older than 24 hours
   - Mark as test: any customer with "Test" in name
2. Add environment variable: `NODE_ENV=production`
3. Block test data creation in production

**Impact**: Clean, trustworthy production environment

---

## ✅ WORKING WELL (No Issues Found)

1. **Glass UI Effect**: ✅ Beautiful frosted glass header
2. **Stats Cards**: ✅ Clear, well-formatted metrics
3. **Table Grid**: ✅ Color-coded status is clear
4. **Drag-and-Drop**: ✅ "Drag to table" indicator visible
5. **Reservations Calendar**: ✅ Clean accordion layout
6. **Modal Buttons**: ✅ Good contrast and hover states
7. **Overall Layout**: ✅ Responsive, professional design

---

## 📋 TESTING CHECKLIST

### Host Dashboard
- ✅ Page loads without errors
- ✅ Stats cards display correctly (42 capacity, 14 available, 28 occupied, 67% occupancy)
- ✅ Table grid renders all tables with color-coded status
- ✅ Glass UI effect on sticky header
- 🔴 Active parties shows bad time data (2328 min ago = 38+ hours)
- 🔴 Waitlist shows invalid entries ("?" guests, NULL names)
- ✅ Reservations calendar works (8 reservations, 27 guests)
- ✅ Drag-and-drop indicator visible
- ⏳ Refresh indicator (fixed, awaiting deployment)
- ⏳ Auto-refresh functionality (30s interval - works but need to verify live)

### Analytics Dashboard
- ✅ Page loads without errors
- ✅ All charts render correctly (Reservation Trends, Peak Hours, Day of Week)
- ✅ Stats cards show real data (46 reservations, 18 completed, 3.1 avg party size)
- ✅ No-show predictions working (1 high risk reservation at 75%)
- ✅ Revenue opportunities displayed ($41,468 total potential)
- ✅ Table utilization heatmap showing usage (Table 4: 38.9% most used)
- ✅ Status breakdown pie chart (38 Confirmed, 6 Cancelled, 1 Completed, 1 Seated)
- 🟡 All customer names are "Test" variants (test data pollution)
- ✅ Glass UI effect on header
- ✅ Back to Dashboard navigation works

### Customer Portal
- ✅ Page loads without errors
- ✅ Clean, professional design
- ✅ Dual lookup system (Reservation ID / Phone Number)
- ✅ Toggle between lookup methods works
- ✅ Helpful hint text displayed
- ✅ Glass UI effect on header
- ✅ Staff Dashboard link works
- ⏳ Need to test actual reservation lookup
- ⏳ Need to test modify/cancel flows

### Observability Dashboard
- ⏳ Not tested yet (Week 7-8 feature)

---

## 🎯 RECOMMENDED FIX ORDER

### Phase 1: Data Cleanup (15 min)
1. Delete old service record (Test ML Customer 2)
2. Delete old waitlist entries
3. Verify clean production state

### Phase 2: Code Fixes (30 min)
1. Add NULL checks for waitlist display
2. Create unified time formatting utility
3. Apply formatting to all time displays
4. Add data validation for waitlist creation

### Phase 3: Deploy (10 min)
1. Commit and push code changes
2. Verify Vercel deployment
3. Test all fixes in production

**Total Time**: ~55 minutes

---

## 📸 Screenshots

**Host Dashboard Overview**:
- File: `host-dashboard-ux-check.png`
- Location: `C:\Users\stefa\.playwright-mcp\`

**Issues Visible**:
- Active party showing 2328 min ago
- Waitlist showing "? guests"
- Old test data throughout

---

**Next Steps**: Clean production data, fix time formatting, deploy fixes
