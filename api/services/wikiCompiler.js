/**
 * Wiki Compiler Service
 *
 * Implements the Karpathy LLM Wiki pattern:
 * Raw restaurant data → LLM compiles persistent wiki articles → Manager AI reads wiki
 *
 * Knowledge compiled ONCE per day, served many times — faster + cheaper than
 * re-deriving knowledge on every query via vector search.
 *
 * Wiki slugs: overview | customers | patterns | performance | operations
 */

const crypto = require('crypto');
const { getAI, AI_MODEL_FAST } = require('../_lib/ai-client');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { getRestaurantSnapshot } = require('./restaurantSnapshot');
const { listCustomerProfiles } = require('./customerDNA');

const logger = createSecureLogger('wiki-compiler');

const WIKI_SLUGS = ['overview', 'customers', 'patterns', 'performance', 'operations'];

const WIKI_PROMPTS = {
  overview: (data) => `You are compiling a wiki article about a restaurant for its AI manager.

Restaurant name: ${data.restaurantName}
Cuisine type: ${data.cuisineType || 'not specified'}
Seating capacity: ${data.tables} tables
Recent reservation activity: ${data.reservationCount} reservations in last 30 days
Active parties right now: ${data.activeParties}
Waitlist right now: ${data.waitlistCount}

Write a concise, factual OVERVIEW article (3-5 paragraphs) covering:
1. What kind of restaurant this is and its capacity
2. Current operational pace (busy? quiet? seasonal trends visible?)
3. Key operational facts the manager AI should always know

Write in third person. Be specific with numbers. No filler phrases.`,

  customers: (data) => `You are compiling a wiki article about a restaurant's customer base for its AI manager.

Restaurant: ${data.restaurantName}
Total tracked customers: ${data.totalCustomers}
VIP customers: ${data.vipCount}
Regular customers: ${data.regularCount}

Recent top customers:
${data.topCustomers}

Write a concise CUSTOMERS article (3-5 paragraphs) covering:
1. Customer base composition (VIPs, regulars, casual)
2. Notable customers and their preferences
3. What the manager AI needs to know to give excellent service

Write in third person. Be specific. No filler.`,

  patterns: (data) => `You are compiling a wiki article about a restaurant's booking and traffic patterns for its AI manager.

Restaurant: ${data.restaurantName}
Recent reservations data:
${data.reservationPatterns}

Write a concise PATTERNS article (3-5 paragraphs) covering:
1. Peak days and hours
2. Typical party sizes
3. No-show / cancellation patterns
4. Any notable seasonal or weekly trends

Write in third person. Be specific with data. No filler.`,

  performance: (data) => `You are compiling a wiki article about a restaurant's performance metrics for its AI manager.

Restaurant: ${data.restaurantName}
Recent metrics:
${data.performanceData}

Write a concise PERFORMANCE article (3-5 paragraphs) covering:
1. Cover counts and trends
2. Revenue per cover trends (if data available)
3. No-show rate and deposit data
4. Key performance observations

Write in third person. Be specific with numbers. No filler.`,

  operations: (data) => `You are compiling a wiki article about a restaurant's operational context for its AI manager.

Restaurant: ${data.restaurantName}
Memories and operational notes:
${data.memories}

Write a concise OPERATIONS article (3-5 paragraphs) covering:
1. Key operational facts learned from conversations and notes
2. Staff, menu, or policy information that has been shared
3. Recurring operational themes or issues
4. Anything the manager AI should proactively monitor

Write in third person. Be specific. No filler.`,
};

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

async function getRestaurantConfig(restaurantId) {
  const { data } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('restaurant_name, name, restaurant_type, agent_language')
    .eq('id', restaurantId)
    .maybeSingle();
  return data || {};
}

async function getRecentReservationStats(restaurantId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from('reservations')
    .select('reservation_time, party_size, status, customer_name')
    .eq('restaurant_id', restaurantId)
    .gte('reservation_time', thirtyDaysAgo)
    .order('reservation_time', { ascending: false })
    .limit(200);
  return data || [];
}

async function getStoredMemories(restaurantId) {
  const { data } = await supabaseAdmin
    .from('manager_memory')
    .select('type, category, content, importance')
    .eq('restaurant_id', restaurantId)
    .order('importance', { ascending: false })
    .limit(30);
  return data || [];
}

async function getTableCount(restaurantId) {
  const { count } = await supabaseAdmin
    .from('tables')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);
  return count || 0;
}

async function compileArticle(slug, prompt) {
  const response = await getAI().messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content?.find((b) => b.type === 'text');
  return textBlock?.text || '';
}

