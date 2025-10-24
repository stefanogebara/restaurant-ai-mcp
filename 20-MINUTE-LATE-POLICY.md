# 20-Minute Late Policy - Automatic No-Show Detection

**Implemented**: 2025-10-24
**Status**: Active in Production

## Policy Overview

If a customer is **20+ minutes late** for their reservation **without checking in or communicating with the restaurant**, their reservation is automatically marked as **"No-Show"** and any assigned tables are released back to available status.

## How It Works

### Automated Detection System

A **Vercel Cron Job** runs every **5 minutes** to check for late reservations.

### Detection Criteria

A reservation is flagged as late if ALL of the following conditions are met:

1. Reservation Date = Today
2. Reservation Status = "Confirmed"  
3. Reservation Time <= (Current Time - 20 minutes)
4. Check-In Status = Not checked in

### Automatic Actions Taken

When a late reservation is detected:

1. Reservation Status changed to "No-Show"
2. Updated At timestamp set to current time
3. Notes Field updated with "Automatically marked as no-show - 20+ minutes late without check-in"
4. Assigned Tables released back to "Available" status
5. Current Service ID cleared from tables

## Technical Implementation

### Files Modified/Created

**New Files**:
1. api/cron/check-late-reservations.js - Cron job endpoint
2. 20-MINUTE-LATE-POLICY.md - Documentation

**Modified Files**:
1. api/_lib/airtable.js - Added markReservationAsNoShow() function
2. vercel.json - Added cron job configuration

## Benefits

### For the Restaurant
- Automatic table release for better capacity management
- No manual monitoring required
- Accurate no-show analytics
- Fair and consistent policy

### For Customers
- 20-minute grace period for traffic/parking
- Check-in protection (calling ahead prevents auto-cancellation)
- Clear expectations encourage punctuality

