/**
 * POST /api/onboarding/complete
 *
 * Completes the entire restaurant onboarding process:
 * 1. Gera o id do restaurante e monta os metadados do cadastro
 * 2. Creates tables in the tables table
 * 3. Returns success response
 *
 * NOTE: Migrated from Airtable multi-restaurant architecture to
 * Supabase single-restaurant architecture (Nov 2025)
 */

const crypto = require('crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { PERSONA_PRESETS } = require('../_lib/vibe-to-persona-preset');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');
const { verifyAuth } = require('../_lib/auth');
const { suggestTimezone } = require('../_lib/timezone');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const logger = createSecureLogger('Onboarding');

const { findOwnerRestaurant, runSetupStep } = require('../_services/onboardingRecovery');

// ============ Explicit Country + Language Resolution ============

// Country -> ISO code -> voice language lives in api/_lib/country-locale.js,
// shared with the demo so both paths give a restaurant the same language.
const { COUNTRY_LANGUAGE_MAP, resolveCountryIso } = require('../_lib/country-locale');

// DB enum restaurant.restaurant_type_enum accepts only this whitelist (as of
// 2026-04 — observed by querying existing rows). The onboarding form surfaces
// more user-friendly options (Pizzaria, Bar, Café…) that the enum doesn't
// accept. Anything outside the whitelist is folded into 'other' rather than
// silently failing the insert.
const VALID_CONFIG_RESTAURANT_TYPES = new Set([
  'casual_dining', 'fine_dining', 'italian', 'japanese', 'mexican', 'steakhouse', 'other',
]);

// ============ Slug Generation ============

/**
 * Generate a URL-friendly slug from a restaurant name.
 * Handles accented characters, special chars, and trims to 50 chars.
 * @param {string} name - Restaurant name
 * @returns {string} URL-safe slug
 */
function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special chars
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/-+/g, '-')            // Collapse consecutive hyphens
    .replace(/^-|-$/g, '')          // Trim leading/trailing hyphens
    .slice(0, 50);
}

/**
 * Generate a unique slug for a restaurant, checking against existing slugs.
 * If a collision is found, appends a random 4-digit suffix.
 * @param {string} name - Restaurant name
 * @param {object} supabaseClient - Supabase client instance
 * @returns {Promise<string>} Unique slug
 */
async function generateUniqueSlug(name, supabaseClient) {
  const baseSlug = generateSlug(name);

  // Check if this slug already exists (restaurant_config is in 'restaurant' schema)
  const { data: existing } = await supabaseClient
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('slug', baseSlug)
    .limit(1);

  if (!existing || existing.length === 0) {
    return baseSlug;
  }

  // Collision detected: append cryptographically random 4-digit suffix
  const suffix = (crypto.randomBytes(2).readUInt16BE(0) % 9000) + 1000; // 1000-9999
  const slugWithSuffix = `${baseSlug.slice(0, 45)}-${suffix}`;

  // Verify the suffixed slug is also unique (extremely unlikely collision but safe)
  const { data: existingWithSuffix } = await supabaseClient
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('slug', slugWithSuffix)
    .limit(1);

  if (!existingWithSuffix || existingWithSuffix.length === 0) {
    return slugWithSuffix;
  }

  // Last resort: add timestamp fragment
  return `${baseSlug.slice(0, 40)}-${Date.now().toString(36).slice(-6)}`;
}

// Live setup progress (2026-11-16). A client that sends
// `Accept: text/event-stream` gets one event per setup result as soon as that
// result is known, so the onboarding screen shows what really happened instead
// of timed guesses. The stream opens only AFTER the restaurant is saved: every
// earlier refusal (bad input, 409, save failure) stays a JSON response with its
// status code, exactly as without the header. Without the header nothing changes.
function setupProgress(req, res) {
  const wanted = String(req.headers?.accept || '').includes('text/event-stream');
  const sent = new Set();
  let open = false;
  const write = (frame) => res.write(`data: ${JSON.stringify(frame)}\n\n`);
  return {
    get open() { return open; },
    /** One event per key; a second call for the same key is ignored. */
    step(key, status, detail = {}) {
      if (!wanted || sent.has(key)) return;
      if (!open) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        open = true;
      }
      sent.add(key);
      write({ type: 'step', key, status, ...detail });
    },
    finish(body) {
      if (!open) return res.status(200).json(body);
      write({ type: 'done', ...body });
      return res.end();
    },
    fail(message) {
      write({ type: 'error', error: message });
      return res.end();
    },
  };
}

