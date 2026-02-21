/**
 * Stress Test Verifier
 *
 * Checks the database for double-bookings created during the stress test.
 * A double-booking means two confirmed reservations exist for the same
 * restaurant + date + time slot.
 *
 * Usage: node stress-test/verify.js
 * Exit code 1 if double-bookings found, 0 if clean.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verify() {
  console.log('Verifying no double-bookings...\n');

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('reservation_id, restaurant_id, date, time, status, customer_name')
    .like('customer_name', 'StressTest%')
    .in('status', ['confirmed', 'pending']);

  if (error) {
    console.error('Verify query failed:', error.message);
    process.exit(1);
  }

  console.log(`Found ${reservations.length} stress test reservations.\n`);

  // Group by restaurant_id + date + time
  const slots = {};
  for (const r of reservations) {
    const key = `${r.restaurant_id} | ${r.date} | ${r.time}`;
    if (!slots[key]) slots[key] = [];
    slots[key].push(r.reservation_id);
  }

  // Find slots with more than 1 reservation
  const doubleBookings = Object.entries(slots).filter(([, ids]) => ids.length > 1);

  if (doubleBookings.length > 0) {
    console.error('DOUBLE BOOKINGS DETECTED:');
    doubleBookings.forEach(([slot, ids]) => {
      console.error(`  Slot: ${slot}`);
      console.error(`  Reservation IDs: ${ids.join(', ')}`);
    });
    console.error(`\nTotal double-booked slots: ${doubleBookings.length}`);
    process.exit(1);
  }

  console.log('No double-bookings detected.');

  // Summary by status
  const byStatus = reservations.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log('\nReservation outcomes:');
  Object.entries(byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
}

verify();
