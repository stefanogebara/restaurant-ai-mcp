/**
 * Demo API
 *
 * Handles self-serve demo restaurant creation and management.
 *
 * GET  /api/demo?action=session&token=<token>  — fetch demo session data
 * POST /api/demo?action=create                 — create a new demo restaurant
 * POST /api/demo?action=convert                — convert demo to real (auth required)
 */

const crypto = require('crypto');
const { supabaseAdmin, getAllTables, getUpcomingReservations } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
const { Resend } = require('resend');

initSentry();
const logger = createSecureLogger('Demo');

const BASE_URL = process.env.CLIENT_URL || 'https://restaurant-ai-mcp.vercel.app';

// Lazy-init Resend client
let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_ADDRESS = 'Seatable <bookings@seatable.io>';

// ---------------------------------------------------------------------------
// Fake reservation seed data
// ---------------------------------------------------------------------------
const FAKE_NAMES = [
  'Emma Wilson', 'James Carter', 'Sofia Rossi', 'Lucas Müller',
  'Olivia Brown', 'Noah Davis', 'Ava Martinez', 'Liam Johnson',
];

const FAKE_TIMES = ['12:00', '12:30', '13:00', '13:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'];

function buildFakeReservations(restaurantId) {
  const reservations = [];
  const now = new Date();

  for (let i = 0; i < 8; i++) {
    const daysOffset = (i % 7) + 1; // spread over next 7 days
    const resDate = new Date(now);
    resDate.setDate(resDate.getDate() + daysOffset);
    const dateStr = resDate.toISOString().split('T')[0];

    const name = FAKE_NAMES[i];
    const partySize = 2 + (i % 5); // 2, 3, 4, 5, 6, 2, 3, 4
    const timeStr = FAKE_TIMES[i % FAKE_TIMES.length];

    reservations.push({
      restaurant_id: restaurantId,
      customer_name: name,
      customer_phone: null,
      customer_email: null,
      party_size: partySize,
      reservation_date: dateStr,
      reservation_time: timeStr,
      status: 'confirmed',
      special_requests: null,
    });
  }

  return reservations;
}

