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
const { generateSecureReservationId } = require('./_lib/secure-id');
const { supabaseAdmin, getAllTables, getUpcomingReservations } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { initSentry, captureException } = require('./_lib/sentry');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { validateEmail } = require('./_lib/validation');
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
              Hi ${he(contactName)}, your demo is ready!
            </h2>
            <p style="color: #57534E; margin: 0 0 24px 0;">
              Your personalised <strong>${he(restaurantName)}</strong> demo has been set up on Seatable.
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
    scraped_data, // Optional: Google Places data from /api/scrape-restaurant
  } = req.body || {};

  // With scraped_data, only restaurant_name + city + contact_email are required
  // Without scraped_data, cuisine_type and contact_name are also required (legacy flow)
  const hasScrape = scraped_data && typeof scraped_data === 'object';

  const required = hasScrape
    ? { restaurant_name, city, contact_email }
    : { restaurant_name, cuisine_type, city, contact_email, contact_name };

  for (const [field, value] of Object.entries(required)) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  // Validate email format
  const emailValidation = validateEmail(contact_email);
  if (!emailValidation.valid) {
    return res.status(400).json({ success: false, message: 'Invalid contact_email format' });
  }

  // Validate numeric bounds
  const parsedMaxParty = parseInt(max_party_size) || 8;
  if (parsedMaxParty < 1 || parsedMaxParty > 100) {
    return res.status(400).json({ success: false, message: 'max_party_size must be between 1 and 100' });
  }

  const parsedAdvanceDays = parseInt(advance_booking_days) || 30;
  if (parsedAdvanceDays < 1 || parsedAdvanceDays > 365) {
    return res.status(400).json({ success: false, message: 'advance_booking_days must be between 1 and 365' });
  }

  // Derive fields from scraped data when available
  const effectiveCuisine = cuisine_type || scraped_data?.cuisine_type || 'Restaurant';
  const effectiveCountry = (country || '').trim() || null;
  const effectiveName = contact_name || contact_email.split('@')[0];
  const effectivePhone = scraped_data?.phone || 'N/A';
  const effectiveWebsite = scraped_data?.website || null;

  const demo_token = crypto.randomUUID();
  const demo_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const slug = `demo-${demo_token.slice(0, 8)}`;

  // Each demo needs its own user_id to satisfy the UNIQUE(user_id) constraint
  // on restaurant_config. Generate a fresh UUID per demo instead of reusing
  // DEMO_SYSTEM_USER_ID (which only allows one demo at a time).
  const demoUserId = crypto.randomUUID();

  // Use scraped business hours if available, otherwise build from open/close times
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let business_hours;
  if (scraped_data?.business_hours && typeof scraped_data.business_hours === 'object') {
    // Validate scraped hours have the right shape, fill gaps with defaults
    business_hours = {};
    days.forEach(d => {
      const scraped = scraped_data.business_hours[d];
      if (scraped && scraped.is_open && scraped.open_time && scraped.close_time) {
        business_hours[d] = { open_time: scraped.open_time, close_time: scraped.close_time, is_open: true };
      } else if (scraped && scraped.is_open === false) {
        business_hours[d] = { open_time: null, close_time: null, is_open: false };
      } else {
        business_hours[d] = { open_time, close_time, is_open: true };
      }
    });
  } else {
    business_hours = {};
    days.forEach(d => {
      business_hours[d] = { open_time, close_time, is_open: true };
    });
  }

  // Build reservation_settings JSONB (where max_party_size etc. live)
  const reservation_settings = {
    max_party_size: parsedMaxParty,
    min_party_size: 1,
    advance_booking_days: parsedAdvanceDays,
    allow_waitlist: true,
    buffer_time_minutes: 15,
    require_credit_card: false,
    cancellation_policy: cancellation_policy || 'Cancelamento gratuito até 2 horas antes da reserva',
    special_notes: custom_policy || '',
  };

  // Insert demo restaurant config — uses scraped data when available
  const insertPayload = {
    user_id: demoUserId,
    restaurant_name: restaurant_name.trim(),
    restaurant_type: normalizeRestaurantType(effectiveCuisine.trim()),
    city: city.trim(),
    country: effectiveCountry || 'Unknown',
    email: contact_email.trim(),
    phone: effectivePhone,
    slug,
    business_hours,
    reservation_settings,
    is_active: true,
    onboarding_completed: true,
    is_demo: true,
    demo_token,
    demo_expires_at,
    demo_contact_email: contact_email.trim(),
    demo_contact_name: effectiveName.trim(),
  };

  // Add optional fields from scrape (only columns that exist in restaurant_config)
  // NOTE: address, google_rating, google_review_count, google_maps_url do NOT exist
  // on restaurant_config — they live on restaurant_info. Only set website here.
  if (effectiveWebsite) insertPayload.website = effectiveWebsite;

  const { data: demoConfig, error: insertError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to insert demo restaurant config:', insertError);
    captureException(insertError);
    return res.status(500).json({ error: 'Failed to create demo restaurant' });
  }

  const restaurantId = demoConfig.id;

  // Seed fake tables (fire best-effort — don't fail if it errors)
  try {
    const fakeTables = buildFakeTables(restaurantId);
    const { error: tableError } = await supabaseAdmin
      .from('tables')
      .insert(fakeTables);

    if (tableError) {
      logger.warn('Failed to seed fake tables (non-fatal):', tableError.message);
    } else {
      logger.info(`Seeded ${fakeTables.length} fake tables for demo ${restaurantId}`);
    }
  } catch (err) {
    logger.warn('Exception seeding fake tables (non-fatal):', err.message);
  }

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
    contactName: effectiveName.trim(),
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
  // Explicit column list avoids returning sensitive fields (OTP codes, internal config)
  const now = new Date().toISOString();
  const { data: config, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, restaurant_type, city, country, phone, email, slug, business_hours, reservation_settings, is_active, is_demo, demo_token, demo_expires_at, demo_contact_email, demo_contact_name, onboarding_completed')
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
