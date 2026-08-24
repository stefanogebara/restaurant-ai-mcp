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
    wiki: `### Visión General del Restaurante
Makoto es un restaurante de alta cocina japonesa de 9 mesas ubicado en el Barrio Salamanca de Madrid (Calle del Marqués de Villamagna 1). El chef Makoto Okuwa, ex colaborador del Iron Chef Morimoto en Nueva York, dirige una propuesta de cocina contemporánea japonesa con influencias europeas. El restaurante fue reconocido como el Mejor Restaurante Japonés del Año 2025 por Gastro & Cía (La Razón). Horario: diario de 13:00 a 00:00.

### Menú y Especialidades
El menú estrella es el Omakase Edomae (€90/cubierto) — un menú degustación de sushi, nigiri y cocina kaiseki. Los platos más solicitados son: Menú Omakase (34% de los pedidos), Wagyu con yema curada (22%), Rock Shrimp (18%), Nigiri Edomae (15%), Fried Rice con foie y anguila (11%), Tres Leches de Okinawa y maridaje sake. El ticket medio es de €80–€120 por cubierto. El maridaje sake (€30 extra) es muy popular — mencionarlo puede aumentar el ticket medio.

### Perfil de Clientes
Los clientes habituales incluyen Carlos Domingo Ríos (VIP, 12 visitas, prefiere mesa discreta), Elena García Ruiz (alérgica al marisco — avisar siempre a cocina), Javier Martínez Blanco (asiduo de los viernes), y Sofía Fernández López (aniversario recurrente). El 60% de los comensales son residentes del barrio Salamanca, el 40% turistas de alto poder adquisitivo. Reserva obligatoria para todos los servicios.

### Patrones de Reserva
Los viernes y sábados entre 21:00–22:30 son los horarios de máxima demanda — suelen completarse con 3–4 días de antelación. El menú omakase ocupa mesa durante 90–110 minutos promedio. La tasa de no-show es del 3%. Los recordatorios de WhatsApp se envían 2 horas antes y han reducido los no-shows en un 38%.

### Métricas de Rendimiento
Cubiertos promedio por servicio nocturno: 22. Facturación semanal estimada: €24.500. Ocupación media: 81%. Satisfacción del cliente: 4.6/5. Los viernes y sábados son los días de mayor ingreso — concentran el 40% de la facturación semanal.

### Notas Operativas
La cocina necesita mínimo 24 horas de antelación para acomodar alergias graves (marisco, gluten). El mostrador de sushi está siempre abierto para walk-ins si hay taburete disponible. La sala privada (Mesa 9, sala de madera, 4 personas) se reserva con semanas de antelación para ocasiones especiales. El stock de sake premium debe verificarse antes del servicio del viernes.`,
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

  const { message, context, lang, restaurant_id, preset_key, persona, history } = req.body || {};

  // Preset demos bypass DB validation (no DB record exists for preset demos)
  const isPresetDemo = preset_key && KNOWN_PRESETS.has(preset_key);

  // Nome vindo do banco na validação. Antes, quando o frontend não mandava
  // context.restaurantName, o prompt caía no literal inglês 'your restaurant'
  // e a IA respondia "Bem-vindo ao assistente do **your restaurant**" — inglês
  // no meio do português, na feature que existe pra impressionar o dono.
  let nomeDoBanco = null;
  // Dados reais do restaurante (horários, pratos, resumo) para a persona
  // recepcionista responder com o restaurante DELE, não com generalidades.
  let dadosDoBanco = null;

  if (!isPresetDemo) {
    // Validate token-based demo restaurant against DB
    if (!restaurant_id || typeof restaurant_id !== 'string') {
      return res.status(400).json({ error: 'restaurant_id is required for non-preset demos' });
    }
    try {
      const { data: restaurant, error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name, scraped_data')
        .eq('id', restaurant_id)
        .eq('is_demo', true)
        .maybeSingle();

      if (error || !restaurant) {
        return res.status(400).json({ error: 'Invalid or non-demo restaurant' });
      }
      nomeDoBanco = restaurant.restaurant_name || null;
      dadosDoBanco = restaurant.scraped_data || null;
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
  const semNome = lang === 'pt-BR' ? 'seu restaurante' : lang === 'es' ? 'tu restaurante' : 'your restaurant';
  const restaurantName = ctx.restaurantName || nomeDoBanco || (isPresetDemo ? preset_key : semNome);

  // ── Histórico multi-turno ──
  //
  // Conversa de reserva não existe em turno único ("quero reservar" → "para
  // quantas pessoas?" → "4" → ...). O endpoint aceitava só UMA mensagem, então
  // qualquer persona conversacional era impossível. O histórico vem do
  // cliente e é público, logo o saneamento é agressivo: papéis fora do enum
  // caem fora, textos são truncados e só as últimas 10 mensagens contam —
  // é teto de custo, não de UX (10 turnos cobrem qualquer reserva).
  const historicoSaneado = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));

  const presetMeta = isPresetDemo ? (PRESET_META[preset_key] || {}) : {};
  // O idioma da UI do usuário VENCE o default do preset. A precedência antiga
  // (preset primeiro) fazia o preset italiano (respondIn 'English') responder
  // em inglês a uma pergunta em português — auditado ao vivo em 18/08: a
  // primeira resposta do gerente do demo saiu em inglês na frente do prospect.
  const respondIn =
    (lang === 'pt-BR' ? 'Portuguese (Brazil)' : lang === 'es' ? 'Spanish' : lang === 'en' ? 'English' : null) ||
    presetMeta.respondIn ||
    'English';
  const revenue = ctx.totalRevenue
    ? (lang === 'pt-BR' ? `R$ ${ctx.totalRevenue}` : `€${ctx.totalRevenue}`)
    : 'not available';

  const wikiBlock = presetMeta.wiki
    ? `\n\n[RESTAURANT KNOWLEDGE BASE]\n${presetMeta.wiki}`
    : '';

  // ── Dados reais para a recepcionista ──
  //
  // O que diferencia este demo de um chatbot genérico é responder com os dados
  // DELE: os horários que o Google devolveu, os pratos que os clientes citam
  // nas avaliações, o resumo editorial. Tudo já está em scraped_data (o
  // enriquecimento grava .menu e .insights lá); aqui só se monta o bloco.
  const d = dadosDoBanco || {};
  // Google entrega hours_text pronto; o demo manual (restaurante novo, F4)
  // só tem o JSONB business_hours que o dono configurou — formata na hora.
  const horariosManuais = d.business_hours && typeof d.business_hours === 'object'
    ? Object.entries(d.business_hours)
        .map(([dia, h]) =>
          h && h.is_open !== false && h.open_time && h.close_time
            ? `${dia}: ${h.open_time} – ${h.close_time}`
            : null)
        .filter(Boolean)
        .join('\n')
    : '';
  const horarios = Array.isArray(d.hours_text) && d.hours_text.length
    ? d.hours_text.join('\n')
    : (horariosManuais || null);
  const pratos = [...new Set([
    ...(d.menu?.popular_dishes || []),
    ...(d.insights?.popular_dishes || []),
  ])].filter((x) => typeof x === 'string' && x.trim()).slice(0, 8);
  const blocoDados = [
    horarios ? `Opening hours:\n${horarios}` : null,
    d.address ? `Address: ${d.address}` : null,
    d.editorial_summary ? `About: ${d.editorial_summary}` : null,
    pratos.length ? `Dishes guests praise: ${pratos.join(', ')}` : null,
    d.cuisine_type ? `Cuisine: ${d.cuisine_type}` : null,
    Array.isArray(d.vibe_tags) && d.vibe_tags.length
      ? `Vibe (described by the owner): ${d.vibe_tags.join(', ')}`
      : null,
  ].filter(Boolean).join('\n\n');

  const ehRecepcionista = persona === 'recepcionista';

  // Data de hoje no fuso do mercado (Brasil). Sem isso a recepcionista não
  // sabe resolver "sexta" e devolve a pergunta — verificado na primeira
  // conversa real em produção (28/jul): "Qual é a data da sexta-feira que
  // você prefere?" depois de o cliente já ter dito "sexta às 20h".
  const hoje = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date());

  // A recepcionista fala com o CLIENTE (o dono se passando por cliente); o
  // gerente fala com o DONO. Mesmo endpoint, papéis opostos — o que muda é
  // quem a IA acha que está do outro lado.
  const systemPrompt = ehRecepcionista
    ? `You are the AI receptionist of the restaurant "${restaurantName}", chatting with a GUEST on WhatsApp. This is a live product demo — the person typing is the restaurant owner trying out their own AI, playing the role of a guest.
${presetMeta.context || ''}${wikiBlock}
${blocoDados ? `\n[REAL DATA OF THIS RESTAURANT — use it to answer]\n${blocoDados}\n` : ''}
Today is ${hoje} (America/Sao_Paulo).

Behavior:
- Respond in ${respondIn}
- WhatsApp style: short messages, warm and professional, at most ONE question per message
- Goal: complete a reservation. Collect, in this order, whatever is missing: party size, date, time, and the guest's full name
- When the guest names a weekday without a date ("sexta"), assume the NEXT occurrence of that weekday and state the resolved date in your confirmation — do NOT ask which one
- When you have all four, confirm with this exact format (translated to ${respondIn}):
📍 ${restaurantName}
📅 [date]
🕗 [time]
👥 [party size]
then say a reminder will be sent 2 hours before
- CRITICAL OUTPUT FORMAT: the confirmation message MUST end with one extra final line, exactly this shape: [[BOOKED|YYYY-MM-DD|HH:MM|party size as a plain number|guest full name]] (resolved date, 24h time). The server parses and REMOVES that line before the guest sees anything — so you must ALWAYS write it when — and ONLY when — you send the confirmation block. A confirmation without this line is a broken reply. Never write this line in any other message
- If asked about hours, menu or dishes, answer from the real data above; if something is not in the data, say you will check with the team — NEVER invent prices or menu items
- If asked whether this is a real booking, be honest: this is a demonstration, no real table is being held
- Use the EXACT restaurant name "${restaurantName}"; NEVER invent a different one`
    : `You are a concise AI restaurant manager assistant for "${restaurantName}".
${presetMeta.context || ''}${wikiBlock}
${blocoDados ? `\n[REAL DATA OF THIS RESTAURANT — reviews-derived; use to answer questions about dishes, hours, what guests say]\n${blocoDados}\n` : ''}
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
      // A confirmação da recepcionista (bloco 📍📅🕗👥 + lembrete) não cabe nos
      // 150 tokens do gerente.
      max_tokens: ehRecepcionista ? 300 : 150,
      system: systemPrompt,
      // Primer de idioma em dois turnos — a mesma cura do manager-agent: os
      // modelos seguem exemplos multi-turno com mais força que system prompt,
      // e regra só no system deixava o primeiro turno escapar no idioma errado.
      //
      // Primer do marcador [[BOOKED]] pela MESMA razão: no primeiro
      // walkthrough em produção (24/ago) o modelo fast escreveu o bloco de
      // confirmação humano e OMITIU o marcador — a instrução antiga ("never
      // mention it, the user never sees it") ensinava a esconder em vez de
      // escrever. Um exemplo concreto no histórico é o que o modelo copia.
      messages: [
        ...(ehRecepcionista
          ? [
              { role: 'user', content: 'Format check: how does a finished confirmation end? (example guest: Maria Silva, 2 people, 2026-09-12 19:30)' },
              { role: 'assistant', content: `📍 ${restaurantName}\n📅 12/09/2026\n🕗 19:30\n👥 2\n(reminder line)\n[[BOOKED|2026-09-12|19:30|2|Maria Silva]]` },
            ]
          : []),
        ...historicoSaneado,
        { role: 'user', content: `From now on, reply ONLY in ${respondIn}.` },
        { role: 'assistant', content: 'OK.' },
        { role: 'user', content: message },
      ],
    });

    const reply = response.content?.[0]?.text || '';

    // Marcador estruturado de reserva (Demo em Conversa, F2): a recepcionista
    // fecha a confirmação com uma linha [[BOOKED|data|hora|pessoas|nome]] que
    // o servidor extrai e REMOVE — o cliente recebe `booking` tipado e nunca
    // vê o marcador. Parse aqui (não no front) para o contrato ficar num
    // lugar só; se a IA mandar um marcador malformado, ele é descartado
    // silenciosamente e a resposta segue como texto puro.
    let booking = null;
    let cleanReply = reply;
    const marcador = reply.match(
      /\[\[BOOKED\|(\d{4}-\d{2}-\d{2})\|(\d{1,2}:\d{2})\|(\d{1,3})\|([^\]|]+)\]\]/
    );
    if (marcador) {
      cleanReply = reply.replace(marcador[0], '').trimEnd();
      const partySize = parseInt(marcador[3], 10);
      if (partySize >= 1 && partySize <= 100) {
        booking = {
          date: marcador[1],
          time: marcador[2].padStart(5, '0'),
          party_size: partySize,
          name: marcador[4].trim(),
        };
      }
    }

    return res.status(200).json({ reply: cleanReply, booking });
  } catch (err) {
    logger.error('Demo chat error:', err?.message || err);
    return res.status(500).json({ error: 'AI service error' });
  }
}
