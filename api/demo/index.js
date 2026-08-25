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
const { supabaseAdmin, getAllTables, getUpcomingReservations } = require('../_lib/supabase');
const { verifyAuth } = require('../_lib/auth');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureException } = require('../_lib/sentry');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { suggestTimezone } = require('../_lib/timezone');
const { buildFakeTables, buildFakeReservations } = require('../_lib/demo-seeds');
const { validateEmail } = require('../_lib/validation');
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
// Email: welcome demo
// ---------------------------------------------------------------------------
// Localizado (F3, Demo em Conversa). O stub "BISECT" em texto puro/inglês era
// resto de investigação — a causa real do drop de função no deploy era o
// require de handler irmão + enrichment inline (já resolvidos em _lib).
const WELCOME_COPY = {
  pt: {
    subject: (r) => `Seu demo do ${r} está pronto — sua recepcionista te espera`,
    title: (n) => (n ? `${n}, seu painel está no ar` : 'Seu painel está no ar'),
    body: (r) =>
      `A recepcionista IA do <strong>${r}</strong> já está de plantão. Volte quando quiser, mande outra mensagem para ela e veja a reserva cair no painel. O link abaixo é seu por 7 dias.`,
    cta: 'Abrir meu demo',
  },
  es: {
    subject: (r) => `Tu demo de ${r} está listo — tu recepcionista te espera`,
    title: (n) => (n ? `${n}, tu panel está en línea` : 'Tu panel está en línea'),
    body: (r) =>
      `La recepcionista IA de <strong>${r}</strong> ya está de guardia. Vuelve cuando quieras, mándale otro mensaje y mira la reserva caer en tu panel. El enlace de abajo es tuyo por 7 días.`,
    cta: 'Abrir mi demo',
  },
  en: {
    subject: (r) => `Your ${r} demo is ready — your receptionist is waiting`,
    title: (n) => (n ? `${n}, your dashboard is live` : 'Your dashboard is live'),
    body: (r) =>
      `<strong>${r}</strong>'s AI receptionist is already on duty. Come back anytime, send it another message, and watch the reservation land on your dashboard. The link below is yours for 7 days.`,
    cta: 'Open my demo',
  },
};

