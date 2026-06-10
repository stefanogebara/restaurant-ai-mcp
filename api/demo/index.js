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
const { generateSecureReservationId } = require('../_lib/secure-id');
const { supabaseAdmin, getAllTables, getUpcomingReservations } = require('../_lib/supabase');
const { verifyAuth } = require('../_lib/auth');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureException } = require('../_lib/sentry');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { validateEmail } = require('../_lib/validation');
const { enrichRestaurant } = require('../_lib/enrich-restaurant');
const { derivePersonalityFromScrape } = require('../_lib/vibe-to-persona-preset');
const { Resend } = require('resend');

// HTML-escape helper — prevents XSS when interpolating user data into email HTML
function he(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

initSentry();
const logger = createSecureLogger('Demo');

const BASE_URL = process.env.CLIENT_URL || 'https://seatable.one';

// Lazy-init Resend client
let resendClient = null;
function getResendClient() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_ADDRESS = 'Seatable <bookings@seatable.one>';

// ---------------------------------------------------------------------------
// Cuisine type → restaurant_type enum normalizer
// ---------------------------------------------------------------------------
const VALID_RESTAURANT_TYPES = new Set([
  'fine_dining', 'casual_dining', 'fast_casual', 'cafe', 'bar',
  'steakhouse', 'italian', 'japanese', 'mexican', 'other',
]);

function normalizeRestaurantType(cuisineType) {
  if (!cuisineType) return 'other';
  const lower = cuisineType.toLowerCase();
  if (VALID_RESTAURANT_TYPES.has(lower)) return lower;
  if (lower.includes('italian')) return 'italian';
  if (lower.includes('japan') || lower.includes('sushi') || lower.includes('ramen')) return 'japanese';
  if (lower.includes('mexic') || lower.includes('taco') || lower.includes('burrito')) return 'mexican';
  if (lower.includes('steak') || lower.includes('grill') || lower.includes('bbq')) return 'steakhouse';
  if (lower.includes('cafe') || lower.includes('café') || lower.includes('coffee') || lower.includes('bakery')) return 'cafe';
  if (lower.includes('bar') || lower.includes('pub') || lower.includes('tavern')) return 'bar';
  if (lower.includes('fine') || lower.includes('gourmet') || lower.includes('upscale')) return 'fine_dining';
  if (lower.includes('fast') || lower.includes('quick')) return 'fast_casual';
  return 'casual_dining';
}

// ---------------------------------------------------------------------------
// Fake table seed data
// ---------------------------------------------------------------------------
function buildFakeTables(restaurantId) {
  return [
    { restaurant_id: restaurantId, table_number: 1,  capacity: 2, location: 'window',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 2,  capacity: 2, location: 'window',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 3,  capacity: 4, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 4,  capacity: 4, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 5,  capacity: 4, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 6,  capacity: 6, location: 'indoor',  status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 7,  capacity: 6, location: 'terrace', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 8,  capacity: 8, location: 'terrace', status: 'available', is_active: true },
  ];
}

// ---------------------------------------------------------------------------
// Fake reservation seed data
// ---------------------------------------------------------------------------
const FAKE_NAMES = [
  'Ana Costa', 'Pedro Santos', 'Julia Oliveira', 'Rafael Lima',
  'Mariana Silva', 'Lucas Ferreira', 'Camila Souza', 'Gabriel Almeida',
];

const FAKE_TIMES = ['12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00'];

function buildFakeReservations(restaurantId) {
  const reservations = [];
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // 3 today reservations so dashboard isn't empty
  const todayNames = ['Ana Costa', 'Pedro Santos', 'Julia Oliveira'];
  const todayTimes = ['19:30', '20:00', '20:30'];
  const todayParty = [2, 4, 3];
  for (let i = 0; i < 3; i++) {
    reservations.push({
      reservation_id: generateSecureReservationId(),
      restaurant_id: restaurantId,
      customer_name: todayNames[i],
      customer_phone: null,
      customer_email: null,
      party_size: todayParty[i],
      date: todayStr,
      time: todayTimes[i],
      status: 'confirmed',
      special_requests: i === 2 ? 'Aniversario' : null,
    });
  }

  // 5 future reservations spread over next days
  for (let i = 0; i < 5; i++) {
    const resDate = new Date(now);
    resDate.setDate(resDate.getDate() + i + 1);
    const dateStr = resDate.toISOString().split('T')[0];

    reservations.push({
      reservation_id: generateSecureReservationId(),
      restaurant_id: restaurantId,
      customer_name: FAKE_NAMES[i + 3],
      customer_phone: null,
      customer_email: null,
      party_size: 2 + (i % 4),
      date: dateStr,
      time: FAKE_TIMES[i % FAKE_TIMES.length],
      status: 'confirmed',
      special_requests: null,
    });
  }

  // One checked-in reservation for today (realistic dinner time)
  reservations.push({
    reservation_id: generateSecureReservationId(),
    restaurant_id: restaurantId,
    customer_name: 'Isabela Martins',
    customer_phone: null,
    customer_email: null,
    party_size: 3,
    date: todayStr,
    time: '20:00',
    status: 'confirmed',
    checked_in_at: now.toISOString(),
    special_requests: null,
  });

  return reservations;
}

// ---------------------------------------------------------------------------
// Email: welcome demo
// ---------------------------------------------------------------------------
async function sendDemoWelcomeEmail({ contactName, contactEmail, restaurantName, demoUrl }) {
  // BISECT: HTML email template stubbed to test if it's the cause of
  // Vercel silently dropping this function from the deploy manifest.
  // If /api/demo deploys with this stub but the previous build (with
  // the full HTML) doesn't, we've found the bug.
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping demo welcome email');
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: contactEmail,
      subject: `Your ${restaurantName} demo is ready on Seatable`,
      text: `Hi ${contactName}, your demo is ready at ${demoUrl}`,
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
  // BISECT: handleCreate body stubbed to test if it's the cause of
  // Vercel silently dropping this function from the deploy manifest.
  return res.status(200).json({ bisect: 'handleCreate-stubbed', method: req.method });
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
  // Explicit column list avoids returning sensitive fields (OTP codes, internal config)
  const now = new Date().toISOString();
  const { data: config, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, restaurant_type, city, country, phone, email, slug, business_hours, reservation_settings, is_active, is_demo, demo_token, demo_expires_at, demo_contact_email, demo_contact_name, onboarding_completed, scraped_data')
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

  // Find demo restaurant — select only fields needed for conversion
  const { data: demoConfig, error: demoError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, city, country, business_hours, reservation_settings, is_demo, demo_token')
    .eq('demo_token', token)
    .single();

  if (demoError || !demoConfig) {
    return res.status(404).json({ error: 'Demo not found' });
  }

  // Get real restaurant config — just need to confirm it exists
  const { data: realConfig, error: realError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
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
      city: demoConfig.city,
      country: demoConfig.country,
      business_hours: demoConfig.business_hours,
      reservation_settings: demoConfig.reservation_settings,
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

  // Move demo tables to real restaurant
  const { error: moveTablesError } = await supabaseAdmin
    .from('tables')
    .update({ restaurant_id: real_restaurant_id })
    .eq('restaurant_id', demoConfig.id);

  if (moveTablesError) {
    logger.warn('Failed to move demo tables (non-fatal):', moveTablesError.message);
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
      const limited = await checkAndApplyRateLimit(req, res, 'demo-create');
      if (limited) return;
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
