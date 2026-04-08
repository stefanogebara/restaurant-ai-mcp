/**
 * iCal Feed Endpoint
 *
 * GET /api/ical-feed?restaurant_id=X&token=Y
 *
 * Returns an .ics calendar feed of upcoming reservations.
 * Any external platform (OpenTable, Resy, Google Calendar) can subscribe.
 *
 * Auth: HMAC token = SHA256(restaurant_id + CRON_SECRET)
 * This is a public endpoint (no JWT) but token-protected.
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('iCalFeed');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { restaurant_id, token } = req.query;

  if (!restaurant_id || !token) {
    return res.status(400).json({ error: 'restaurant_id and token required' });
  }

  // Validate HMAC token
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const expectedToken = crypto
    .createHmac('sha256', secret)
    .update(restaurant_id)
    .digest('hex');

  if (token !== expectedToken) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    // Fetch upcoming reservations (today + next 30 days)
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: reservations, error } = await supabaseAdmin
      .from('reservations')
      .select('id, guest_name, guest_phone, party_size, reservation_date, reservation_time, status, special_requests, source, created_at')
      .eq('restaurant_id', restaurant_id)
      .gte('reservation_date', today)
      .lte('reservation_date', thirtyDaysOut)
      .in('status', ['confirmed', 'pending'])
      .order('reservation_date', { ascending: true });

    if (error) {
      logger.error('[iCalFeed] DB error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch reservations' });
    }

    // Get restaurant name
    const { data: config } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('restaurant_name')
      .eq('id', restaurant_id)
      .single();

    const restaurantName = config?.restaurant_name || 'Restaurant';

    // Build iCal
    const ical = buildICal(restaurantName, reservations || []);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${restaurantName.replace(/[^a-zA-Z0-9]/g, '-')}-reservations.ics"`);
    return res.status(200).send(ical);

  } catch (error) {
    logger.error('[iCalFeed] Error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function buildICal(restaurantName, reservations) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Seatable//${restaurantName}//EN`,
    `X-WR-CALNAME:${restaurantName} Reservations`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const r of reservations) {
    const dtStart = formatICalDate(r.reservation_date, r.reservation_time);
    // Default 90-minute dining duration
    const endTime = addMinutes(r.reservation_date, r.reservation_time, 90);
    const dtEnd = formatICalDate(endTime.date, endTime.time);

    const summary = `${r.guest_name || 'Guest'} — Party of ${r.party_size}`;
    const description = [
      `Guest: ${r.guest_name || 'Unknown'}`,
      `Phone: ${r.guest_phone || 'N/A'}`,
      `Party size: ${r.party_size}`,
      `Status: ${r.status}`,
      r.special_requests ? `Notes: ${r.special_requests}` : null,
      r.source ? `Source: ${r.source}` : null,
    ].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${r.id}@seatable.one`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeICal(summary)}`);
    lines.push(`DESCRIPTION:${escapeICal(description)}`);
    lines.push(`STATUS:${r.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`);
    lines.push(`CREATED:${formatICalTimestamp(r.created_at)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function formatICalDate(date, time) {
  // date: "2026-04-08", time: "19:30" → "20260408T193000"
  const d = date.replace(/-/g, '');
  const t = (time || '12:00').replace(/:/g, '') + '00';
  return `${d}T${t}`;
}

function formatICalTimestamp(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function addMinutes(date, time, minutes) {
  const [h, m] = (time || '12:00').split(':').map(Number);
  const totalMins = h * 60 + m + minutes;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return {
    date,
    time: `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`,
  };
}

function escapeICal(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