async function upsertWikiPage(restaurantId, slug, title, content, sourceHash) {
  const { error } = await supabaseAdmin
    .from('restaurant_wiki_pages')
    .upsert(
      {
        restaurant_id: restaurantId,
        slug,
        title,
        content,
        source_hash: sourceHash,
        compiled_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id,slug' }
    );
  if (error) {
    logger.error('upsertWikiPage failed', { restaurantId, slug, error: error.message });
    throw error;
  }
}

async function getExistingHash(restaurantId, slug) {
  const { data } = await supabaseAdmin
    .from('restaurant_wiki_pages')
    .select('source_hash')
    .eq('restaurant_id', restaurantId)
    .eq('slug', slug)
    .maybeSingle();
  return data?.source_hash || null;
}

/**
 * Compile all wiki articles for a restaurant.
 * Uses hash-skip to avoid recompiling unchanged data.
 * Returns { compiled: number, skipped: number }.
 */
async function compileWikiForRestaurant(restaurantId) {
  const [config, snapshot, reservations, memories, tableCount, customerResult] = await Promise.all([
    getRestaurantConfig(restaurantId),
    getRestaurantSnapshot(restaurantId),
    getRecentReservationStats(restaurantId),
    getStoredMemories(restaurantId),
    getTableCount(restaurantId),
    listCustomerProfiles(restaurantId, { limit: 20 }).catch(() => ({ profiles: [] })),
  ]);

  const restaurantName = config.restaurant_name || config.name || 'this restaurant';
  const customers = customerResult?.profiles || customerResult || [];

  // Summarize reservation patterns for the prompt
  const statusCounts = reservations.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const partySizeAvg = reservations.length > 0
    ? (reservations.reduce((s, r) => s + (r.party_size || 0), 0) / reservations.length).toFixed(1)
    : 'N/A';

  const hourCounts = {};
  for (const r of reservations) {
    const h = new Date(r.reservation_time).getUTCHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  const reservationPatterns =
    `Total (30 days): ${reservations.length}\n` +
    `Status breakdown: ${JSON.stringify(statusCounts)}\n` +
    `Average party size: ${partySizeAvg}\n` +
    `Peak hour (UTC): ${peakHour || 'unknown'}`;

  const vipCount = customers.filter((c) => c.tier === 'vip').length;
  const regularCount = customers.filter((c) => c.tier === 'regular').length;
  const topCustomers = customers
    .slice(0, 8)
    .map((c) => `  ${c.customer_name || c.customer_id} (${c.tier || 'new'}, ${c.visit_count || 0} visits)`)
    .join('\n') || '  No customers tracked yet.';

  const memorySummary = memories.length > 0
    ? memories.map((m) => `[${m.type}/${m.category}] ${m.content}`).join('\n')
    : 'No operational notes stored yet.';

  const performanceData =
    `Reservations last 30 days: ${reservations.length}\n` +
    `Confirmed: ${statusCounts.confirmed || 0}\n` +
    `No-shows: ${statusCounts.no_show || 0}\n` +
    `Cancelled: ${statusCounts.cancelled || 0}\n` +
    `Active parties now: ${snapshot.active_parties?.length || 0}\n` +
    `Deposits held: ${snapshot.deposit_summary?.count || 0}`;

  const articleData = {
    overview: {
      restaurantName,
      cuisineType: config.restaurant_type,
      tables: tableCount,
      reservationCount: reservations.length,
      activeParties: snapshot.active_parties?.length || 0,
      waitlistCount: snapshot.waitlist_count || 0,
    },
    customers: {
      restaurantName,
      totalCustomers: customers.length,
      vipCount,
      regularCount,
      topCustomers,
    },
    patterns: {
      restaurantName,
      reservationPatterns,
    },
    performance: {
      restaurantName,
      performanceData,
    },
    operations: {
      restaurantName,
      memories: memorySummary,
    },
  };

  const TITLES = {
    overview: 'Restaurant Overview',
    customers: 'Customer Base',
    patterns: 'Booking Patterns',
    performance: 'Performance Metrics',
    operations: 'Operational Notes',
  };

  let compiled = 0;
  let skipped = 0;

  for (const slug of WIKI_SLUGS) {
    const inputText = JSON.stringify(articleData[slug]);
    const newHash = md5(inputText);
    const existingHash = await getExistingHash(restaurantId, slug);

    if (existingHash === newHash) {
      skipped++;
      continue;
    }

    const prompt = WIKI_PROMPTS[slug](articleData[slug]);
    const content = await compileArticle(slug, prompt);

    if (content) {
      await upsertWikiPage(restaurantId, slug, TITLES[slug], content, newHash);
      compiled++;
    }
  }

  logger.info('Wiki compiled', { restaurantId, compiled, skipped });
  return { compiled, skipped };
}

/**
 * Retrieve all wiki pages for a restaurant, sorted by slug.
 * Returns [] if none compiled yet.
 */
async function getWikiPages(restaurantId) {
  const { data, error } = await supabaseAdmin
    .from('restaurant_wiki_pages')
    .select('slug, title, content, compiled_at')
    .eq('restaurant_id', restaurantId)
    .order('slug');
  if (error) {
    logger.error('getWikiPages failed', { restaurantId, error: error.message });
    return [];
  }
  return data || [];
}

module.exports = { compileWikiForRestaurant, getWikiPages };
