/**
 * Stress Test Cleanup
 *
 * Deletes all reservations created by the stress test (customer_name LIKE 'StressTest%').
 * Run after each stress test session.
 *
 * Usage: node stress-test/cleanup.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanup() {
  console.log('Cleaning up stress test reservations...');

  const { data, error } = await supabase
    .from('reservations')
    .delete()
    .like('customer_name', 'StressTest%')
    .select('reservation_id, date, time, status');

  if (error) {
    console.error('Cleanup failed:', error.message);
    process.exit(1);
  }

  console.log(`Deleted ${data?.length || 0} stress test reservations.`);
  if (data?.length) {
    data.forEach(r => console.log(`  - ${r.reservation_id} (${r.date} ${r.time}, ${r.status})`));
  }
}

cleanup();
