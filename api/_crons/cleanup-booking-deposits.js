const { supabaseAdmin } = require('../_lib/supabase');
const { releaseRejectedDeposit } = require('../_lib/reservation-deposits');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronError, logCronRun } = require('../_lib/cron-tracker');
const { bearerEquals } = require('../_lib/secure-compare');

const job = 'cleanup-booking-deposits';

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || !bearerEquals(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  if (!(await isCronEnabled(job))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }
  const { data, error } = await supabaseAdmin.rpc('claim_public_booking_deposit_cleanup');
  if (error) {
    await logCronError(job, 'Could not claim expired deposit quotes');
    return res.status(503).json({ success: false });
  }
  const results = await Promise.all(data.map(quote => releaseRejectedDeposit(quote.id, quote.restaurant_id, quote.intent_id)));
  const released = results.filter(Boolean).length;
  const pending = results.length - released;
  await logCronRun(job, { status: pending ? 'error' : 'success', released, pending });
  return res.status(pending ? 503 : 200).json({ success: pending === 0, released, pending });
};