async function sendDemoWelcomeEmail({ contactName, contactEmail, restaurantName, demoUrl, language }) {
  const resend = getResendClient();
  if (!resend) {
    logger.warn('RESEND_API_KEY not set, skipping demo welcome email');
    return;
  }
  const l = String(language || '').toLowerCase();
  const copy = l.startsWith('pt') ? WELCOME_COPY.pt : l.startsWith('es') ? WELCOME_COPY.es : WELCOME_COPY.en;
  const nome = he(contactName);
  const rest = he(restaurantName);
  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: contactEmail,
      subject: copy.subject(restaurantName),
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="font-size: 28px; color: #1C1917; margin: 0;">Seatable<span style="color: #9F1239;">.</span></h1>
          </div>
          <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px;">
            <h2 style="font-size: 22px; color: #1C1917; margin: 0 0 16px 0;">${copy.title(nome)}</h2>
            <p style="color: #57534E; margin: 0 0 24px 0; line-height: 1.7;">${copy.body(rest)}</p>
            <div style="text-align: center;">
              <a href="${demoUrl}"
                 style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
                ${copy.cta}
              </a>
            </div>
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
    vibe_tags,    // Optional: manual path (F4) — owner-picked vibe chips
  } = req.body || {};

  // With scraped_data, only restaurant_name + city + contact_email are required
  // Without scraped_data, cuisine_type and contact_name are also required (legacy flow)
  const hasScrape = scraped_data && typeof scraped_data === 'object';

  // SECURITY (review finding): scraped_data is client-supplied on this public
  // endpoint. prospect_lead_id is a server-only back-reference set exclusively by
  // prospect-demo.criarPreviaDemo — it drives the /previa beacon's outbound target,
  // so strip any client-forged value; a self-created demo must never map to a lead.
  if (hasScrape && 'prospect_lead_id' in scraped_data) delete scraped_data.prospect_lead_id;

  // Email is OPTIONAL at creation since the "Demo em Conversa" funnel: the
  // aha moment (the AI booking a table in front of the owner) happens BEFORE
  // any contact ask. Contact lands later via action=attach-contact. The
  // landing page promises "Sem cadastro, sem e-mail" — the old email gate
  // here contradicted it two scrolls later.
  const required = hasScrape
    ? { restaurant_name, city }
    : { restaurant_name, cuisine_type, city };

  for (const [field, value] of Object.entries(required)) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  // Validate email format when one was provided
  const trimmedEmail = typeof contact_email === 'string' ? contact_email.trim() : '';
  if (trimmedEmail) {
    const emailValidation = validateEmail(trimmedEmail);
    if (!emailValidation.valid) {
      return res.status(400).json({ success: false, message: 'Invalid contact_email format' });
    }
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
  // Nome só quando alguém DIGITOU um nome. Derivar do local-part do e-mail
  // gerava saudações como "stefanogebara+demotest, seu painel está no ar" no
  // welcome (visto na caixa de entrada em 24/ago) e vazava o mesmo lixo para
  // o prefill do onboarding via demo_contact_name. Sem nome, os templates já
  // têm saudação neutra e o nurture tem fallback por idioma.
  const effectiveName =
    (typeof contact_name === 'string' && contact_name.trim()) || null;
  const effectivePhone = scraped_data?.phone || 'N/A';
  // SSRF defense-in-depth: even though safe-fetch in _lib/enrich-restaurant
  // re-validates via DNS+per-hop, drop obviously bad inputs at the boundary
  // so a malicious website value never reaches the fetch layer. The
  // scraped_data envelope comes from Google Places / our own scraper and
  // is untrusted by the time it lands here. We require http(s) and a
  // parseable URL — anything else gets nulled out so enrichment skips it
  // entirely. The same check is enforced server-side in safe-fetch.
  const rawWebsite = scraped_data?.website || null;
  const effectiveWebsite = (() => {
    if (!rawWebsite || typeof rawWebsite !== 'string') return null;
    try {
      const u = new URL(rawWebsite);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return rawWebsite;
    } catch {
      return null;
    }
  })();

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

  // Infer language. Prefer explicit country code, otherwise derive from the
  // scraped phone's international prefix. Google Places /v1 doesn't return a
  // country field, but 'internationalPhoneNumber' gives us '+34 914…' etc.
  // Without this, a Madrid demo was landing with agent_language='en' because
  // effectiveCountry fell back to 'Unknown' → default 'en'.
  const COUNTRY_LANGUAGE_MAP = {
    BR: 'pt', PT: 'pt', ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es',
    FR: 'fr', IT: 'it', DE: 'de', JP: 'ja', US: 'en', GB: 'en', CA: 'en', AU: 'en',
  };
  function countryFromPhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    const digits = phone.replace(/[^\d+]/g, '');
    if (!digits.startsWith('+')) return null;
    // Order matters: longer prefixes first so '+351' doesn't match '+3'.
    const prefixes = [
      ['+351', 'PT'], ['+54', 'AR'], ['+55', 'BR'], ['+56', 'CL'], ['+57', 'CO'],
      ['+52', 'MX'], ['+51', 'PE'], ['+34', 'ES'], ['+33', 'FR'], ['+39', 'IT'],
      ['+49', 'DE'], ['+44', 'GB'], ['+81', 'JP'], ['+61', 'AU'], ['+1', 'US'],
    ];
    for (const [p, iso] of prefixes) if (digits.startsWith(p)) return iso;
    return null;
  }
  const resolvedCountry =
    (effectiveCountry && effectiveCountry !== 'Unknown' && effectiveCountry.toUpperCase()) ||
    countryFromPhone(effectivePhone) ||
    null;
  const inferredLanguage = COUNTRY_LANGUAGE_MAP[resolvedCountry] || 'en';

  // Insert demo restaurant config — uses scraped data when available
  // Fuso do RESTAURANTE, resolvido pelo país/cidade (mesmo helper do
  // onboarding). Precisa ser decidido ANTES do insert: a coluna `timezone`
  // tem default 'UTC', e um demo de São Paulo gravado como UTC faz o
  // validador de reservas (reservation-validator) e o Manager AI operarem
  // 3h adiantados — às 20h em SP uma reserva para 21:30 "hoje" parece estar
  // no passado. Os 21 demos vivos em 25/ago estavam todos em UTC porque a
  // G0.12b calculou este valor só para os seeds e nunca o persistiu.
  //
  // Cuidado com o retorno de suggestTimezone: para país desconhecido ela
  // devolve 'UTC', que é TRUTHY. O guarda `|| 'America/Sao_Paulo'` da G0.12b
  // era, portanto, código morto — e o caminho que mais cai nele é justamente
  // o "restaurante novo" (F4), que não tem ficha no Google e chega sem país.
  // Auditoria 25/ago às 20:01: Mocotó e Bráz (país BR resolvido) nasceram com
  // 4 reservas hoje; o demo manual criado no mesmo minuto mandou as três para
  // amanhã 19:30/20:00/20:30 — os fallbackTimes — e abriu vazio.
  //
  // Nenhum restaurante opera em UTC: 'UTC' aqui significa "não descobrimos
  // onde fica", não um fuso. Cair no mercado principal do funil é
  // estritamente melhor que cair 3h à frente do dono.
  const fusoSugerido = suggestTimezone(resolvedCountry || effectiveCountry, city);
  const fusoDoDemo = (!fusoSugerido || fusoSugerido === 'UTC') ? 'America/Sao_Paulo' : fusoSugerido;

  const insertPayload = {
    user_id: demoUserId,
    timezone: fusoDoDemo,
    restaurant_name: restaurant_name.trim(),
    restaurant_type: normalizeRestaurantType(effectiveCuisine.trim()),
    city: city.trim(),
    country: resolvedCountry || effectiveCountry || 'Unknown',
    agent_language: inferredLanguage,
    // restaurant_config.email is NOT NULL + regex CHECK (valid_email). When
    // the owner hasn't shared contact yet, a routable-looking placeholder on
    // our own domain satisfies the constraint; demo_contact_email stays null
    // so nurture/welcome emails know there is nobody to write to.
    email: trimmedEmail || `${slug}@demo.seatable.one`,
    phone: effectivePhone,
    slug,
    business_hours,
    reservation_settings,
    is_active: true,
    onboarding_completed: true,
    is_demo: true,
    demo_token,
    demo_expires_at,
    demo_contact_email: trimmedEmail || null,
    demo_contact_name: effectiveName,
  };

  // Add optional fields from scrape (only columns that exist in restaurant_config)
  // NOTE: address, google_rating, google_review_count, google_maps_url do NOT exist
  // on restaurant_config — they live on restaurant_info. Only set website here.
  if (effectiveWebsite) insertPayload.website = effectiveWebsite;

  // Persist the full scrape payload so it survives demo dashboard refreshes and
  // flows into onboarding pre-fill. Without this the wow card vanishes on F5
  // and the user has to re-type their address during conversion.
  // Enrich scraped_data + auto-seed personality via helper (lives in
  // _lib/demo-enrichment.js — keeping it out of this handler is what
  // unblocks Vercel's per-function NFT from silently dropping demo).
  if (hasScrape) {
    const { buildDemoEnrichmentPayload } = require('../_lib/demo-enrichment');
    const enrichedPayload = await buildDemoEnrichmentPayload({
      scrapedData: scraped_data,
      restaurantName: restaurant_name.trim(),
      website: effectiveWebsite,
      cuisineType: effectiveCuisine,
      warn: (msg, meta) => logger.warn(msg, meta),
    });
    insertPayload.scraped_data = enrichedPayload.scraped_data;
    if (enrichedPayload.ai_personality) {
      insertPayload.ai_personality = enrichedPayload.ai_personality;
    }
  } else {
    // Demo manual — "restaurante novo" (F4). Sem Google, o dado real é o que
    // o dono acabou de configurar: cozinha, horários e vibe. Vai para
    // scraped_data com manual:true para (a) a recepcionista do demo-chat
    // responder com ISSO em vez de generalidades e (b) o painel saber que não
    // existe espelho do Google para mostrar. Tags são allowlist-por-forma:
    // minúsculas, letras/hífen/espaço, no máximo 6 — o derive só pontua as
    // conhecidas, o resto é inerte no prompt.
    const sanitizedVibes = (Array.isArray(vibe_tags) ? vibe_tags : [])
      .filter((v) => typeof v === 'string' && /^[a-z][a-z\s-]{0,29}$/.test(v.trim().toLowerCase()))
      .map((v) => v.trim().toLowerCase())
      .slice(0, 6);
    insertPayload.scraped_data = {
      manual: true,
      cuisine_type: effectiveCuisine,
      vibe_tags: sanitizedVibes,
      business_hours,
    };
    if (sanitizedVibes.length) {
      const { deriveBestPresetFromVibes, PERSONA_PRESETS } = require('../_lib/vibe-to-persona-preset');
      const preset = deriveBestPresetFromVibes(sanitizedVibes);
      if (preset) {
        insertPayload.ai_personality = { ...PERSONA_PRESETS[preset], _derived_from_preset: preset };
      }
    }
  }

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
    // Mesmo fuso que foi gravado no registro — uma fonte só. Sem isto os
    // seeds nascem em UTC e o painel de um restaurante brasileiro criado às
    // 19h abre vazio.
    const fakeReservations = buildFakeReservations(restaurantId, fusoDoDemo);
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

  // Email needs an absolute URL; the frontend redirect guard requires a
  // relative same-origin path (fb840e4d). Send the absolute URL only to the
  // mailer and return the relative path to the browser.
  const demoPath = `/demo/${demo_token}`;
  const demoUrlAbsolute = `${BASE_URL}${demoPath}`;

  // Welcome email AGUARDADO com teto de 5s — fire-and-forget é inseguro na
  // Vercel (a lambda congela após a resposta; o envio pendente só completa
  // se o MESMO container descongelar depois). Sintoma real na caixa de
  // entrada em 24/ago: welcome do Bráz chegou 30 min atrasado (container
  // reaquecido) e o do Zeca nunca chegou. Mesma lição do enrichment
  // (_lib/demo-enrichment.js). A função captura os próprios erros.
  if (trimmedEmail) {
    await Promise.race([
      sendDemoWelcomeEmail({
        contactName: effectiveName,
        contactEmail: trimmedEmail,
        restaurantName: restaurant_name.trim(),
        demoUrl: demoUrlAbsolute,
        language: inferredLanguage,
      }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }

  // Enrichment already happened inline above before the insert — no second
  // pass needed here.

  logger.info(`Demo created: ${restaurantId} for ${trimmedEmail || '(sem contato — captura tardia)'}`);

  return res.status(201).json({
    success: true,
    demo_token,
    demo_url: demoPath,
  });
}
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
    .select('id, restaurant_name, restaurant_type, city, country, timezone, phone, email, slug, business_hours, reservation_settings, is_active, is_demo, demo_token, demo_expires_at, demo_contact_email, demo_contact_name, onboarding_completed, scraped_data')
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
// Action: attach-contact
// ---------------------------------------------------------------------------
// Late contact capture for the "Demo em Conversa" funnel: demos are created
// WITHOUT an email, and the ask happens after the aha moment (the AI booking
// a reservation in front of the owner). Public endpoint — authorization is
// possession of a live demo_token, same trust model as action=session.
async function handleAttachContact(req, res) {
  const { demo_token, contact_email, contact_name } = req.body || {};

  if (!demo_token || typeof demo_token !== 'string') {
    return res.status(400).json({ error: 'Missing required field: demo_token' });
  }
  if (!contact_email || typeof contact_email !== 'string' || !contact_email.trim()) {
    return res.status(400).json({ error: 'Missing required field: contact_email' });
  }
  const trimmedEmail = contact_email.trim();
  const emailValidation = validateEmail(trimmedEmail);
  if (!emailValidation.valid) {
    return res.status(400).json({ success: false, message: 'Invalid contact_email format' });
  }

  const now = new Date().toISOString();
  const { data: demo, error: lookupError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, demo_token, demo_contact_email, agent_language')
    .eq('demo_token', demo_token)
    .eq('is_demo', true)
    .gt('demo_expires_at', now)
    .single();

  if (lookupError || !demo) {
    return res.status(404).json({ error: 'Demo not found or expired' });
  }

  // Mesma regra do handleCreate: nome só quando digitado — nunca derivado do
  // local-part do e-mail (a captura pós-aha manda só o endereço).
  const effectiveName =
    (typeof contact_name === 'string' && contact_name.trim()) || null;

  const { error: updateError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({
      demo_contact_email: trimmedEmail,
      demo_contact_name: effectiveName,
      email: trimmedEmail,
    })
    .eq('id', demo.id);

  if (updateError) {
    logger.error('Failed to attach contact to demo:', updateError.message);
    return res.status(500).json({ error: 'Failed to save contact' });
  }

  // Welcome email fires now (not at create) — skip the resend when the same
  // address is submitted twice (double-click, back-and-forth in the UI).
  // AGUARDADO com teto de 5s: fire-and-forget morre com o freeze da lambda
  // (foi assim que o welcome do Zeca sumiu em 24/ago).
  if (demo.demo_contact_email !== trimmedEmail) {
    await Promise.race([
      sendDemoWelcomeEmail({
        contactName: effectiveName,
        contactEmail: trimmedEmail,
        restaurantName: demo.restaurant_name,
        demoUrl: `${BASE_URL}/demo/${demo_token}`,
        language: demo.agent_language,
      }),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }

  logger.info(`Contact attached to demo ${demo.id}`);
  return res.status(200).json({ success: true });
}

// ---------------------------------------------------------------------------
// Action: convert
// ---------------------------------------------------------------------------
async function handleConvert(req, res) {
  // F6 (Demo em Conversa): converter = APOSENTAR o demo, nada mais.
  //
  // A versão anterior fazia três coisas erradas para o funil atual:
  //  1. Copiava config do demo por cima do restaurante real — CLOBBERAVA as
  //     edições que o dono acabou de fazer no onboarding (o prefill já levou
  //     os dados do demo para o formulário; as edições dele devem vencer).
  //  2. Migrava as mesas e reservas SEED do demo (Ana Costa, Pedro Santos…)
  //     para o restaurante real — clientes fictícios num painel de produção.
  //  3. Zerava is_demo/demo_token, tirando a linha do alcance do cleanup
  //     cron e matando o link do demo antes da janela acabar.
  //
  // Agora: valida a posse (auth + token vivo) e carimba demo_converted_at.
  // O nurture para de escrever (missão cumprida), o link do demo continua
  // funcionando até expirar, e o cleanup cron apaga a linha no vencimento.
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'Missing required field: token' });
  }

  const { data: demoConfig, error: demoError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, demo_converted_at')
    .eq('demo_token', token)
    .eq('is_demo', true)
    .single();

  if (demoError || !demoConfig) {
    return res.status(404).json({ error: 'Demo not found' });
  }

  // Idempotente: o Welcome re-tenta em cada load enquanto o localStorage
  // guardar o token — a segunda chamada não deve reescrever o carimbo.
  if (!demoConfig.demo_converted_at) {
    const { error: markError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ demo_converted_at: new Date().toISOString() })
      .eq('id', demoConfig.id);

    if (markError) {
      logger.error('Failed to mark demo as converted:', markError.message);
      return res.status(500).json({ error: 'Failed to mark demo as converted' });
    }
  }

  logger.info(`Demo ${demoConfig.id} converted (retired) by user ${auth.user?.id || 'unknown'}`);
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

    if (req.method === 'POST' && action === 'attach-contact') {
      const limited = await checkAndApplyRateLimit(req, res, 'demo-create');
      if (limited) return;
      return await handleAttachContact(req, res);
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
