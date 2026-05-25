/**
 * Cron Job: Demo Nurture Emails
 *
 * Sends conversion emails to demo users at:
 * - Day-3 email: demos expiring in ~96h (4 days left) — feature spotlight + social proof
 * - Day-5 email: demos expiring in ~48h (2 days left) — urgency reminder
 * - Day-7 email: demos expiring today — last-chance CTA
 *
 * Runs daily at 10 AM UTC — "0 10 * * *"
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
const { Resend } = require('resend');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');

initSentry();
const logger = createSecureLogger('CronDemoNurture');

const BASE_URL = process.env.CLIENT_URL || 'https://seatable.one';

// Resend free tier: 10 req/s burst limit. Add 100ms delay between sends to stay safe.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FROM_ADDRESS = 'Seatable <bookings@seatable.one>';

// Lazy-init Resend client (same pattern as api/demo.js)
let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// ---------------------------------------------------------------------------
// Email: day-3 nurture (4 days left) — feature spotlight + social proof
// ---------------------------------------------------------------------------
async function sendDay3Email({ contactName, contactEmail, restaurantName, demoToken }) {
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping day-3 nurture email');
    return { success: false, reason: 'no_resend_key' };
  }

  const ctaUrl = `${BASE_URL}/demo/${demoToken}`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: contactEmail,
      subject: `How are you getting on with your ${restaurantName} demo?`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
              Seatable<span style="color: #9F1239;">.</span>
            </h1>
          </div>

          <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
            <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
              Hi ${contactName}, you have 4 days left
            </h2>
            <p style="color: #57534E; margin: 0 0 20px 0;">
              Your <strong>${restaurantName}</strong> demo is halfway through. Most restaurant
              managers who convert to a paid account try one thing first: the live booking widget.
            </p>
            <p style="color: #57534E; margin: 0 0 24px 0;">
              Paste your booking link anywhere — Instagram bio, Google listing, WhatsApp — and watch
              reservations come in without a single phone call. Guests book in their own language,
              at any hour.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${ctaUrl}"
                 style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
                Open My Demo Dashboard
              </a>
            </div>
          </div>

          <div style="background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h3 style="font-size: 15px; color: #92400E; margin: 0 0 12px 0;">What restaurants say after the first week</h3>
            <p style="color: #78350F; font-style: italic; margin: 0 0 12px 0; line-height: 1.7;">
              &ldquo;We used to miss bookings every Friday night because the phone was engaged.
              Now the AI takes them all — even at 2am. Setup took 8 minutes.&rdquo;
            </p>
            <p style="color: #A16207; font-size: 13px; margin: 0;">
              — Restaurant owner, Trattoria da Marco, Milan
            </p>
          </div>

          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <p style="color: #166534; font-size: 14px; margin: 0; line-height: 1.7;">
              <strong>No per-cover commission.</strong> No contracts. If you sign up before your demo
              expires, your tables, reservations, and settings carry over automatically.
            </p>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
            <p style="color: #A8A29E; font-size: 12px; margin: 0;">
              Powered by Seatable - AI Restaurant Management
            </p>
          </div>
        </div>
      `,
    });
    logger.info(`Day-3 nurture email sent to: ${contactEmail}`);
    return { success: true };
  } catch (err) {
    logger.error(`Failed to send day-3 nurture email to ${contactEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Email: day-5 nurture (2 days left)
// ---------------------------------------------------------------------------
async function sendDay5Email({ contactName, contactEmail, restaurantName, demoToken }) {
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping day-5 nurture email');
    return { success: false, reason: 'no_resend_key' };
  }

  const ctaUrl = `${BASE_URL}/login?from=demo&token=${demoToken}`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: contactEmail,
      subject: `Your Seatable demo expires in 2 days`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
              Seatable<span style="color: #9F1239;">.</span>
            </h1>
          </div>

          <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
            <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
              Hi ${contactName}, your demo expires in 2 days
            </h2>
            <p style="color: #57534E; margin: 0 0 24px 0;">
              You have 2 days left on your <strong>${restaurantName}</strong> demo.
              Sign up free to keep everything you've set up — your tables, reservations,
              and settings are all ready to go.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${ctaUrl}"
                 style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
                Sign Up Free — Keep My Demo
              </a>
            </div>
            <p style="color: #A8A29E; font-size: 13px; text-align: center; margin: 0;">
              No credit card required to get started.
            </p>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
            <p style="color: #A8A29E; font-size: 12px; margin: 0;">
              Powered by Seatable - AI Restaurant Management
            </p>
          </div>
        </div>
      `,
    });
    logger.info(`Day-5 nurture email sent to: ${contactEmail}`);
    return { success: true };
  } catch (err) {
    logger.error(`Failed to send day-5 nurture email to ${contactEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Email: day-7 nurture (last day)
// ---------------------------------------------------------------------------
async function sendDay7Email({ contactName, contactEmail, restaurantName, demoToken }) {
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping day-7 nurture email');
    return { success: false, reason: 'no_resend_key' };
  }

  const ctaUrl = `${BASE_URL}/login?from=demo&token=${demoToken}`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: contactEmail,
      subject: `Last day — your Seatable demo expires today`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
              Seatable<span style="color: #9F1239;">.</span>
            </h1>
          </div>

          <div style="background: #FFF7ED; border: 1px solid #FED7AA; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
            <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
              Hi ${contactName}, today is your last day
            </h2>
            <p style="color: #57534E; margin: 0 0 24px 0;">
              Today is your last day to keep your <strong>${restaurantName}</strong> demo.
              Sign up now — your data is waiting. Everything you configured is preserved
              and ready to transfer to your real account.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${ctaUrl}"
                 style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
                Sign Up Now — Save My Data
              </a>
            </div>
            <p style="color: #A8A29E; font-size: 13px; text-align: center; margin: 0;">
              Your demo expires at midnight today.
            </p>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
            <p style="color: #A8A29E; font-size: 12px; margin: 0;">
              Powered by Seatable - AI Restaurant Management
            </p>
          </div>
        </div>
      `,
    });
    logger.info(`Day-7 nurture email sent to: ${contactEmail}`);
    return { success: true };
  } catch (err) {
    logger.error(`Failed to send day-7 nurture email to ${contactEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  // Verify CRON_SECRET Bearer token
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Phase U.3 kill switch — ops can disable via cron_config table.
  if (!(await isCronEnabled('demo-nurture'))) {
    logger.warn('demo-nurture cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  // Verify Supabase admin client is available
  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not initialized - missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting demo nurture job...');

    const now = new Date();
    const nowIso = now.toISOString();

    // Day-3 window: demo expires between now+95h and now+97h (4 days left)
    const day3Start = new Date(now.getTime() + 95 * 60 * 60 * 1000).toISOString();
    const day3End   = new Date(now.getTime() + 97 * 60 * 60 * 1000).toISOString();

    // Day-5 window: demo expires between now+47h and now+49h (2 days left)
    const day5Start = new Date(now.getTime() + 47 * 60 * 60 * 1000).toISOString();
    const day5End   = new Date(now.getTime() + 49 * 60 * 60 * 1000).toISOString();

    // Day-7 window: demo expires between now-1h and now+1h (last day)
    const day7Start = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString();
    const day7End   = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();

    logger.info(`Day-3 window: ${day3Start} — ${day3End}`);
    logger.info(`Day-5 window: ${day5Start} — ${day5End}`);
    logger.info(`Day-7 window: ${day7Start} — ${day7End}`);

    const SELECT_FIELDS = 'id, restaurant_name, demo_token, demo_contact_email, demo_contact_name, demo_expires_at';

    /**
     * Fetch demo candidates for a given time window and dedup column.
     * Falls back gracefully if the dedup column hasn't been migrated yet.
     */
    async function fetchDemoCandidates(start, end, dedupCol) {
      let query = supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select(SELECT_FIELDS)
        .eq('is_demo', true)
        .gte('demo_expires_at', start)
        .lte('demo_expires_at', end);

      // Add dedup filter — may fail if migration hasn't run yet
      query = query.is(dedupCol, null);

      const { data, error } = await query;
      if (error) {
        // If the column doesn't exist yet, log a warning and skip (migration pending)
        if (error.message && error.message.includes('does not exist')) {
          logger.warn(`Dedup column ${dedupCol} missing — run migration 20260311_demo_nurture_columns.sql. Skipping this window.`);
          return [];
        }
        throw error;
      }
      return data || [];
    }

    // Fetch day-3 candidates
    let day3Demos;
    try {
      day3Demos = await fetchDemoCandidates(day3Start, day3End, 'demo_day3_sent_at');
    } catch (err) {
      logger.error('Error fetching day-3 demos:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch day-3 demos' });
    }

    // Fetch day-5 candidates
    let day5Demos;
    try {
      day5Demos = await fetchDemoCandidates(day5Start, day5End, 'demo_day5_sent_at');
    } catch (err) {
      logger.error('Error fetching day-5 demos:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch day-5 demos' });
    }

    // Fetch day-7 candidates
    let day7Demos;
    try {
      day7Demos = await fetchDemoCandidates(day7Start, day7End, 'demo_day7_sent_at');
    } catch (err) {
      logger.error('Error fetching day-7 demos:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch day-7 demos' });
    }

    logger.info(
      `Found ${day3Demos?.length || 0} day-3, ` +
      `${day5Demos?.length || 0} day-5, ` +
      `${day7Demos?.length || 0} day-7 demos`,
    );

    const results = {
      day3: { sent: 0, failed: 0, skipped: 0 },
      day5: { sent: 0, failed: 0, skipped: 0 },
      day7: { sent: 0, failed: 0, skipped: 0 },
    };

    /**
     * Process a batch of demos: send emails sequentially (Resend rate limit),
     * then batch-update all successful IDs in a single DB call.
     */
    /**
     * V.4 fix: claim-then-send, with rollback on failure.
     *
     * Previously the batch sent ALL emails first, THEN updated the dedup
     * column at the end. If Vercel retried after Resend success but before
     * the batch DB write, every email in the batch went out twice on the
     * retry. Now the order is:
     *
     *   1. Compare-and-set the dedup column to NOW WHERE col IS NULL.
     *      If 0 rows updated, somebody else already claimed this slot
     *      (concurrent invocation or in-flight retry) — skip silently.
     *   2. Fire the Resend send.
     *   3. If send fails, NULL the column back so the next cron run can
     *      retry. This gives at-most-once delivery semantics: each demo
     *      either gets one email or none, never two.
     */
    async function processDemoBatch(demos, sendFn, dedupCol, dayKey) {
      for (const demo of (demos || [])) {
        if (!demo.demo_contact_email) {
          logger.info(`Skipping ${dayKey} for demo ${demo.id} — no contact email`);
          results[dayKey].skipped++;
          continue;
        }

        // Step 1: atomically claim the dedup slot. Filter on `dedupCol IS NULL`
        // so the UPDATE only fires when nobody else has sent this email yet.
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .update({ [dedupCol]: nowIso })
          .eq('id', demo.id)
          .is(dedupCol, null)
          .select('id');

        if (claimErr) {
          logger.error(`Failed to claim ${dedupCol} for demo ${demo.id}:`, claimErr.message);
          results[dayKey].failed++;
          await sleep(100);
          continue;
        }
        if (!claimed || claimed.length === 0) {
          // Already sent (or being sent by another instance). Skip.
          results[dayKey].skipped++;
          continue;
        }

        // Step 2: fire the send. Slot is already claimed, so a Vercel
        // retry that lands here AFTER the send will find the column
        // populated and skip via the .is(dedupCol, null) filter above.
        const emailResult = await sendFn({
          contactName: demo.demo_contact_name || 'there',
          contactEmail: demo.demo_contact_email,
          restaurantName: demo.restaurant_name,
          demoToken: demo.demo_token,
        });

        if (emailResult.success) {
          results[dayKey].sent++;
        } else {
          // Step 3: rollback the claim so a future run can retry this
          // customer. Without the rollback a transient Resend error
          // (500, rate-limit) would permanently mark the demo as
          // "nurtured" with no email actually delivered.
          results[dayKey].failed++;
          const { error: rollbackErr } = await supabaseAdmin
            .schema('restaurant')
            .from('restaurant_config')
            .update({ [dedupCol]: null })
            .eq('id', demo.id);
          if (rollbackErr) {
            logger.warn(`Send failed AND rollback failed for demo ${demo.id} — manual fix needed:`, rollbackErr.message);
          }
        }
        await sleep(100);
      }
    }

    // Process all three tiers
    await processDemoBatch(day3Demos, sendDay3Email, 'demo_day3_sent_at', 'day3');
    await processDemoBatch(day5Demos, sendDay5Email, 'demo_day5_sent_at', 'day5');
    await processDemoBatch(day7Demos, sendDay7Email, 'demo_day7_sent_at', 'day7');

    const totalFailed = results.day3.failed + results.day5.failed + results.day7.failed;
    if (totalFailed > 0) {
      captureMessage(
        `CronDemoNurture: ${totalFailed} nurture email(s) failed`,
        'warning',
        { results, run_at: nowIso }
      );
    }

    const summary = {
      success: true,
      run_at: nowIso,
      day3: results.day3,
      day5: results.day5,
      day7: results.day7,
    };

    logger.info('Demo nurture job complete:', JSON.stringify(summary, null, 2));
    await logCronRun('demo-nurture', { day3: results.day3.sent, day5: results.day5.sent, day7: results.day7.sent });

    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error in demo nurture job:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
};