module.exports = async (req, res) => {
  // Set CORS headers
  setInternalCors(req, res);

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'onboarding_complete');
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const userId = auth.user?.sub || auth.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const progress = setupProgress(req, res);

  try {
    // `let` (not `const`) for the 4 string fields below — we reassign them
    // to their trimmed/validated form after the input check so downstream
    // code can never accidentally consume the raw req.body values.
    let {
      customer_email,
      restaurant_name,
      phone_number,
      email,
    } = req.body;
    const {
      restaurant_type,
      city,
      country,
      website,
      // Link do cardápio informado pelo dono. Vale sozinho, sem site.
      menu_url,
      business_hours,
      average_dining_duration,
      areas,
      advance_booking_days,
      buffer_time,
      cancellation_policy,
      special_notes,
      team_members,
      plan, // Subscription plan from Stripe
      // Dados fiscais confirmados pelo dono no passo de contato (enricher de
      // CNPJ, item 5). Sempre opcionais: restaurante novo pode não constar no
      // índice da Receita, e isso jamais deve travar o cadastro.
      cnpj,
      razao_social,
      socio_confirmado,
      selected_voice_id, // Voice selection from Step 2.5
      selected_voice_language, // Language code from selected voice (e.g., 'es', 'fr', 'en')
      restaurant_learning, // AI restaurant learning data (session_id, restaurant_profile)
      // A voz escolhida na folha de confirmação — um dos quatro presets. É a
      // única parte do perfil que a pesquisa NÃO pode descobrir, e a única que
      // o dono precisa decidir. Ver api/_lib/persona-proposta.js.
      voz_preset,
      // Token do demo que originou este cadastro. Só o TOKEN vem do cliente —
      // o conhecimento é lido do banco aqui no servidor (ver bloco abaixo).
      demo_token,
    } = req.body;

    // Validate required fields — hardened to reject empty strings and
    // obviously malformed input rather than letting them land in the DB.
    // The previous version only checked truthiness, so `"   "` and an
    // unvalidated email would pass and crash downstream lookups.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const PHONE_RE = /^\+?[0-9\s().-]{7,32}$/;
    const trimStr = (v) => (typeof v === 'string' ? v.trim() : '');

    const trimmedCustomerEmail = trimStr(customer_email);
    const trimmedRestaurantName = trimStr(restaurant_name);
    const trimmedPhone = trimStr(phone_number);
    const trimmedEmail = trimStr(email);

    const fieldErrors = [];
    if (!trimmedCustomerEmail) fieldErrors.push({ field: 'customer_email', reason: 'required' });
    else if (!EMAIL_RE.test(trimmedCustomerEmail)) fieldErrors.push({ field: 'customer_email', reason: 'invalid email format' });

    if (!trimmedRestaurantName) fieldErrors.push({ field: 'restaurant_name', reason: 'required' });
    else if (trimmedRestaurantName.length > 255) fieldErrors.push({ field: 'restaurant_name', reason: 'must be 255 characters or less' });

    if (!trimmedPhone) fieldErrors.push({ field: 'phone_number', reason: 'required' });
    else if (!PHONE_RE.test(trimmedPhone)) fieldErrors.push({ field: 'phone_number', reason: 'invalid phone format' });

    if (!trimmedEmail) fieldErrors.push({ field: 'email', reason: 'required' });
    else if (!EMAIL_RE.test(trimmedEmail)) fieldErrors.push({ field: 'email', reason: 'invalid email format' });
    // Defesa em profundidade contra o placeholder do demo: <slug>@demo.seatable.one
    // satisfaz o NOT NULL do demo e passa na regex — mas como e-mail transacional
    // do restaurante real é um buraco negro (o prefill também filtra; isto pega
    // qualquer cliente que não filtre).
    else if (trimmedEmail.toLowerCase().endsWith('@demo.seatable.one')) {
      fieldErrors.push({ field: 'email', reason: 'placeholder demo email is not a real contact address' });
    }

    const resolvedCountryIso = resolveCountryIso(country);
    if (country == null || (typeof country === 'string' && !country.trim())) {
      fieldErrors.push({ field: 'country', reason: 'required' });
    } else if (!resolvedCountryIso) {
      fieldErrors.push({ field: 'country', reason: 'unsupported country' });
    }

    if (fieldErrors.length > 0) {
      // Build a user-friendly message that names the first offending field
      // so the client can map it back to a specific input. Keeps the full
      // structured details available for Sentry / dashboard error logs.
      const first = fieldErrors[0];
      return res.status(400).json({
        error: `Invalid ${first.field}: ${first.reason}`,
        field: first.field,
        reason: first.reason,
        details: fieldErrors,
      });
    }

    // Reassign so the rest of the handler always uses the trimmed values.
    customer_email = trimmedCustomerEmail;
    restaurant_name = trimmedRestaurantName;
    phone_number = trimmedPhone;
    email = trimmedEmail;

    logger.info(' Starting onboarding for:', customer_email);
    logger.info(' Restaurant:', restaurant_name);

    // Validate and sanitize business_hours
    const HH_MM_REGEX = /^\d{2}:\d{2}$/;
    let validatedBusinessHours = Array.isArray(business_hours) ? business_hours : [];

    // Validate time format for each day
    validatedBusinessHours = validatedBusinessHours.map(day => ({
      ...day,
      open_time: HH_MM_REGEX.test(day.open_time) ? day.open_time : '11:00',
      close_time: HH_MM_REGEX.test(day.close_time) ? day.close_time : '22:00',
    }));

    // Check if at least one day has valid open/close times
    const hasAnyOpenDay = validatedBusinessHours.some(
      day => day.is_open && day.open_time && day.close_time
    );

    if (!hasAnyOpenDay) {
      logger.warn(' No open days in business_hours — applying default schedule (Mon-Sat 11:00-22:00)');
      const defaultDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      validatedBusinessHours = defaultDays.map(day => ({
        day,
        is_open: day !== 'Sunday',
        open_time: '11:00',
        close_time: '22:00',
      }));
    }

    // Validate restaurant_type against allowed values
    // Must include all slugified types sent by the frontend (Step1Welcome.tsx)
    const ALLOWED_RESTAURANT_TYPES = [
      'traditional', 'modern', 'fast-casual', 'fine-dining',
      'casual-dining', 'cafe', 'bar', 'bistro',
      'pizzeria', 'steakhouse', 'seafood', 'other',
      // Cozinha do enum do banco — o prefill do demo envia estes quando o
      // Google identifica a cozinha; rejeitá-los degradava para 'other'.
      'italian', 'japanese', 'mexican',
      // Variantes underscore (enum do demo) — defesa para clientes que não
      // passem pelo normalizador do wizard (ex.: onboarding-chat).
      'fine_dining', 'casual_dining', 'fast_casual',
    ];
    const validatedRestaurantType = ALLOWED_RESTAURANT_TYPES.includes(restaurant_type)
      ? restaurant_type
      : null;  // Set to null if invalid value provided

    if (restaurant_type && !validatedRestaurantType) {
      logger.warn(` Invalid restaurant_type "${restaurant_type}". Must be one of: ${ALLOWED_RESTAURANT_TYPES.join(', ')}. Setting to null.`);
    }

    // Country has already been validated before any persistence or provisioning.
    const resolvedLanguage = COUNTRY_LANGUAGE_MAP[resolvedCountryIso];
    const resolvedTimezone = suggestTimezone(resolvedCountryIso, city);

    // ── Conhecimento do demo (G2 — Onboarding do Aha) ────────────────────
    //
    // O demo e o restaurante real eram dois sistemas disjuntos ligados por um
    // prefill de 7 campos de formulário. Persona derivada das vibes, cardápio
    // e insights do enrichment, as reviews do Google e o idioma inferido pelo
    // prefixo do telefone morriam na travessia — e o card que o dono clicou
    // prometia "Sua recepcionista IA já está configurada com tudo isso"
    // (auditoria 24/ago). O syncKnowledgeBase até SELECIONA ai_personality;
    // recebia vazio.
    //
    // Servidor→servidor de propósito: o cliente manda só o token e a leitura
    // acontece aqui com service role. Mesmo raciocínio do demo/create, que
    // limpa prospect_lead_id de qualquer scraped_data vindo do browser.
    //
    // Sem filtro de expiração: converter no 8º dia (linha ainda viva até o
    // cron de limpeza) deve carregar o conhecimento do mesmo jeito.
    let demoKnowledge = null;
    if (typeof demo_token === 'string' && demo_token.trim()) {
      try {
        const { data: demoRow } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .select('id, ai_personality, scraped_data, agent_language, reservation_settings, menu_url')
          .eq('demo_token', demo_token.trim())
          .eq('is_demo', true)
          .maybeSingle();
        if (demoRow) {
          demoKnowledge = demoRow;
          logger.info(` Demo knowledge carried over from ${demoRow.id}`);
        }
      } catch (err) {
        // Nunca fatal — o cadastro vale mais que o enriquecimento.
        logger.warn(' Failed to load demo knowledge (non-fatal):', err.message);
      }
    }

    const restaurantId = crypto.randomUUID();

    // Metadados do cadastro, gravados em restaurant_config.metric_profile.
    //
    // Antes iam para restaurant_info junto com uma cópia de restaurant_name,
    // phone, email, address, business_hours, timezone e language — todos campos
    // que restaurant_config já tem por conta própria. Com a tabela aposentada
    // (02/08/2026) sobra só este blob, e ele tem casa natural em
    // `metric_profile`: é exatamente o que os leitores de lá esperam —
    // subscription-middleware:299 lê `.plan` como fallback do plano e
    // constants.js:72 lê `.default_dining_duration`.
    //
    // NÃO confundir com `owner_metric_profile`, que é o que o dono escolhe
    // acompanhar na tela de Configurações. São coisas diferentes em colunas
    // diferentes, de propósito — misturá-las apagaria o plano do cliente.
    //
    // Template is auto-derived from subscription plan:
    // - Basic/Free → simple template
    // - Professional/Pro → advanced template
    const onboardingMetricProfile = {
        customer_email,
        restaurant_id: restaurantId,
        restaurant_type: validatedRestaurantType,  // Use validated value
        city,
        country,
        plan: plan || 'Starter',
        template: (plan === 'growth' || plan === 'Growth' || plan === 'scale' || plan === 'Scale') ? 'advanced' : 'simple',
        website: website || '',
        // menu_url saiu daqui em 01/08/2026. Este JSONB era abrigo temporário
        // enquanto a coluna dedicada não existia; agora ela existe e é a fonte
        // única (ver restaurantConfigData abaixo). Manter os dois seria duas
        // verdades para o mesmo campo.
        // Só dígitos: o painel formata para exibir, mas comparar/consultar
        // depende do formato canônico.
        cnpj: typeof cnpj === 'string' ? cnpj.replace(/\D/g, '').slice(0, 14) : null,
        razao_social: typeof razao_social === 'string' ? razao_social.slice(0, 200) : null,
        // Quem o dono disse ser, entre os sócios da Receita. É a prova mais
        // barata de que quem cadastrou é dono — sem pedir documento.
        socio_confirmado: typeof socio_confirmado === 'string' ? socio_confirmado.slice(0, 200) : null,
        cancellation_policy: cancellation_policy || 'Cancelamento gratuito até 2 horas antes da reserva',
        special_notes: special_notes || '',
        advance_booking_days: advance_booking_days || 30,
        buffer_time: buffer_time || 15,
        onboarding_completed_at: new Date().toISOString()
    };

    // STEP 2: Create Tables. O id acabou de ser gerado: não há mesa antiga
    // deste restaurante para apagar antes.
    logger.info(' Step 2: Creating tables...');

    // Create new tables from areas configuration
    let tableNumber = 1;
    const tablesToInsert = [];

    for (const area of areas || []) {
      for (const tableConfig of area.tables || []) {
        for (let i = 0; i < tableConfig.count; i++) {
          tablesToInsert.push({
            restaurant_id: restaurantId,
            table_number: tableNumber,
            capacity: tableConfig.capacity,
            location: area.name,
            status: 'available',  // Must be lowercase to match database enum
            is_active: true,
            current_service_id: null,
            is_fixed: tableConfig.is_fixed || false,  // Flexible table support
            shape: tableConfig.shape || 'square',  // Table shape from onboarding
            is_joinable: tableConfig.is_joinable !== false,  // Default to joinable
            is_fixed_seating: tableConfig.is_fixed_seating || false
          });
          tableNumber++;
        }
      }
    }

    if (tablesToInsert.length === 0) {
      logger.warn(' No tables provided in onboarding — creating 4 default tables');
      for (let i = 1; i <= 4; i++) {
        tablesToInsert.push({
          restaurant_id: restaurantId,
          table_number: i,
          capacity: 4,
          location: 'Main',
          status: 'available',
          is_active: true,
          current_service_id: null,
          is_fixed: false,
          shape: 'square',
          is_joinable: true,
          is_fixed_seating: false
        });
      }
    }

    // STEP 3: Prepare restaurant configuration.
    logger.info(' Step 3: Creating restaurant_config for AI agent...');


    // Prepare table configuration for restaurant_config
    const tableConfiguration = areas.map(area => ({
      area_name: area.name,
      tables: []
    }));

    // Build table numbers array for each area
    let currentTableNum = 1;
    for (const area of areas) {
      const areaConfig = tableConfiguration.find(a => a.area_name === area.name);
      for (const tableConfig of area.tables) {
        for (let i = 0; i < tableConfig.count; i++) {
          areaConfig.tables.push({
            table_number: String(currentTableNum),
            capacity: tableConfig.capacity
          });
          currentTableNum++;
        }
      }
    }

    // Map restaurant_type slug to restaurant_config enum value
    const typeMapping = {
      'traditional': 'casual_dining',
      'modern': 'fine_dining',
      'fast-casual': 'fast_casual',
      'fine-dining': 'fine_dining',
      'casual-dining': 'casual_dining',
      // Identidade para as variantes underscore (enum do demo) — sem estas
      // chaves o lookup errava e a cozinha real virava 'other'.
      'fine_dining': 'fine_dining',
      'casual_dining': 'casual_dining',
      'fast_casual': 'fast_casual',
      'italian': 'italian',
      'japanese': 'japanese',
      'mexican': 'mexican',
      'steakhouse': 'steakhouse',
      'cafe': 'cafe',
      'bar': 'bar',
      'bistro': 'bistro',
      'pizzeria': 'pizzeria',
      'seafood': 'seafood',
      'other': 'other',
    };
    // Fold anything outside the DB enum whitelist into 'other'. Previously
    // onboarding submitted types like 'pizzeria' or 'cafe' that typeMapping
    // passed through unchanged, which blew up with
    //   22P02: invalid input value for enum restaurant_type
    // inside a silent try/catch — leaving the user without a restaurant_config
    // row and a broken dashboard.
    const preferredType = typeMapping[restaurant_type] || 'other';
    const mappedType = VALID_CONFIG_RESTAURANT_TYPES.has(preferredType) ? preferredType : 'other';
    if (preferredType !== mappedType) {
      logger.warn(`restaurant_type "${preferredType}" not in DB enum; using 'other'`);
    }

    // Language code to locale mapping (e.g., 'es' → 'es-ES')
    const languageToLocale = {
      'en': 'en-US',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'it': 'it-IT',
      'pt': 'pt-PT',
      'pl': 'pl-PL',
      'tr': 'tr-TR',
      'ru': 'ru-RU',
      'nl': 'nl-NL',
      'sv': 'sv-SE',
      'da': 'da-DK',
      'no': 'no-NO',
      'fi': 'fi-FI',
      'ja': 'ja-JP'
    };

    // Multilingual greeting messages
    const greetingMessages = {
      'en': `Thank you for calling ${restaurant_name}! How may I assist you today?`,
      'es': `¡Gracias por llamar a ${restaurant_name}! ¿Cómo puedo ayudarle hoy?`,
      'fr': `Merci d'appeler ${restaurant_name}! Comment puis-je vous aider aujourd'hui?`,
      'de': `Vielen Dank für Ihren Anruf bei ${restaurant_name}! Wie kann ich Ihnen heute helfen?`,
      'it': `Grazie per aver chiamato ${restaurant_name}! Come posso aiutarla oggi?`,
      'pt': `Obrigado por ligar para ${restaurant_name}! Como posso ajudá-lo hoje?`,
      'pl': `Dziękujemy za telefon do ${restaurant_name}! Jak mogę Ci dzisiaj pomóc?`,
      'tr': `${restaurant_name}'i aradığınız için teşekkür ederiz! Bugün size nasıl yardımcı olabilirim?`,
      'ru': `Спасибо, что позвонили в ${restaurant_name}! Чем я могу вам помочь сегодня?`,
      'nl': `Bedankt voor het bellen naar ${restaurant_name}! Hoe kan ik u vandaag helpen?`,
      'sv': `Tack för att du ringer ${restaurant_name}! Hur kan jag hjälpa dig idag?`,
      'da': `Tak fordi du ringer til ${restaurant_name}! Hvordan kan jeg hjælpe dig i dag?`,
      'no': `Takk for at du ringer ${restaurant_name}! Hvordan kan jeg hjelpe deg i dag?`,
      'fi': `Kiitos kun soitit ${restaurant_name}! Kuinka voin auttaa sinua tänään?`,
      'ja': `${restaurant_name}にお電話いただきありがとうございます！本日はどのようにお手伝いできますか？`
    };

    // Multilingual farewell messages
    const farewellMessages = {
      'en': 'Thank you for calling. Have a great day!',
      'es': '¡Gracias por llamar. Que tenga un gran día!',
      'fr': 'Merci d\'avoir appelé. Passez une excellente journée!',
      'de': 'Vielen Dank für Ihren Anruf. Haben Sie einen schönen Tag!',
      'it': 'Grazie per aver chiamato. Buona giornata!',
      'pt': 'Obrigado por ligar. Tenha um ótimo dia!',
      'pl': 'Dziękujemy za telefon. Miłego dnia!',
      'tr': 'Aradığınız için teşekkür ederiz. İyi günler!',
      'ru': 'Спасибо за звонок. Хорошего дня!',
      'nl': 'Bedankt voor het bellen. Fijne dag nog!',
      'sv': 'Tack för att du ringde. Ha en bra dag!',
      'da': 'Tak for dit opkald. Ha en god dag!',
      'no': 'Takk for at du ringte. Ha en fin dag!',
      'fi': 'Kiitos soitosta. Mukavaa päivänjatkoa!',
      'ja': 'お電話ありがとうございました。良い一日をお過ごしください！'
    };

    // Get language-specific messages
    // The voice choice may pick another language than the country's, but only
    // one the agent supports: the browser value was saved unchecked before.
    const chosenVoiceLanguage = typeof selected_voice_language === 'string'
      && Object.prototype.hasOwnProperty.call(languageToLocale, selected_voice_language)
      ? selected_voice_language : null;
    if (selected_voice_language && !chosenVoiceLanguage) {
      logger.warn('Ignoring unsupported selected_voice_language; using the country language');
    }
    const voiceLanguage = chosenVoiceLanguage || resolvedLanguage || 'en';
    const locale = languageToLocale[voiceLanguage] || 'en-US';
    const greetingMessage = greetingMessages[voiceLanguage] || greetingMessages['en'];
    const farewellMessage = farewellMessages[voiceLanguage] || farewellMessages['en'];

    // STEP 3a: Generate unique slug for public booking URL
    logger.info(' Step 3a: Generating booking slug...');
    const restaurantSlug = await generateUniqueSlug(restaurant_name, supabaseAdmin);
    logger.info(` Slug generated: ${restaurantSlug}`);

    // Prepare restaurant_config data
    const restaurantConfigData = {
      // Id FIXADO, não gerado pelo banco: é o mesmo que as mesas já usam, o que
      // torna o antigo passo 3b (realinhar mesas) desnecessário.
      id: restaurantId,
      user_id: userId,
      restaurant_name,
      restaurant_type: mappedType,
      slug: restaurantSlug,
      city,
      // Store ISO country code on the config row so downstream consumers
      // (timezone, weekly-report day filter, etc.) get the same answer here.
      country: resolvedCountryIso,
      agent_language: resolvedLanguage,
      // Metadados do cadastro (plano, template, CNPJ confirmado). Ver o bloco
      // onde é montado, lá em cima, para por que fica em metric_profile.
      // (timezone já é definido mais abaixo neste mesmo objeto.)
      metric_profile: onboardingMetricProfile,
      email: email || customer_email,
      phone: phone_number,
      website: website || null,
      // menu_url voltou (01/08/2026): a coluna FOI criada em produção e o
      // PostgREST a enxerga. Ela é o design correto — o cardápio é a fonte que
      // a IA relê quando o dono troca preços, então precisa ser consultável,
      // igual `website` logo acima.
      //
      // Histórico: adicionei esta linha em 2460482f sem criar a coluna e
      // quebrei o passo final do onboarding (o PostgREST rejeita coluna
      // desconhecida, e o dono preenchia seis passos sem conseguir concluir).
      // O valor ficou abrigado em restaurant_info.metric_profile até o DDL sair.
      // Agora a coluna é a fonte única: a chave duplicada no JSONB foi removida
      // para não haver dois lugares dizendo a mesma coisa. Nenhum dado se
      // perdeu — o abrigo estava vazio em todas as linhas existentes.
      menu_url: typeof menu_url === 'string' && menu_url.trim() ? menu_url.trim().slice(0, 500) : null,
      voice_id: selected_voice_id || 'default',
      business_hours: validatedBusinessHours.reduce((acc, day) => {
        acc[day.day.toLowerCase()] = {
          is_open: day.is_open,
          open_time: day.open_time,
          close_time: day.close_time
        };
        return acc;
      }, {}),
      table_configuration: tableConfiguration,
      reservation_settings: {
        advance_booking_days: advance_booking_days || 30,
        buffer_time_minutes: buffer_time || 15,
        cancellation_policy: cancellation_policy || 'Cancelamento gratuito até 2 horas antes da reserva',
        special_notes: special_notes || '',
        max_party_size: 12,
        min_party_size: 1,
        require_credit_card: false,
        allow_waitlist: true
      },
      average_dining_duration_minutes: average_dining_duration || 90,
      timezone: resolvedTimezone,
      max_concurrent_reservations: 50,
      team_members: (team_members || []).map(tm => ({
        email: tm.email,
        role: tm.role.toLowerCase(),
        status: tm.status || 'pending'
      })),
      ai_config: {
        greeting_message: greetingMessage,
        farewell_message: farewellMessage,
        language: locale,
        enable_voicemail: false,
        max_call_duration_minutes: 10,
        transfer_phone: phone_number
      },
      is_active: true,
      onboarding_completed: true,
      ...(restaurant_learning?.restaurant_profile ? {
        restaurant_profile: restaurant_learning.restaurant_profile
      } : {}),
      // A voz escolhida na folha vira ai_personality, que é o que o
      // elevenlabs-kb-sync lê para a base de conhecimento do agente. Fica
      // ANTES do bloco do demo de propósito: aquele bloco só preenche quando
      // o campo está vazio, então a escolha explícita do dono vence a persona
      // derivada automaticamente das vibes.
      ...(PERSONA_PRESETS[voz_preset] ? {
        ai_personality: { ...PERSONA_PRESETS[voz_preset], _derived_from_preset: voz_preset }
      } : {}),
    };

    // Conhecimento do demo entra SEM sobrescrever escolha explícita do dono.
    if (demoKnowledge) {
      // A persona que a recepcionista do demo usou (derivada das vibes do
      // caminho "restaurante novo" ou do enrichment do site/reviews).
      if (demoKnowledge.ai_personality && !restaurantConfigData.ai_personality) {
        restaurantConfigData.ai_personality = demoKnowledge.ai_personality;
      }
      // Google Places + enrichment (menu, insights, top_reviews): é o que
      // alimenta a base de conhecimento do agente e os cards de "o que sua IA
      // já sabe". O wizard nunca teve como recolher isso à mão.
      if (demoKnowledge.scraped_data) {
        restaurantConfigData.scraped_data = demoKnowledge.scraped_data;
      }
      if (!restaurantConfigData.menu_url && demoKnowledge.menu_url) {
        restaurantConfigData.menu_url = demoKnowledge.menu_url;
      }

      // O perfil da IA a partir da PESQUISA, quando não veio de entrevista.
      //
      // `restaurant_profile` alimenta o system prompt do Manager AI, a persona
      // do agente de voz e a semente da memória. Até aqui ele só nascia das
      // doze perguntas dissertativas do "Ensine sua IA" — e por isso a
      // entrevista não podia simplesmente sair do caminho.
      //
      // Mas o scraped_data que acabou de ser copiado acima já responde seis
      // das oito seções: editorial, cozinha, faixa de preço, vibe, pratos
      // populares, elogios e queixas recorrentes. A sétima é a voz que o dono
      // escolheu na folha. Determinístico, sem LLM — somar 30s de síntese a um
      // handler que já tem tetos de 15s e 8s traria o
      // FUNCTION_INVOCATION_FAILED de volta.
      //
      // NÃO sobrescreve: entrevista feita continua vencendo.
      if (!restaurantConfigData.restaurant_profile && restaurantConfigData.scraped_data) {
        try {
          const { montarPerfil } = require('../_lib/perfil-do-scrape');
          const { restaurant_profile: perfil, cobertura } = montarPerfil({
            scraped_data: restaurantConfigData.scraped_data,
            restaurant_name: restaurantConfigData.restaurant_name,
            restaurant_type: restaurantConfigData.restaurant_type,
            preset: voz_preset,
          });
          if (cobertura._preenchidas > 0) {
            restaurantConfigData.restaurant_profile = perfil;
            logger.info(`Perfil montado da pesquisa: ${cobertura._preenchidas}/${cobertura._total} seções`);
          }
        } catch (err) {
          // Perfil é enriquecimento, não requisito. O restaurante nasce e o
          // painel funciona sem ele.
          logger.warn('Falha ao montar perfil da pesquisa (não-fatal):', err.message);
        }
      }
      // Idioma: só quando a resolução pelo país caiu no default 'en' e o demo
      // sabe algo mais específico — ele infere pelo prefixo do telefone, que
      // foi o que consertou o demo de Madri nascendo em inglês.
      if (restaurantConfigData.agent_language === 'en'
          && demoKnowledge.agent_language && demoKnowledge.agent_language !== 'en') {
        restaurantConfigData.agent_language = demoKnowledge.agent_language;
      }
      // reservation_settings: o Passo 3 manda advance/buffer/policy (escolha
      // do dono) e esses vencem. max/min party e waitlist são HARDCODED no
      // payload — e o 12 fixo discordava do 8 que a recepcionista do demo
      // usou a conversa inteira. Nesses três o demo vence.
      const ds = demoKnowledge.reservation_settings;
      if (ds && typeof ds === 'object') {
        restaurantConfigData.reservation_settings = {
          ...restaurantConfigData.reservation_settings,
          max_party_size: ds.max_party_size ?? restaurantConfigData.reservation_settings.max_party_size,
          min_party_size: ds.min_party_size ?? restaurantConfigData.reservation_settings.min_party_size,
          allow_waitlist: ds.allow_waitlist ?? restaurantConfigData.reservation_settings.allow_waitlist,
        };
      }
    }

    // Keep the real config, greeting, registry and provider on the same
    // language. An explicit voice choice wins; otherwise the demo may refine
    // the country fallback after the initial config object was assembled.
    const finalVoiceLanguage = chosenVoiceLanguage || restaurantConfigData.agent_language || 'en';
    restaurantConfigData.agent_language = finalVoiceLanguage;
    restaurantConfigData.ai_config.language = finalVoiceLanguage === 'pt'
      && (resolvedCountryIso === 'BR' || /^\+55/.test(phone_number))
      ? 'pt-BR'
      : languageToLocale[finalVoiceLanguage] || 'en-US';
    restaurantConfigData.ai_config.greeting_message = greetingMessages[finalVoiceLanguage] || greetingMessages.en;
    restaurantConfigData.ai_config.farewell_message = farewellMessages[finalVoiceLanguage] || farewellMessages.en;

    const { data: createdId, error: createError } = await supabaseAdmin.rpc('create_onboarding_restaurant', {
      p_config: restaurantConfigData,
      p_tables: tablesToInsert,
      p_customer_email: customer_email,
    });
    if (createError) throw createError;
    if (!createdId) {
      const existing = await findOwnerRestaurant(userId);
      return res.status(409).json({
        error: 'restaurant_already_exists',
        message: 'Esta conta já tem um restaurante configurado.',
        restaurant: existing ? { restaurant_id: existing.id, slug: existing.slug } : null,
      });
    }

    const bookingUrl = `/book/${restaurantSlug}`;
    const setup = { restaurant: 'ok' };
    progress.step('restaurant', setup.restaurant, {
      restaurant_id: createdId, booking_url: bookingUrl,
      tables: tablesToInsert.length,
      seats: tablesToInsert.reduce((sum, table) => sum + (Number(table.capacity) || 0), 0),
    });

    // Invalidate SEO city+cuisine cache so the page rebuilds with this restaurant included
    try {
      const { slugify } = require('../_lib/seo-html');
      const cityKey = slugify(city || '');
      const cuisineKey = slugify(validatedRestaurantType || restaurant_type || '');
      if (cityKey && cuisineKey) {
        await supabaseAdmin
          .from('seo_page_cache')
          .delete()
          .eq('cache_key', `city:${cityKey}:${cuisineKey}`);
        logger.info('SEO cache invalidated', { cityKey, cuisineKey });
      }
    } catch (seoErr) {
      // Non-critical — log and continue. Onboarding is not affected.
      logger.warn('SEO cache invalidation failed (non-critical)', { err: seoErr.message });
    }

    const config = { id: createdId, user_id: userId };
    const registry = await runSetupStep(config, 'whatsapp_registry');
    setup.whatsapp_registry = registry.status;
    progress.step('whatsapp_registry', registry.status);

    // The initial plan is independent of the provider and can finish even
    // if the voice request hits its timeout.
    const planPromise = runSetupStep(config, 'subscription');
    const voice = await runSetupStep(config, 'voice_agent');
    setup.voice_agent = voice.status;
    progress.step('voice_agent', voice.status, { language: finalVoiceLanguage, agent_id: voice.agent_id ?? null });
    const knowledge = await runSetupStep({ ...config, elevenlabs_agent_id: voice.agent_id }, 'knowledge_base');
    setup.knowledge_base = knowledge.status;
    progress.step('knowledge_base', knowledge.status);
    const subscription = await planPromise;
    const { status, ...planDetail } = subscription;
    setup.subscription = status;
    progress.step('subscription', status, planDetail);

    return progress.finish({
      success: true,
      restaurant: {
        restaurant_id: createdId,
        restaurant_name,
        slug: restaurantSlug,
        booking_url: bookingUrl,
        record_id: createdId,
        tables_created: tablesToInsert.length,
        ai_config_saved: true,
        trial_active: status === 'ok',
        trial_end: subscription.trial_end ?? null,
        voice_agent_id: voice.agent_id ?? null,
      },
      setup,
    });
  } catch (error) {
    logger.error(' Error:', error);
    if (progress.open) return progress.fail('Could not finish setup in this connection');
    return res.status(500).json({
      error: 'Failed to complete onboarding',
      message: error.message,
      details: error.details || error.hint || 'Unknown error'
    });
  }
};
