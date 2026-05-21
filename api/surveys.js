/**
 * Surveys API
 *
 * NPS/Satisfaction survey module for post-visit feedback via WhatsApp.
 *
 * Authenticated endpoints:
 *   GET    ?action=config   — get survey config from restaurant_config.survey_config
 *   PATCH  ?action=config   — update survey config
 *   GET    ?action=results  — get survey results (avg, count, distribution, recent)
 *
 * Public endpoint:
 *   POST   ?action=submit   — customer submits a rating (1-5) + optional comment
 *
 * DB migration (run in Supabase SQL editor):
 *   CREATE TABLE IF NOT EXISTS restaurant.survey_responses (
 *     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     restaurant_id UUID NOT NULL REFERENCES public.restaurant_registry(id) ON DELETE CASCADE,
 *     customer_phone TEXT,
 *     customer_name TEXT,
 *     rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
 *     comment TEXT,
 *     reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
 *     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX idx_survey_responses_restaurant ON restaurant.survey_responses(restaurant_id);
 *   ALTER TABLE restaurant.survey_responses ENABLE ROW LEVEL SECURITY;
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('SurveysAPI');

function db() {
  return supabaseAdmin.schema('restaurant');
}

const SURVEY_DEFAULTS = {
  enabled: false,
  delay_hours: 2,
  question: 'Como foi sua experiencia?',
};

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { action } = req.query;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: ['config', 'results', 'submit'],
    });
  }

  // Public endpoint — no auth required
  if (action === 'submit') {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'POST required for submit' });
    }
    return handleSubmit(req, res);
  }

  // All other actions require authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({ error: authResult.error });
  }
  req.user = authResult.user;
  const restaurantId = req.user.restaurant_id;

  try {
    switch (action) {
      case 'config':
        if (req.method === 'PATCH') return await handleUpdateConfig(req, res, restaurantId);
        return await handleGetConfig(req, res, restaurantId);
      case 'results':
        return await handleResults(req, res, restaurantId);
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['config', 'results', 'submit'],
        });
    }
  } catch (error) {
    logger.error('Surveys API error', { error: error.message });
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

async function handleGetConfig(_req, res, restaurantId) {
  const { data, error } = await db()
    .from('restaurant_config')
    .select('survey_config')
    .eq('id', restaurantId)
    .maybeSingle();

  if (error) throw error;

  return res.status(200).json({
    success: true,
    data: { ...SURVEY_DEFAULTS, ...(data?.survey_config || {}) },
  });
}

async function handleUpdateConfig(req, res, restaurantId) {
  const { enabled, delay_hours, question } = req.body || {};

  const patch = {};

  if (typeof enabled === 'boolean') {
    patch.enabled = enabled;
  }

  if (delay_hours !== undefined) {
    const parsed = parseFloat(delay_hours);
    if (isNaN(parsed) || parsed < 0.5 || parsed > 48) {
      return res.status(400).json({ success: false, error: 'delay_hours must be between 0.5 and 48' });
    }
    patch.delay_hours = parsed;
  }

  if (question !== undefined) {
    if (typeof question !== 'string' || question.length > 500) {
      return res.status(400).json({ success: false, error: 'question must be a string of max 500 chars' });
    }
    patch.question = question.trim() || SURVEY_DEFAULTS.question;
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ success: false, error: 'No valid fields to update' });
  }

  // Immutable merge with existing config
  const { data: existing } = await db()
    .from('restaurant_config')
    .select('survey_config')
    .eq('id', restaurantId)
    .single();

  const merged = { ...SURVEY_DEFAULTS, ...(existing?.survey_config || {}), ...patch };

  const { data, error } = await db()
    .from('restaurant_config')
    .update({ survey_config: merged })
    .eq('id', restaurantId)
    .select('survey_config')
    .single();

  if (error) throw error;

  logger.info('Survey config updated', { restaurantId });
  return res.status(200).json({ success: true, data: data.survey_config });
}

async function handleResults(req, res, restaurantId) {
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db()
    .from('survey_responses')
    .select('id, rating, comment, customer_name, customer_phone, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const all = data || [];
  const count = all.length;

  const avgRating = count > 0
    ? Math.round((all.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10
    : null;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of all) {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
  }

  return res.status(200).json({
    success: true,
    data: {
      avg_rating: avgRating,
      count,
      distribution,
      recent: all.slice(0, 10).map(r => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        customer_name: r.customer_name,
        created_at: r.created_at,
      })),
    },
  });
}

async function handleSubmit(req, res) {
  const { restaurant_id, rating, comment, customer_phone, customer_name, reservation_id } = req.body || {};

  if (!restaurant_id) {
    return res.status(400).json({ success: false, error: 'Missing required field: restaurant_id' });
  }

  const parsedRating = parseInt(rating);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ success: false, error: 'rating must be an integer between 1 and 5' });
  }

  // DD.1 — if the caller supplies a reservation_id, verify it actually
  // belongs to this restaurant before linking. Without this check, the
  // public submit endpoint accepted arbitrary FKs — letting one tenant
  // flood another tenant's survey results by guessing reservation codes.
  //
  // NOTE: lookup uses the default (public) schema explicitly — the
  // helper db() above scopes to schema('restaurant'), but live
  // reservations data lives in public.reservations.
  let verifiedReservationId = null;
  if (reservation_id) {
    const trimmed = String(reservation_id).trim().slice(0, 64);
    if (trimmed) {
      const { data: matchedRes } = await supabaseAdmin
        .from('reservations')
        .select('reservation_id')
        .eq('restaurant_id', restaurant_id)
        .eq('reservation_id', trimmed)
        .maybeSingle();
      if (matchedRes) verifiedReservationId = trimmed;
      // If unmatched: drop the link silently. We still accept the survey
      // (a guest might submit feedback without a matching booking) so the
      // response isn't lost — but we don't fabricate a fake link.
    }
  }

  const insertData = {
    restaurant_id,
    rating: parsedRating,
    comment: comment ? String(comment).slice(0, 1000) : null,
    customer_phone: customer_phone ? String(customer_phone).slice(0, 20) : null,
    customer_name: customer_name ? String(customer_name).slice(0, 100) : null,
    reservation_id: verifiedReservationId,
  };

  try {
    const { data, error } = await db()
      .from('survey_responses')
      .insert(insertData)
      .select('id, rating, created_at')
      .single();

    if (error) throw error;

    logger.info('Survey response submitted', { responseId: data.id, rating: parsedRating });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to submit survey response', { error: error.message });
    return res.status(500).json({ success: false, error: 'Failed to submit survey' });
  }
}
