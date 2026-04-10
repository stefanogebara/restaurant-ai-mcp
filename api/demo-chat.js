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

  italian: {
    respondIn: 'English',
    wiki: `### Restaurant Overview
Trattoria da Marco is a 28-seat Roman-style trattoria in Little Italy. The restaurant seats 28 across 8 tables (terrace, main room, wine bar, and private room). It runs at roughly 65% weekday occupancy and peaks at full capacity on Friday–Saturday evenings.

### Customer Base
The restaurant has a loyal base of regulars including Giovanni Bianchi (VIP, 14 visits), Alessandro Russo (regular, anniversary dinner tradition), and a steady stream of tourists and date-night couples. Average party size is 3.2. VIPs typically request the private room or terrace.

### Booking Patterns
Peak booking hours are 19:30–21:00 (dinner service). Lunch sees lighter traffic (12:00–14:00). No-show rate is approximately 8%. Special occasions (anniversaries, birthdays) account for ~22% of dinner reservations.

### Performance Metrics
Average covers per dinner service: 24. Revenue per cover: ~€38. No-shows last 30 days: 4. Cancellations: 6. Deposits held: 2 reservations. The restaurant runs lean — no major performance gaps.

### Operational Notes
The kitchen requires 30-minute advance notice for dietary accommodations. The private room seats up to 8 and is popular for corporate dinners. The wine bar section is walk-in only. Marco (the owner) manages the floor personally on weekends.`,
  },

  japanese: {
    respondIn: 'English',
    wiki: `### Restaurant Overview
Sakura Izakaya is a 32-seat Japanese izakaya-style restaurant. It occupies 8 tables across bar seating, garden terrace, and tatami room. It operates Tuesday–Sunday, 17:00–23:00. Weeknight occupancy averages 70%; weekends are consistently full with a 15-minute waitlist at peak.

### Customer Base
Core regulars include Yuki Tanaka (VIP, sake enthusiast, 18 visits), David Park (regular, always brings groups of 4–6), and a strong expat professional community. Average party size is 3.8. Walk-ins account for about 40% of covers.

### Booking Patterns
Peak hours: Friday 19:00–21:30, Saturday 18:30–22:00. Weekday peak: Thursday 19:00–21:00. No-show rate: 6%. Large group bookings (6+) represent 30% of revenue. Common special requests: sake pairing, tatami room for privacy.

### Performance Metrics
Average covers per service: 28. Revenue per cover: ~€45. Sake and cocktail sales add ~€12 per cover average. No-shows last 30 days: 3. The tatami room books out 4–5 days in advance consistently.

### Operational Notes
Tatami room requires 48-hour advance booking. The kitchen cannot accommodate shellfish allergies without advance notice (24h minimum). Bar seating is always walk-in only — never reservable. Chef recommends the omakase for first-time guests.`,
  },

  brazilian: {
    respondIn: 'Portuguese (Brazil)',
    wiki: `### Visão Geral do Restaurante
Cantina da Praça é uma cantina brasileira com 36 lugares no coração da Vila Madalena, São Paulo. O restaurante tem 9 mesas distribuídas entre o salão principal, varanda e área externa. Funciona de terça a domingo, das 12h às 23h. A ocupação média nos fins de semana é de 90%, com fila de espera frequente no almoço de domingo.

### Base de Clientes
Os clientes fiéis incluem Carlos Mendonça (VIP, 21 visitas, sempre na varanda), família Oliveira (regular, almoço de domingo semanal), e uma clientela local de profissionais e famílias do bairro. Tamanho médio dos grupos: 3.5. Reservas representam 60% dos covers; walk-ins são comuns no almoço.

### Padrões de Reservas
Picos: domingo 12h–14h (almoço de família) e sexta-sábado 20h–22h. Taxa de no-show: 5%. Comemorações (aniversários, formaturas) representam ~30% das reservas de jantar. Pedidos especiais frequentes: mesa na varanda, bolo surpresa.

### Métricas de Desempenho
Média de covers por serviço: 30. Receita por cover: ~R$ 95. No-shows nos últimos 30 dias: 4. Cancelamentos: 7. Sexta e sábado são os dias de maior receita — representam 45% do faturamento semanal.

### Notas Operacionais
A varanda tem capacidade para 12 pessoas (3 mesas) e é o espaço mais requisitado. O chef precisa de 24h de antecedência para menus de degustação especiais. Feijoada completa disponível apenas às sextas (almoço) e domingos. O bar fecha às 22h30 em dias de semana.`,
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

  const wikiBlock = presetMeta.wiki
    ? `\n\n[RESTAURANT KNOWLEDGE BASE]\n${presetMeta.wiki}`
    : '';

  const systemPrompt = `You are a concise AI restaurant manager assistant for "${restaurantName}".
${presetMeta.context || ''}${wikiBlock}

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
