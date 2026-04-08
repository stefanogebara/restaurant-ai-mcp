const { getAI, AI_MODEL_FAST } = require('./_lib/ai-client');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');
const { supabaseAdmin } = require('./_lib/supabase');
const logger = createSecureLogger('DemoChat');

module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'chat')) return;

  const { message, context, lang, restaurant_id } = req.body || {};

  // Validate that a legitimate demo restaurant is being used
  if (!restaurant_id || typeof restaurant_id !== 'string') {
    return res.status(400).json({ error: 'restaurant_id is required' });
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

  if (!message || typeof message !== 'string' || message.length > 500) {
    return res.status(400).json({ error: 'Invalid message' });
  }

  const ctx = context || {};
  const occupied = ctx.occupiedTables ?? 0;
  const total = ctx.totalTables ?? 12;
  const available = total - occupied;
  const occupancy = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const restaurantName = ctx.restaurantName || 'seu restaurante';
  const revenue = ctx.totalRevenue ? `R$ ${ctx.totalRevenue}` : 'não disponível';

  const respondIn = lang === 'pt-BR' ? 'Portuguese (Brazil)' : 'English';

  const systemPrompt = `You are a concise AI restaurant manager assistant for "${restaurantName}" in São Paulo.

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
- You can advise on staffing, table management, waitlist, and reservations
- Use the EXACT restaurant name "${restaurantName}" when referring to the restaurant
- NEVER say "Cantina da Praça" or make up a restaurant name
- If asked about specific menu items, say you'd need the menu uploaded to give recommendations`;

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
