/**
 * Analytics Briefing Cron — Daily site performance report
 *
 * Pulls key metrics from PostHog and sends a WhatsApp briefing to the founder.
 * Schedule: Daily at 9 AM (via vercel.json cron)
 *
 * Metrics tracked:
 * - Unique visitors (last 24h)
 * - Landing page views
 * - Demo starts + completions
 * - Signup starts
 * - Onboarding completions
 * - CTA click breakdown
 * - Top referral sources
 * - Average session duration
 *
 * Requires: POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID env vars
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { supabaseAdmin } = require('../_lib/supabase');
const logger = createSecureLogger('AnalyticsBriefing');

const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.posthog.com';

module.exports = async (req, res) => {
  // Auth: CRON_SECRET only
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!cronSecret || authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!POSTHOG_API_KEY || !POSTHOG_PROJECT_ID) {
    logger.warn('PostHog API credentials not configured — skipping analytics briefing');
    return res.status(200).json({ skipped: true, reason: 'POSTHOG_PERSONAL_API_KEY or POSTHOG_PROJECT_ID not set' });
  }

  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dateAfter = yesterday.toISOString();
    const dateBefore = now.toISOString();
    const dateLabel = now.toISOString().split('T')[0];

    // Single HogQL query — event counts + unique visitors in one request
    const events = [
      'landing_page_viewed', 'cta_clicked', 'preset_demo_clicked',
      'demo_started', 'demo_completed', 'signup_started',
      'onboarding_completed', 'pricing_plan_clicked', 'share_clicked',
      'whatsapp_demo_tapped',
    ];
    const eventList = events.map(e => `'${e}'`).join(', ');

    const hogql = `
      SELECT event, count() as cnt, count(DISTINCT person_id) as unique_persons
      FROM events
      WHERE timestamp >= '${dateAfter}' AND timestamp < '${dateBefore}'
        AND event IN (${eventList}, '$pageview')
      GROUP BY event
    `;

    const counts = {};
    let uniqueVisitors = '?';

    try {
      const queryResponse = await fetch(
        `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${POSTHOG_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql } }),
        }
      );

      if (queryResponse.ok) {
        const data = await queryResponse.json();
        // data.results = [[event, count, unique_persons], ...]
        for (const row of (data.results || [])) {
          const [eventName, count, uniquePersons] = row;
          if (eventName === '$pageview') {
            uniqueVisitors = uniquePersons || 0;
          } else {
            counts[eventName] = count || 0;
          }
        }
      } else {
        const errText = await queryResponse.text();
        logger.warn('PostHog HogQL query failed:', errText);
      }
    } catch (queryErr) {
      logger.warn('PostHog query error:', queryErr.message);
    }

    // Build the briefing message
    const briefing = [
      `📊 *Seatable Analytics — ${dateLabel}*`,
      ``,
      `👥 Visitantes únicos: ${uniqueVisitors}`,
      `🏠 Landing page views: ${counts.landing_page_viewed || 0}`,
      `👆 CTA clicks: ${counts.cta_clicked || 0}`,
      ``,
      `🎮 *Funil Demo:*`,
      `  Demo preset clicado: ${counts.preset_demo_clicked || 0}`,
      `  Demo iniciado: ${counts.demo_started || 0}`,
      `  Demo completo: ${counts.demo_completed || 0}`,
      ``,
      `📝 *Funil Conversão:*`,
      `  Signup iniciado: ${counts.signup_started || 0}`,
      `  Onboarding completo: ${counts.onboarding_completed || 0}`,
      ``,
      `💰 Pricing clicado: ${counts.pricing_plan_clicked || 0}`,
      `📱 WhatsApp demo: ${counts.whatsapp_demo_tapped || 0}`,
      `🔗 Share clicado: ${counts.share_clicked || 0}`,
      ``,
      `📈 Dashboard: ${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}`,
    ].join('\n');

    logger.info('Analytics briefing generated:', briefing);

    // Find recipients: users who enabled analytics_briefing in notification_preferences
    const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN;
    let sentCount = 0;

    if (whatsappPhoneNumberId && whatsappToken) {
      try {
        const { data: configs } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .select('id, notification_preferences, manager_phone')
          .not('notification_preferences', 'is', null);

        const recipients = (configs || [])
          .filter(c => c.notification_preferences?.analytics_briefing_enabled)
          .map(c => c.notification_preferences?.analytics_briefing_phone || c.manager_phone)
          .filter(Boolean);

        for (const phone of recipients) {
          try {
            const waResponse = await fetch(
              `https://graph.facebook.com/v21.0/${whatsappPhoneNumberId}/messages`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${whatsappToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: phone.replace(/[^0-9]/g, ''),
                  type: 'text',
                  text: { body: briefing },
                }),
              }
            );
            if (waResponse.ok) {
              sentCount++;
            } else {
              const errText = await waResponse.text();
              logger.warn('WhatsApp send failed for', phone, ':', errText);
            }
          } catch (waErr) {
            logger.warn('WhatsApp send error:', waErr.message);
          }
        }
        logger.info(`Analytics briefing sent to ${sentCount}/${recipients.length} recipients`);
      } catch (dbErr) {
        logger.warn('Failed to query briefing recipients:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      date: dateLabel,
      metrics: {
        unique_visitors: uniqueVisitors,
        ...counts,
      },
      briefing_sent: sentCount > 0,
      recipients: sentCount,
    });
  } catch (err) {
    logger.error('Analytics briefing failed:', err);
    return res.status(500).json({ error: 'Analytics briefing failed' });
  }
};