// ---------------------------------------------------------------------------
// Email: welcome demo
// ---------------------------------------------------------------------------
async function sendDemoWelcomeEmail({ contactName, contactEmail, restaurantName, demoUrl }) {
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping demo welcome email');
    return;
  }

  const bookingUrl = `${demoUrl}/book`;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: contactEmail,
      subject: `Your ${restaurantName} demo is ready on Seatable`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
              Seatable<span style="color: #9F1239;">.</span>
            </h1>
          </div>

          <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
            <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">
              Hi ${contactName}, your demo is ready!
            </h2>
            <p style="color: #57534E; margin: 0 0 24px 0;">
              Your personalised <strong>${restaurantName}</strong> demo has been set up on Seatable.
              Click the button below to explore your dashboard:
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${demoUrl}"
                 style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
                Open My Demo
              </a>
            </div>
          </div>

          <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h3 style="font-size: 16px; color: #166534; margin: 0 0 16px 0;">3 Quick-Start Steps</h3>
            <ol style="color: #15803D; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Try the booking widget at <a href="${bookingUrl}" style="color:#9F1239;">${bookingUrl}</a></li>
              <li>Check your host dashboard to see incoming reservations in real time</li>
              <li>Test the AI voice agent — call the number in your dashboard</li>
            </ol>
          </div>

          <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #E7E5E4;">
            <p style="color: #A8A29E; font-size: 12px; margin: 0;">
              Powered by Seatable - AI Restaurant Management
            </p>
          </div>
        </div>
      `,
    });
    logger.info('Demo welcome email sent to:', contactEmail);
  } catch (err) {
    logger.error('Failed to send demo welcome email:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Action: create
// ---------------------------------------------------------------------------
async function handleCreate(req, res) {
  const {
    restaurant_name,
    cuisine_type,
    city,
    contact_email,
    contact_name,
    country,
    open_time = '12:00',
    close_time = '23:00',
    max_party_size = 8,
    advance_booking_days = 30,
    cancellation_policy,
    custom_policy,
  } = req.body || {};

  // Validate required fields
  const required = { restaurant_name, cuisine_type, city, contact_email, contact_name };
  for (const [field, value] of Object.entries(required)) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  const demo_token = crypto.randomUUID();
  const demo_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const slug = `demo-${demo_token.slice(0, 8)}`;

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const business_hours = {};
  days.forEach(d => {
    business_hours[d] = { open_time, close_time, is_open: true };
  });

  // Insert demo restaurant config
  const { data: demoConfig, error: insertError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .insert({
      restaurant_name: restaurant_name.trim(),
      restaurant_type: cuisine_type.trim(),
      city: city.trim(),
      country: country || null,
      slug,
      business_hours,
      max_party_size: Number(max_party_size),
      advance_booking_days: Number(advance_booking_days),
      cancellation_policy: cancellation_policy || null,
      custom_policy: custom_policy || null,
      is_active: true,
      onboarding_completed: true,
      is_demo: true,
      demo_token,
      demo_expires_at,
      demo_contact_email: contact_email.trim(),
      demo_contact_name: contact_name.trim(),
    })
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to insert demo restaurant config:', insertError);
    captureException(insertError);
    return res.status(500).json({ error: 'Failed to create demo restaurant' });
  }

  const restaurantId = demoConfig.id;

  // Seed fake reservations (fire best-effort — don't fail if it errors)
  try {
    const fakeReservations = buildFakeReservations(restaurantId);
    const { error: seedError } = await supabaseAdmin
      .from('reservations')
      .insert(fakeReservations);

    if (seedError) {
      logger.warn('Failed to seed fake reservations (non-fatal):', seedError.message);
    } else {
      logger.info(`Seeded ${fakeReservations.length} fake reservations for demo ${restaurantId}`);
    }
  } catch (err) {
    logger.warn('Exception seeding fake reservations (non-fatal):', err.message);
  }

  const demoUrl = `${BASE_URL}/demo/${demo_token}`;

  // Send welcome email (fire-and-forget — don't fail if email fails)
  sendDemoWelcomeEmail({
    contactName: contact_name.trim(),
    contactEmail: contact_email.trim(),
    restaurantName: restaurant_name.trim(),
    demoUrl,
  }).catch(err => logger.error('sendDemoWelcomeEmail threw:', err.message));

  logger.info(`Demo created: ${restaurantId} for ${contact_email}`);

  return res.status(201).json({
    success: true,
    demo_token,
    demo_url: demoUrl,
  });
}

// ---------------------------------------------------------------------------
// Action: session
// ---------------------------------------------------------------------------
async function handleSession(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Missing required parameter: token' });
  }

  // Fetch demo config where token matches and not expired
  const now = new Date().toISOString();
  const { data: config, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('demo_token', token)
    .gt('demo_expires_at', now)
    .single();

  if (error || !config) {
    return res.status(404).json({ error: 'Demo not found or expired' });
  }

  const [tablesResult, reservationsResult] = await Promise.all([
    getAllTables(config.id),
    getUpcomingReservations(config.id),
  ]);

  const tables = tablesResult?.tables || tablesResult || [];
  const reservations = reservationsResult?.reservations || reservationsResult || [];

  const daysLeft = Math.ceil(
    (new Date(config.demo_expires_at) - Date.now()) / 86400000
  );

  return res.status(200).json({
    success: true,
    restaurant: config,
    tables,
    reservations,
    daysLeft,
  });
}

// ---------------------------------------------------------------------------
// Action: convert
// ---------------------------------------------------------------------------
async function handleConvert(req, res) {
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const real_restaurant_id = auth.user.restaurant_id;
  const { token } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Missing required field: token' });
  }

  // Find demo restaurant
  const { data: demoConfig, error: demoError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('demo_token', token)
    .single();

  if (demoError || !demoConfig) {
    return res.status(404).json({ error: 'Demo not found' });
  }

  // Get real restaurant config
  const { data: realConfig, error: realError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
    .eq('id', real_restaurant_id)
    .single();

  if (realError || !realConfig) {
    return res.status(404).json({ error: 'Real restaurant not found' });
  }

  // Copy fields from demo to real
  const { error: updateError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      restaurant_name: demoConfig.restaurant_name,
      restaurant_type: demoConfig.restaurant_type,
      city: demoConfig.city,
      country: demoConfig.country,
      business_hours: demoConfig.business_hours,
      max_party_size: demoConfig.max_party_size,
      advance_booking_days: demoConfig.advance_booking_days,
      cancellation_policy: demoConfig.cancellation_policy,
    })
    .eq('id', real_restaurant_id);

  if (updateError) {
    logger.error('Failed to update real restaurant config:', updateError);
    captureException(updateError);
    return res.status(500).json({ error: 'Failed to update restaurant config' });
  }

  // Move demo reservations to real restaurant
  const { error: moveError } = await supabaseAdmin
    .from('reservations')
    .update({ restaurant_id: real_restaurant_id })
    .eq('restaurant_id', demoConfig.id);

  if (moveError) {
    logger.warn('Failed to move demo reservations (non-fatal):', moveError.message);
  }

  // Mark demo as converted
  const { error: markError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ is_demo: false, demo_token: null })
    .eq('id', demoConfig.id);

  if (markError) {
    logger.warn('Failed to mark demo as converted (non-fatal):', markError.message);
  }

  logger.info(`Demo ${demoConfig.id} converted to real restaurant ${real_restaurant_id}`);

  return res.status(200).json({ success: true });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const { action } = req.query;

  try {
    if (req.method === 'POST' && action === 'create') {
      return await handleCreate(req, res);
    }

    if (req.method === 'GET' && action === 'session') {
      return await handleSession(req, res);
    }

    if (req.method === 'POST' && action === 'convert') {
      return await handleConvert(req, res);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    logger.error('Unhandled error in demo handler:', err);
    captureException(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
