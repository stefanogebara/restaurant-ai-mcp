/**
 * Restaurant Outreach Pipeline
 *
 * Scrapes Google Maps data, analyzes reviews for pain points,
 * creates personalized demos, and generates outreach messages.
 *
 * Usage:
 *   node scripts/outreach-pipeline.js                              # dry-run (scrape + analyze only)
 *   node scripts/outreach-pipeline.js --create-demos               # full pipeline
 *   node scripts/outreach-pipeline.js --create-demos --target "Chou"  # single restaurant
 *   node scripts/outreach-pipeline.js --list                       # list all available targets
 *
 * Output: logs/outreach-pipeline-YYYY-MM-DD.json
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env — .env.local has Supabase + Google Places keys
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

// ─── CLI Args ────────────────────────────────────────────────────────────────

const CREATE_DEMOS = process.argv.includes('--create-demos');
const LIST_MODE = process.argv.includes('--list');
const TARGET_FILTER = (() => {
  const idx = process.argv.indexOf('--target');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'https://seatable.one';
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SCRIPTS_DIR = __dirname;
const LOGS_DIR = path.join(__dirname, '..', 'logs');

// ─── Supabase Admin Client ──────────────────────────────────────────────────

let supabaseAdmin = null;
function getSupabase() {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

// ─── Google Places Field Mask ───────────────────────────────────────────────

const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.regularOpeningHours',
  'places.websiteUri',
  'places.types',
  'places.reviews',
  'places.editorialSummary',
  'places.googleMapsUri',
  'places.photos',
  'places.primaryType',
  'places.primaryTypeDisplayName',
].join(',');

// ─── Reused from api/scrape-restaurant.js ───────────────────────────────────

function parseBusinessHours(openingHours) {
  if (!openingHours?.periods) return null;
  const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const hours = {};
  dayMap.forEach(d => { hours[d] = { open_time: null, close_time: null, is_open: false }; });
  for (const period of openingHours.periods) {
    const openDay = period.open?.day;
    if (openDay == null) continue;
    const dayName = dayMap[openDay];
    if (!dayName) continue;
    const openHour = String(period.open?.hour ?? 0).padStart(2, '0');
    const openMin = String(period.open?.minute ?? 0).padStart(2, '0');
    const closeHour = String(period.close?.hour ?? 23).padStart(2, '0');
    const closeMin = String(period.close?.minute ?? 0).padStart(2, '0');
    hours[dayName] = {
      open_time: `${openHour}:${openMin}`,
      close_time: `${closeHour}:${closeMin}`,
      is_open: true,
    };
  }
  return hours;
}

function inferCuisineType(types, primaryType) {
  const all = [...(types || []), primaryType].filter(Boolean).map(t => t.toLowerCase());
  const cuisineMap = {
    italian_restaurant: 'Italian', japanese_restaurant: 'Japanese',
    sushi_restaurant: 'Japanese', ramen_restaurant: 'Japanese',
    mexican_restaurant: 'Mexican', steak_house: 'Steakhouse',
    chinese_restaurant: 'Chinese', indian_restaurant: 'Indian',
    thai_restaurant: 'Thai', french_restaurant: 'French',
    spanish_restaurant: 'Spanish', brazilian_restaurant: 'Brazilian',
    korean_restaurant: 'Korean', vietnamese_restaurant: 'Vietnamese',
    greek_restaurant: 'Greek', mediterranean_restaurant: 'Mediterranean',
    seafood_restaurant: 'Seafood', pizza_restaurant: 'Italian',
    hamburger_restaurant: 'American', american_restaurant: 'American',
    barbecue_restaurant: 'BBQ', cafe: 'Cafe', coffee_shop: 'Cafe',
    bar: 'Bar', fine_dining_restaurant: 'Fine Dining',
  };
  for (const t of all) { if (cuisineMap[t]) return cuisineMap[t]; }
  const typeStr = all.join(' ');
  if (typeStr.includes('italian')) return 'Italian';
  if (typeStr.includes('japanese') || typeStr.includes('sushi')) return 'Japanese';
  if (typeStr.includes('mexican')) return 'Mexican';
  if (typeStr.includes('steak')) return 'Steakhouse';
  if (typeStr.includes('seafood')) return 'Seafood';
  if (typeStr.includes('cafe') || typeStr.includes('coffee')) return 'Cafe';
  return 'Restaurant';
}

// Reused from api/demo.js
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

// ─── Phase 1: Enhanced Scraping ─────────────────────────────────────────────

async function fetchPlaces(searchQuery, languageCode) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': PLACES_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: searchQuery,
      maxResultCount: 1,
      languageCode,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Google Places API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return (data.places || [])[0] || null;
}

function extractReviews(place) {
  return (place.reviews || []).map(review => ({
    text: review.text?.text || '',
    rating: review.rating,
    author: review.authorAttribution?.displayName || 'Anonymous',
    time: review.relativePublishTimeDescription || '',
    language: review.text?.languageCode || 'unknown',
  }));
}

async function scrapeRestaurant(query, city, country = 'Brazil') {
  const searchQuery = `${query.trim()} restaurant ${city.trim()} ${(country || '').trim()}`.trim();
  console.log(`  Scraping: "${searchQuery}"`);

  // Fetch in PT first (primary market), then EN for more reviews
  const ptPlace = await fetchPlaces(searchQuery, 'pt');
  if (!ptPlace) {
    throw new Error(`No results found for "${searchQuery}"`);
  }

  const ptReviews = extractReviews(ptPlace);

  // Second fetch in EN to get potentially different reviews
  let enReviews = [];
  try {
    const enPlace = await fetchPlaces(searchQuery, 'en');
    if (enPlace) {
      enReviews = extractReviews(enPlace);
    }
  } catch {
    // Non-fatal — PT reviews are sufficient
  }

  // Deduplicate reviews by author name
  const seenAuthors = new Set();
  const allReviews = [];
  for (const review of [...ptReviews, ...enReviews]) {
    const key = review.author.toLowerCase();
    if (!seenAuthors.has(key) && review.text) {
      seenAuthors.add(key);
      allReviews.push(review);
    }
  }

  const businessHours = parseBusinessHours(ptPlace.regularOpeningHours);
  const cuisineType = inferCuisineType(ptPlace.types, ptPlace.primaryType);

  return {
    name: ptPlace.displayName?.text || query.trim(),
    address: ptPlace.formattedAddress || null,
    phone: ptPlace.internationalPhoneNumber || ptPlace.nationalPhoneNumber || null,
    rating: ptPlace.rating || null,
    review_count: ptPlace.userRatingCount || 0,
    price_level: ptPlace.priceLevel || null,
    cuisine_type: cuisineType,
    website: ptPlace.websiteUri || null,
    google_maps_url: ptPlace.googleMapsUri || null,
    editorial_summary: ptPlace.editorialSummary?.text || null,
    business_hours: businessHours,
    hours_text: ptPlace.regularOpeningHours?.weekdayDescriptions || null,
    reviews: allReviews,
    types: ptPlace.types || [],
    place_id: ptPlace.id || null,
  };
}

// ─── Phase 2: Review Pain Point Analysis ────────────────────────────────────

const PAIN_KEYWORDS = {
  reserva: {
    keywords: ['reserva', 'não consegui reservar', 'sem reserva', 'reservation', 'booking',
               'couldn\'t book', 'no reservation', 'lotado', 'cheio'],
    label: 'Problemas com reserva',
  },
  telefone: {
    keywords: ['telefone', 'ligar', 'não atende', 'ocupado', 'chamada', 'contato',
               'não retornam', 'sem resposta', 'phone', 'whatsapp'],
    label: 'Dificuldade de contato',
  },
  espera: {
    keywords: ['espera', 'fila', 'demorou', 'aguardar', 'waited', 'long wait',
               '30 minutos', '1 hora', 'atraso', 'demora'],
    label: 'Tempo de espera',
  },
  atendimento: {
    keywords: ['garçom', 'atendimento ruim', 'péssimo atendimento', 'desatenção',
               'mal atendido', 'service was', 'slow service', 'waiter'],
    label: 'Qualidade do atendimento',
  },
  noshow: {
    keywords: ['no-show', 'cancelou', 'cancelamento', 'não apareceu', 'cancellation',
               'deposit', 'depósito', 'cobrança'],
    label: 'No-show / cancelamento',
  },
};

function analyzeReviews(reviews) {
  const painPoints = [];

  for (const [category, config] of Object.entries(PAIN_KEYWORDS)) {
    const matches = [];

    for (const review of reviews) {
      // Only match pain points in negative/neutral reviews (rating <= 3)
      if (review.rating && review.rating >= 4) continue;

      const text = review.text.toLowerCase();
      const matchedKeyword = config.keywords.find(kw => text.includes(kw));

      if (matchedKeyword) {
        // Extract sentence containing the keyword
        const sentences = review.text.split(/[.!?]+/).filter(s => s.trim());
        const relevantSentence = sentences.find(s =>
          s.toLowerCase().includes(matchedKeyword)
        ) || review.text.slice(0, 120);

        matches.push({
          quote: `"${relevantSentence.trim()}" — ${review.author}, ${review.time}`,
          rating: review.rating,
        });
      }
    }

    if (matches.length >= 1) {
      painPoints.push({
        category,
        label: config.label,
        match_count: matches.length,
        quotes: matches.slice(0, 2).map(m => m.quote),
      });
    }
  }

  // Sort by match count descending
  painPoints.sort((a, b) => b.match_count - a.match_count);

  const negativeReviews = reviews.filter(r => r.rating && r.rating <= 3).length;
  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : null;

  return {
    total_reviews_analyzed: reviews.length,
    negative_reviews: negativeReviews,
    avg_rating: avgRating ? parseFloat(avgRating.toFixed(1)) : null,
    pain_points: painPoints,
    has_actionable_points: painPoints.some(p => p.match_count >= 2),
    top_pain: painPoints[0] || null,
  };
}

// ─── Phase 3: Demo Provisioning ─────────────────────────────────────────────

const BR_FAKE_NAMES = [
  'Ana Costa', 'Pedro Santos', 'Julia Oliveira', 'Rafael Lima',
  'Mariana Silva', 'Lucas Ferreira', 'Camila Souza', 'Gabriel Almeida',
];
const BR_FAKE_TIMES = ['12:00', '12:30', '13:00', '19:00', '19:30', '20:00', '20:30', '21:00'];

function generateReservationId() {
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const randomPart = crypto.randomBytes(9).toString('base64url').substring(0, 12);
  return `RES-${dateStr}-${randomPart}`;
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function buildFakeTables(restaurantId) {
  return [
    { restaurant_id: restaurantId, table_number: 1, capacity: 2, location: 'window', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 2, capacity: 2, location: 'window', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 3, capacity: 4, location: 'indoor', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 4, capacity: 4, location: 'indoor', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 5, capacity: 4, location: 'indoor', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 6, capacity: 6, location: 'indoor', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 7, capacity: 6, location: 'terrace', status: 'available', is_active: true },
    { restaurant_id: restaurantId, table_number: 8, capacity: 8, location: 'terrace', status: 'available', is_active: true },
  ];
}

function buildFakeReservations(restaurantId) {
  const reservations = [];
  const now = new Date();

  for (let i = 0; i < 8; i++) {
    const daysOffset = (i % 7) + 1;
    const resDate = new Date(now);
    resDate.setDate(resDate.getDate() + daysOffset);
    const dateStr = resDate.toISOString().split('T')[0];

    reservations.push({
      reservation_id: generateReservationId(),
      restaurant_id: restaurantId,
      customer_name: BR_FAKE_NAMES[i],
      customer_phone: null,
      customer_email: null,
      party_size: 2 + (i % 5),
      date: dateStr,
      time: BR_FAKE_TIMES[i % BR_FAKE_TIMES.length],
      status: 'confirmed',
      special_requests: null,
    });
  }

  // One checked-in reservation for today (realistic dinner time)
  reservations.push({
    reservation_id: generateReservationId(),
    restaurant_id: restaurantId,
    customer_name: 'Isabela Martins',
    customer_phone: null,
    customer_email: null,
    party_size: 3,
    date: now.toISOString().split('T')[0],
    time: '20:00',
    status: 'confirmed',
    checked_in_at: now.toISOString(),
    special_requests: null,
  });

  return reservations;
}

async function createOutreachDemo(scrapedData) {
  const sb = getSupabase();
  const demoToken = crypto.randomUUID();
  const demoExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const slug = `demo-${slugify(scrapedData.name)}`;
  const demoUserId = crypto.randomUUID();

  // Build business hours from scraped data or defaults
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  let business_hours = {};
  if (scrapedData.business_hours && typeof scrapedData.business_hours === 'object') {
    days.forEach(d => {
      const scraped = scrapedData.business_hours[d];
      if (scraped && scraped.is_open && scraped.open_time && scraped.close_time) {
        business_hours[d] = { open_time: scraped.open_time, close_time: scraped.close_time, is_open: true };
      } else if (scraped && scraped.is_open === false) {
        business_hours[d] = { open_time: null, close_time: null, is_open: false };
      } else {
        business_hours[d] = { open_time: '12:00', close_time: '23:00', is_open: true };
      }
    });
  } else {
    days.forEach(d => {
      business_hours[d] = { open_time: '12:00', close_time: '23:00', is_open: true };
    });
  }

  const reservation_settings = {
    max_party_size: 8,
    min_party_size: 1,
    advance_booking_days: 30,
    allow_waitlist: true,
    buffer_time_minutes: 15,
    require_credit_card: false,
    cancellation_policy: 'Cancelamento gratuito até 2 horas antes da reserva',
    special_notes: '',
  };

  const insertPayload = {
    user_id: demoUserId,
    restaurant_name: scrapedData.name,
    restaurant_type: normalizeRestaurantType(scrapedData.cuisine_type),
    city: 'São Paulo',
    country: 'Brazil',
    email: 'stefano@seatable.one',
    phone: scrapedData.phone || 'N/A',
    slug,
    business_hours,
    reservation_settings,
    is_active: true,
    onboarding_completed: true,
    is_demo: true,
    demo_token: demoToken,
    demo_expires_at: demoExpiresAt,
    demo_contact_email: 'stefano@seatable.one',
    demo_contact_name: 'Stefano',
  };

  if (scrapedData.website) insertPayload.website = scrapedData.website;

  // Check for slug collision
  const { data: existing } = await sb
    .schema('restaurant')
    .from('restaurant_config')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (existing) {
    // Add random suffix
    const suffix = crypto.randomBytes(2).toString('hex');
    insertPayload.slug = `${slug}-${suffix}`;
  }

  const { data: demoConfig, error: insertError } = await sb
    .schema('restaurant')
    .from('restaurant_config')
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create demo: ${insertError.message}`);
  }

  const restaurantId = demoConfig.id;
  const finalSlug = demoConfig.slug;

  // Seed tables (non-fatal)
  try {
    await sb.from('tables').insert(buildFakeTables(restaurantId));
  } catch (err) {
    console.warn(`  Warning: failed to seed tables: ${err.message}`);
  }

  // Seed reservations (non-fatal)
  try {
    await sb.from('reservations').insert(buildFakeReservations(restaurantId));
  } catch (err) {
    console.warn(`  Warning: failed to seed reservations: ${err.message}`);
  }

  return {
    restaurant_id: restaurantId,
    demo_token: demoToken,
    demo_url: `${BASE_URL}/demo?token=${demoToken}`,
    booking_url: `${BASE_URL}/book/${finalSlug}`,
    slug: finalSlug,
  };
}

// ─── Phase 4: Message Generation ────────────────────────────────────────────

function generateWhatsAppMessage(target, scraped, analysis, demo) {
  const contactName = target.ownerName || target.name;
  const painSummary = analysis.top_pain
    ? `Notei que alguns clientes mencionam ${analysis.top_pain.label.toLowerCase()}. `
    : '';

  const solveStatement = analysis.top_pain?.category === 'telefone'
    ? 'atende WhatsApp e ligações 24h, faz reservas automaticamente e manda lembrete pro cliente'
    : analysis.top_pain?.category === 'espera'
      ? 'elimina tempo de espera com reservas automatizadas via WhatsApp e telefone 24h'
      : analysis.top_pain?.category === 'reserva'
        ? 'automatiza 100% das reservas via WhatsApp e ligação — 24h, sem perder nenhuma'
        : 'atende WhatsApp e ligações 24h, faz reservas automaticamente e reduz no-show';

  const ratingLine = scraped.rating
    ? `Vi que o ${scraped.name} tem ${scraped.rating}⭐ no Google com ${scraped.review_count} avaliações — incrível!\n\n`
    : '';

  return `Oi${target.ownerName ? ' ' + target.ownerName.split(' ')[0] : ''}! Tudo bem?

${ratingLine}${painSummary}Criei um sistema de reservas com IA que ${solveStatement}. Já configurei com os dados do ${scraped.name} — horários, mesas, tudo pronto:

${demo ? `👉 ${demo.demo_url}` : '👉 [demo será criada com --create-demos]'}

É gratuito pra testar. Posso te mostrar em 5 min?

Stefano — Seatable`;
}

function generateEmailHTML(target, scraped, analysis, demo) {
  const contactName = target.ownerName || 'Gestor';
  const painBlock = analysis.top_pain ? `
            <p style="color: #57534E; margin: 0 0 16px 0;">
              Vi nos comentários do Google que alguns clientes mencionam
              <strong>${analysis.top_pain.label.toLowerCase()}</strong>.
              O Seatable resolve isso automaticamente:
            </p>` : '';

  const quoteBlock = analysis.top_pain?.quotes?.[0] ? `
            <div style="background: #FEF2F2; border-left: 3px solid #9F1239; padding: 12px 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
              <p style="color: #7F1D1D; margin: 0; font-style: italic; font-size: 14px;">
                ${he(analysis.top_pain.quotes[0])}
              </p>
            </div>` : '';

  const demoUrl = demo ? demo.demo_url : '#';

  return `
<div style="font-family: Georgia, serif; max-width: 560px; color: #2d2d2d; line-height: 1.7; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <h1 style="font-size: 28px; color: #1C1917; margin: 0;">
      Seatable<span style="color: #9F1239;">.</span>
    </h1>
  </div>

  <div style="background: #FAFAF9; border: 1px solid #E7E5E4; border-radius: 16px; padding: 32px; margin-bottom: 24px;">
    <h2 style="font-size: 20px; color: #1C1917; margin: 0 0 16px 0;">
      Olá ${he(contactName)},
    </h2>

    <p style="color: #57534E; margin: 0 0 16px 0;">
      Meu nome é Stefano e criei o <strong>Seatable</strong> — uma plataforma de gestão de reservas com inteligência artificial para restaurantes.
    </p>
    ${painBlock}
    ${quoteBlock}

    <ul style="color: #57534E; margin: 16px 0; padding-left: 20px; line-height: 2;">
      <li><strong>Agente de WhatsApp</strong> que atende clientes 24h e faz reservas</li>
      <li><strong>Agente de voz</strong> que atende ligações no número do restaurante</li>
      <li><strong>Dashboard em tempo real</strong> com ocupação e faturamento previsto</li>
      <li><strong>Redução de no-show</strong> com lembretes automáticos</li>
    </ul>

    <p style="color: #57534E; margin: 0 0 24px 0;">
      Já configurei uma demo personalizada com os dados do <strong>${he(scraped.name)}</strong> — horários, mesas, tudo pronto.
      Estou em fase piloto e ofereço <strong>gratuitamente</strong> para os primeiros restaurantes.
    </p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${demoUrl}"
         style="display:inline-block;padding:14px 28px;background:#9F1239;color:white;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
        Ver Demo do ${he(scraped.name)}
      </a>
    </div>
  </div>

  <div style="text-align: center; margin-top: 24px;">
    <p style="color: #A8A29E; font-size: 12px; margin: 0;">
      Stefano Gebara — <a href="https://seatable.one" style="color:#9F1239;">seatable.one</a>
    </p>
  </div>
</div>`;
}

function he(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function generateEmailSubject(scraped, analysis) {
  if (analysis.top_pain?.category === 'telefone') {
    return `${scraped.name} — nunca mais perder uma ligação de reserva`;
  }
  if (analysis.top_pain?.category === 'reserva') {
    return `${scraped.name} — reservas automatizadas com IA`;
  }
  if (analysis.top_pain?.category === 'espera') {
    return `${scraped.name} — zero fila de espera com IA`;
  }
  return `${scraped.name} — reservas inteligentes com IA`;
}

// ─── Input Loading ──────────────────────────────────────────────────────────

function loadTargets() {
  const files = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.startsWith('restaurants-sp') && f.endsWith('.json'))
    .sort();

  const all = [];
  for (const file of files) {
    const list = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8'));
    all.push(...list.map(r => ({ ...r, _sourceFile: file })));
  }
  return all;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

async function main() {
  // Validate env
  if (!GOOGLE_PLACES_API_KEY) {
    console.error('ERROR: GOOGLE_PLACES_API_KEY not found in .env.local');
    process.exit(1);
  }
  if (CREATE_DEMOS && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for --create-demos');
    process.exit(1);
  }

  const allTargets = loadTargets();
  console.log(`Loaded ${allTargets.length} restaurants from JSON files\n`);

  if (LIST_MODE) {
    allTargets.forEach((t, i) => console.log(`  ${i}: ${t.name} (${t.neighborhood || t.cuisine || ''})`));
    return;
  }

  // Filter targets
  let targets = allTargets;
  if (TARGET_FILTER) {
    targets = allTargets.filter(t =>
      t.name.toLowerCase().includes(TARGET_FILTER.toLowerCase())
    );
    if (targets.length === 0) {
      console.error(`No restaurants matching "${TARGET_FILTER}"`);
      process.exit(1);
    }
  }

  console.log(`Processing ${targets.length} restaurant(s)${CREATE_DEMOS ? ' (CREATING DEMOS)' : ' (DRY RUN)'}...\n`);

  const results = [];

  for (const target of targets) {
    console.log(`\n━━━ ${target.name} ━━━`);
    const result = { name: target.name, status: 'pending', target };

    // Phase 1: Scrape
    try {
      const query = target.google_maps_query || `${target.name} ${target.neighborhood || ''} São Paulo`;
      result.scraped = await scrapeRestaurant(query, 'São Paulo', 'Brazil');
      console.log(`  ✓ Scraped: ${result.scraped.rating}⭐ (${result.scraped.review_count} reviews), ${result.scraped.cuisine_type}`);
      console.log(`    Phone: ${result.scraped.phone || 'N/A'} | Website: ${result.scraped.website || 'N/A'}`);
      console.log(`    Reviews fetched: ${result.scraped.reviews.length}`);
    } catch (err) {
      console.error(`  ✗ Scrape failed: ${err.message}`);
      result.status = 'scrape_failed';
      result.error = err.message;
      results.push(result);
      continue;
    }

    // Phase 2: Analyze reviews
    result.analysis = analyzeReviews(result.scraped.reviews);
    if (result.analysis.pain_points.length > 0) {
      console.log(`  ✓ Pain points found:`);
      for (const pp of result.analysis.pain_points) {
        console.log(`    - ${pp.label}: ${pp.match_count} mentions`);
      }
    } else {
      console.log(`  ○ No specific pain points found in reviews`);
    }

    // Phase 3: Create demo
    if (CREATE_DEMOS) {
      try {
        result.demo = await createOutreachDemo(result.scraped);
        console.log(`  ✓ Demo created:`);
        console.log(`    Dashboard: ${result.demo.demo_url}`);
        console.log(`    Booking:   ${result.demo.booking_url}`);
      } catch (err) {
        console.error(`  ✗ Demo creation failed: ${err.message}`);
        result.demo = null;
      }
    }

    // Phase 4: Generate messages
    result.messages = {
      whatsapp: generateWhatsAppMessage(target, result.scraped, result.analysis, result.demo),
      email_subject: generateEmailSubject(result.scraped, result.analysis),
      email_html: generateEmailHTML(target, result.scraped, result.analysis, result.demo),
    };

    console.log(`\n  📱 WhatsApp message:`);
    console.log(`  ─────────────────────`);
    console.log(result.messages.whatsapp.split('\n').map(l => `  ${l}`).join('\n'));
    console.log(`  ─────────────────────`);

    result.status = 'success';
    results.push(result);

    // Brief delay between API calls to be polite
    if (targets.indexOf(target) < targets.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // Save results
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  const logFile = path.join(LOGS_DIR, `outreach-pipeline-${new Date().toISOString().split('T')[0]}.json`);
  const output = {
    generated_at: new Date().toISOString(),
    mode: CREATE_DEMOS ? 'full' : 'dry-run',
    targets: results.map(r => ({
      name: r.name,
      status: r.status,
      scraped: r.scraped ? {
        name: r.scraped.name,
        rating: r.scraped.rating,
        review_count: r.scraped.review_count,
        phone: r.scraped.phone,
        cuisine_type: r.scraped.cuisine_type,
        website: r.scraped.website,
        address: r.scraped.address,
        google_maps_url: r.scraped.google_maps_url,
        reviews_fetched: r.scraped.reviews?.length || 0,
      } : null,
      pain_points: r.analysis?.pain_points || [],
      demo: r.demo || null,
      messages: r.messages || null,
      error: r.error || null,
    })),
    summary: {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status !== 'success').length,
      demos_created: results.filter(r => r.demo).length,
      with_pain_points: results.filter(r => r.analysis?.has_actionable_points).length,
    },
  };
  fs.writeFileSync(logFile, JSON.stringify(output, null, 2));

  // Summary
  console.log(`\n\n═══ SUMMARY ═══`);
  console.log(`Total:        ${output.summary.total}`);
  console.log(`Success:      ${output.summary.success}`);
  console.log(`Failed:       ${output.summary.failed}`);
  console.log(`Demos:        ${output.summary.demos_created}`);
  console.log(`Pain points:  ${output.summary.with_pain_points}`);
  console.log(`\nResults saved to: ${logFile}`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
