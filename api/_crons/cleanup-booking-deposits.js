const { supabaseAdmin } = require('../_lib/supabase');
const { retryChangedDeposits } = require('../_lib/deposit-change-release');
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
  const [quotes, changes] = await Promise.allSettled([
    supabaseAdmin.rpc('claim_public_booking_deposit_cleanup').then(({ data, error }) => {
      if (error) throw error;
      return Promise.all(data.map(quote => releaseRejectedDeposit(quote.id, quote.restaurant_id, quote.intent_id)));
    }),
    retryChangedDeposits(),
  ]);
  if (quotes.status === 'rejected' || changes.status === 'rejected') {
    await logCronError(job, 'Could not process the deposit release queue');
    return res.status(503).json({ success: false });
  }
  const released = quotes.value.filter(Boolean).length + changes.value.filter(state => state === 'released').length;
  const pending = quotes.value.filter(result => !result).length + changes.value.filter(state => state === 'pending').length;
  await logCronRun(job, { status: pending ? 'error' : 'success', released, pending });
  return res.status(pending ? 503 : 200).json({ success: pending === 0, released, pending });
};
