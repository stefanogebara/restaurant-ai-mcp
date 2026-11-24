'use strict';

/**
 * Google Calendar API client for the prospecting booking engine (Phase 4b).
 * Ported from Olivia's `olivia-agendar` gcal helpers + `_shared/google_calendar.ts`.
 * =============================================================================
 * Credential-gated: getGoogleAccessToken() returns null unless GOOGLE_CLIENT_ID /
 * GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN are all set, so every caller no-ops
 * cleanly until the OAuth credentials are provisioned (same dry-run-safe posture
 * as the WhatsApp send path before its number/template landed).
 *
 * ANTI-INVENTION: free/busy OMITS any calendar that couldn't be read (a rep who
 * stopped sharing their calendar) — we never claim availability we couldn't verify.
 * São Paulo is a fixed UTC-3 (no DST since 2019).
 * =============================================================================
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('ProspectGcal');
const GCAL = 'https://www.googleapis.com/calendar/v3';

/** Exchange the refresh token for an access token (user OAuth2). null if no creds. */
async function getGoogleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = await resp.json().catch(() => ({}));
    return resp.ok ? (data.access_token || null) : null;
  } catch {
    return null;
  }
}

/** Owner calendar (the OAuth account) — fallback when the rep calendar isn't editable. */
function ownerCalendarId() {
  return process.env.PROSPECTING_CALENDAR_ID || process.env.GOOGLE_CALENDAR_ID || 'primary';
}

/**
 * Free/busy for SEVERAL calendars in one call. Returns only the calendars read
 * successfully (inaccessible ones are OMITTED — anti-invention). Throws on a
 * transport/auth error so the caller can degrade.
 * @param {string} accessToken
 * @param {string[]} calendarIds
 * @param {number} timeMinMs
 * @param {number} timeMaxMs
 * @returns {Promise<Record<string, {startMs:number,endMs:number}[]>>}
 */
async function freeBusyMulti(accessToken, calendarIds, timeMinMs, timeMaxMs) {
  const resp = await fetch(`${GCAL}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin: new Date(timeMinMs).toISOString(),
      timeMax: new Date(timeMaxMs).toISOString(),
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data.error && data.error.message) || `freeBusy HTTP ${resp.status}`);
  const cals = data.calendars || {};
  const out = {};
  const inacessiveis = [];
  for (const id of calendarIds) {
    const c = cals[id];
    if (!c || (Array.isArray(c.errors) && c.errors.length)) {
      inacessiveis.push(id);
      continue;
    }
    out[id] = (c.busy || []).map((b) => ({ startMs: Date.parse(b.start), endMs: Date.parse(b.end) }));
  }
  if (inacessiveis.length > 0) {
    logger.warn(`free/busy unavailable for ${inacessiveis.length} rep(s) — excluded from scheduling`, { inacessiveis });
  }
  return out;
}

/**
 * Load balancing: count of FUTURE meetings already booked per rep (to route new
 * bookings to whoever has fewer). A rep with no future meeting = 0. Degrades to
 * all-zeros on error (the hash tiebreak still works; never blocks booking).
 * @param {string[]} repEmails
 * @returns {Promise<Record<string, number>>}
 */
async function contarReunioesFuturasPorRep(repEmails) {
  const counts = {};
  for (const e of repEmails) counts[e] = 0;
  if (repEmails.length === 0) return counts;
  const { data, error } = await supabaseAdmin
    .from('prospect_leads')
    .select('assigned_rep_email')
    .in('assigned_rep_email', repEmails)
    .gte('reuniao_at', new Date().toISOString());
  if (error) {
    logger.error('future-meeting count failed (load balance):', error.message);
    return counts;
  }
  for (const row of data || []) {
    const e = row.assigned_rep_email;
    if (e && e in counts) counts[e]++;
  }
  return counts;
}

/**
 * Create an event (events.insert) with Google Meet (conferenceDataVersion=1) and
 * attendee notifications (sendUpdates=all). Throws (with .status) on failure so
 * the caller can fall back to the owner calendar.
 * @param {string} accessToken
 * @param {string} calendarId
 * @param {object} body  (from montarEventoCalendar)
 * @returns {Promise<{htmlLink: string|null, meetLink: string|null, eventId: string|null}>}
 */
async function insertEvent(accessToken, calendarId, body) {
  const url =
    `${GCAL}/calendars/${encodeURIComponent(calendarId)}/events` +
    `?conferenceDataVersion=1&sendUpdates=all`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error((data.error && data.error.message) || `insert HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const meet =
    data.hangoutLink ||
    (data.conferenceData && data.conferenceData.entryPoints &&
      (data.conferenceData.entryPoints.find((e) => e.entryPointType === 'video') || {}).uri) ||
    null;
  return { htmlLink: data.htmlLink || null, meetLink: meet, eventId: data.id || null };
}

/**
 * Cancel (delete) an event. Tries the given calendars in order; 404/410 (already
 * gone) counts as success (idempotent).
 * @returns {Promise<{ok: boolean, status: number|null}>}
 */
async function deleteEvent(accessToken, eventId, calendarIds) {
  const alvos = [...new Set((calendarIds || []).filter(Boolean))];
  let ultimoStatus = null;
  for (const cal of alvos) {
    const resp = await fetch(
      `${GCAL}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    ultimoStatus = resp.status;
    if (resp.ok || resp.status === 404 || resp.status === 410) return { ok: true, status: resp.status };
  }
  return { ok: false, status: ultimoStatus };
}

/**
 * Move an event (new start/end, ISO UTC), notifying guests (sendUpdates=all).
 * @returns {Promise<{ok: boolean, status: number|null, htmlLink: string|null, meetLink: string|null}>}
 */
async function patchEventTime(accessToken, eventId, calendarIds, startIso, endIso) {
  const alvos = [...new Set((calendarIds || []).filter(Boolean))];
  let ultimoStatus = null;
  for (const cal of alvos) {
    const resp = await fetch(
      `${GCAL}/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: { dateTime: startIso }, end: { dateTime: endIso } }),
      },
    );
    ultimoStatus = resp.status;
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      const meet =
        data.hangoutLink ||
        (data.conferenceData && data.conferenceData.entryPoints &&
          (data.conferenceData.entryPoints.find((e) => e.entryPointType === 'video') || {}).uri) ||
        null;
      return { ok: true, status: resp.status, htmlLink: data.htmlLink || null, meetLink: meet };
    }
  }
  return { ok: false, status: ultimoStatus, htmlLink: null, meetLink: null };
}

module.exports = {
  getGoogleAccessToken,
  ownerCalendarId,
  freeBusyMulti,
  contarReunioesFuturasPorRep,
  insertEvent,
  deleteEvent,
  patchEventTime,
};
