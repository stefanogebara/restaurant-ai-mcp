/**
 * Diagnostic endpoint — runs the whatsapp-webhook session+routing+config
 * path manually and returns every intermediate value as JSON so we can
 * see WHY live messages are falling back to the generic prompt.
 *
 * Usage: curl "https://seatable.one/api/diag-session?phone=%2B5511999002121&secret=..."
 *        where secret = process.env.CRON_SECRET (reuse to avoid a new secret).
 */

'use strict';

const { getOrCreateSession, setSessionRestaurant } = require('./_lib/whatsapp-sessions');
const { getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { supabaseAdmin } = require('./_lib/supabase');

module.exports = async (req, res) => {
  const secret = req.query?.secret || req.headers['x-secret'];
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const phone = req.query?.phone || '+5511999002121';
  const trace = [];
  const log = (stage, data) => trace.push({ stage, t: Date.now(), ...data });

  try {
    log('start', { phone, env_has_supabase_url: !!process.env.SUPABASE_URL, env_has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY });

    // 1. getOrCreateSession
    const t1 = Date.now();
    const session = await getOrCreateSession(phone, `diag-${Date.now()}`);
    log('session_returned', {
      elapsed_ms: Date.now() - t1,
      session_id: session?.id || null,
      restaurant_id: session?.restaurant_id || null,
      expires_at: session?.expires_at || null,
      is_null: !session,
    });

    if (!session) {
      return res.status(200).json({ phone, trace, conclusion: 'getOrCreateSession returned null' });
    }

    // 2. Routing path (if restaurant not yet set)
    if (!session.restaurant_id) {
      const t2 = Date.now();
      const restaurants = await getAllActiveRestaurants();
      log('restaurants_fetched', { elapsed_ms: Date.now() - t2, count: restaurants.length });

      const META_PNID = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const direct = restaurants.find(r => r.whatsapp_phone_number_id === META_PNID);
      log('direct_match', { meta_pnid: META_PNID, found: !!direct, restaurant_name: direct?.restaurant_name });

      if (direct) {
        const t3 = Date.now();
        const updated = await setSessionRestaurant(session.id, direct.id);
        log('setSessionRestaurant', { elapsed_ms: Date.now() - t3, returned_id: updated?.id || null, returned_restaurant_id: updated?.restaurant_id || null });
      }
    }

    // 3. Restaurant config fetch
    const finalRestId = session.restaurant_id || (await getAllActiveRestaurants()).find(r => r.whatsapp_phone_number_id === process.env.WHATSAPP_PHONE_NUMBER_ID)?.id;
    if (finalRestId) {
      const t4 = Date.now();
      const { data, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name, business_hours, agent_name')
        .eq('id', finalRestId)
        .single();
      log('config_fetch', {
        elapsed_ms: Date.now() - t4,
        error_code: error?.code || null,
        error_msg: error?.message?.slice(0, 120) || null,
        config_name: data?.restaurant_name || null,
        config_has_hours: !!data?.business_hours,
      });
    }

    // 4. Re-check session state in DB
    const t5 = Date.now();
    const { data: fresh } = await supabaseAdmin
      .from('whatsapp_sessions')
      .select('id, restaurant_id, expires_at, conversation_history')
      .eq('id', session.id)
      .maybeSingle();
    log('final_db_state', {
      elapsed_ms: Date.now() - t5,
      restaurant_id: fresh?.restaurant_id || null,
      expires_at: fresh?.expires_at || null,
      msg_count: (fresh?.conversation_history || []).length,
    });

    return res.status(200).json({ phone, session_id: session.id, trace });
  } catch (err) {
    log('threw', { error: err?.message?.slice(0, 200), stack: err?.stack?.split('\n').slice(0, 3) });
    return res.status(200).json({ phone, trace, error: err?.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
