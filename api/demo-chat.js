const { getAI, AI_MODEL_FAST } = require('./_lib/ai-client');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');
const { supabaseAdmin } = require('./_lib/supabase');
const logger = createSecureLogger('DemoChat');

// Known preset demos — bypass DB validation for these (no DB record exists)
const KNOWN_PRESETS = new Set(['italian', 'japanese', 'brazilian', 'makoto']);

// Preset-specific context injected into the AI system prompt
const PRESET_META = {
  makoto: {
    city: 'Madrid, España',
    respondIn: 'Spanish',
    context: `
Restaurant context:
- Chef: Makoto Okuwa (ex Iron Chef Morimoto, NYC)
- Recognition: Mejor Restaurante Japonés del Año 2025 (Gastro & Cía por La Razón)
- Location: Calle del Marqués de Villamagna 1, Barrio Salamanca, 28001 Madrid
- Phone: +34 917 31 43 42 | Hours: Daily 13:00–00:00
- Signature dishes: Menú Omakase (Edomae), Wagyu con yema curada, Rock Shrimp, Fried Rice con foie y anguila, Tres Leches de Okinawa, Sake pairing
- Average ticket: €80–€120 per cover | Fine dining, reservations required
- Style: Contemporary Japanese + European influences, open kitchen sushi counter`,
  },
};

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'chat')) return;

  const { message, context, lang, restaurant_id, preset_key } = req.body || {};

  // Preset demos bypass DB validation (no DB record exists for preset demos)
  const isPresetDemo = preset_key && KNOWN_PRESETS.has(preset_key);

  if (!isPresetDemo) {
    // Validate token-based demo restaurant against DB
    if (!restaurant_id || typeof restaurant_id !== 'string') {
      return res.status(400).json({ error: 'restaurant_id is required for non-preset demos' });
    }
    try {
      const { data: restaurant, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id')
        .eq('id', restaurant_id)
        .eq('is_demo', true)
        .maybeSingle();

      if (error || !restaurant) {
        return res.status(400).json({ error: 'Invalid or non-demo restaurant' });
      }
    } catch (err) {
      logger.error('Demo restaurant validation error:', err.message);
      return res.status(500).json({ error: 'Validation failed' });
    }
  }

  if (!message || typeof message !== 'string' || message.length > 500) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  const ctx = context || {};
  const occupied = ctx.occupiedTables ?? 0;
  const total = ctx.totalTables ?? 12;
  const available = total - occupied;
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const restaurantName = ctx.restaurantName || (isPresetDemo ? preset_key : 'your restaurant');

  const presetMeta = isPresetDemo ? (PRESET_META[preset_key] || {}) : {};
  const respondIn = presetMeta.respondIn || (lang === 'pt-BR' ? 'Portuguese (Brazil)' : 'English');
  const revenue = ctx.totalRevenue
    ? (lang === 'pt-BR' ? `R$ ${ctx.totalRevenue}` : `€${ctx.totalRevenue}`)
    : 'not available';

  const systemPrompt = `You are a concise AI restaurant manager assistant for "${restaurantName}".
${presetMeta.context || ''}

Current stats:
- Tables: ${occupied}/${total} occupied (${available} available, ${occupancy}% occupancy)
- Active parties: ${ctx.activeParties ?? 0} with ${ctx.totalGuests ?? 0} guests
- Reservations today: ${ctx.reservationsToday ?? 0}
- Waitlist: ${ctx.waitlistCount ?? 0}
- Completed services today: ${ctx.completedCount ?? 0}
- Revenue today: ${revenue}

Rules:
- Respond in ${respondIn}
- Keep responses under 2 sentences
- Be helpful, professional, and friendly
- You can advise on staffing, table management, waitlist, reservations, and menu
- Use the EXACT restaurant name "${restaurantName}" when referring to the restaurant
- NEVER make up a different restaurant name`;

  try {
    const response = await getAI().messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 150,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });

    const reply = response.content?.[0]?.text || '';
    return res.status(200).json({ reply });
  } catch (err) {
    logger.error('Demo chat error:', err?.message || err);
    return res.status(500).json({ error: 'AI service error' });
  }
}
