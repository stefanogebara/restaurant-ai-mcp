/**
 * GET /api/seo/reservas?city=:citySlug&cuisine=:cuisineSlug
 *
 * Server-rendered PT-BR buyer-intent landing page:
 *   /sistema-de-reservas/:cidade/:cozinha
 *
 * Targets the restaurant OWNER searching for a reservation system — not the
 * diner. Page existence comes from the curated matrix in _lib/seo-matrix.js
 * (never 404s for a valid combo, unlike the legacy /restaurants pages that
 * required a pre-existing customer). Real data is layered in only where it
 * exists and only truthfully:
 *   - prospect_leads aggregates → local market context ("mapeamos N
 *     restaurantes em São Paulo"). Leads are PROSPECTS — the page never
 *     claims they use Seatable.
 *   - restaurant_config count → social proof, shown only when the city has
 *     real customers.
 *
 * Checks seo_page_cache first; on miss, generates copy via Claude Haiku,
 * upserts, returns HTML. Same cache + warm-cron economics as city-cuisine.
 */

const { getAI, AI_MODEL_FAST } = require('../_lib/ai-client');
const { supabaseAdmin } = require('../_lib/supabase');
const { renderPage, escapeHtml } = require('../_lib/seo-html');
const {
  softwareApplicationSchema,
  faqPageSchema,
  breadcrumbSchema,
} = require('../_lib/seo-schema');
const { findCity, findCuisine } = require('../_lib/seo-matrix');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('seo-reservas');

/**
 * Extract only <p>…</p> blocks from Claude's output and escape inner text.
 * Prevents XSS if the model produces unexpected markup.
 */
function sanitizeCopy(rawCopy) {
  const matches = [...rawCopy.matchAll(/<p>([\s\S]*?)<\/p>/gi)];
  if (matches.length === 0) {
    return `<p>${escapeHtml(rawCopy.trim())}</p>`;
  }
  return matches.map(([, inner]) => `<p>${escapeHtml(inner)}</p>`).join('\n');
}

/**
 * Count prospect_leads rows via a head request — no payload, no row cap.
 * `applyFilters` receives the select builder (filters only exist after
 * .select() in supabase-js v2). Errors → null.
 */
async function countLeads(applyFilters) {
  const query = applyFilters(
    supabaseAdmin.from('prospect_leads').select('*', { count: 'exact', head: true }),
  );
  const { count, error } = await query;
  if (error) return null;
  return count;
}

/**
 * Aggregate prospect_leads for a city into market stats. All head-count
 * queries (cheap, immune to the 1000-row cap). Returns null when the city has
 * too few mapped restaurants for the block to be meaningful.
 */
async function getMarketStats(cityName) {
  try {
    const like = `${cityName}%`;
    const [total, withSite, highRated] = await Promise.all([
      countLeads((q) => q.ilike('city', like)),
      countLeads((q) => q.ilike('city', like).not('website', 'is', null)),
      countLeads((q) => q.ilike('city', like).gte('rating', 4.5)),
    ]);
    if (!total || total < 50) return null;
    return {
      total,
      pctNoSite: Math.round(((total - (withSite || 0)) / total) * 100),
      pctHighRated: Math.round(((highRated || 0) / total) * 100),
    };
  } catch (err) {
    logger.warn('Market stats unavailable (non-critical)', { err: err.message });
    return null;
  }
}

/** Real customers in the city (non-demo). Social proof only when true. */
async function getCustomerCount(cityName) {
  try {
    const { count, error } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .or('is_demo.is.null,is_demo.eq.false')
      .ilike('city', `${cityName}%`);
    if (error) return 0;
    return count || 0;
  } catch {
    // Social proof is optional garnish — a failed count must never block the page.
    return 0;
  }
}

function buildFaqs(city, cuisine) {
  return [
    {
      q: 'Quanto custa um sistema de reservas com IA?',
      a: 'Os planos da Seatable começam em R$497/mês, sem comissão por reserva e sem taxa por couvert. O plano Profissional inclui a atendente de voz com IA e 14 dias de teste.',
    },
    {
      q: 'Preciso trocar de número ou instalar alguma coisa?',
      a: 'Não. A Seatable atende no WhatsApp que o seu restaurante já usa, atende o telefone com voz de IA e recebe reservas pelo seu site — sem trocar número e sem instalar nada no balcão.',
    },
    {
      q: `Funciona para ${cuisine.plural} em ${city.name}?`,
      a: `Sim. A IA atende 24 horas, confirma reservas, envia lembrete antes do horário e reduz no-show — o que pesa para ${cuisine.plural} em ${city.name}, onde mesa vazia em horário de pico é prejuízo direto.`,
    },
    {
      q: 'Quanto tempo leva para começar?',
      a: 'A demo é criada em cerca de 30 segundos a partir dos dados públicos do seu restaurante no Google. A configuração completa leva uns 5 minutos, sem conhecimento técnico.',
    },
  ];
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).send('Method not allowed');
  }

  const city = findCity(req.query.city);
  const cuisine = findCuisine(req.query.cuisine);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!city || !cuisine) {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(404).send(
      renderPage({
        title: 'Página não encontrada | Seatable',
        meta: 'Essa combinação de cidade e tipo de restaurante não existe na Seatable.',
        body: '<h1>Página não encontrada</h1><p>Essa combinação de cidade e tipo de restaurante não existe. <a href="/">Voltar para a Seatable</a>.</p>',
        lang: 'pt-BR',
      }),
    );
  }

  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const canonicalPath = `/sistema-de-reservas/${city.slug}/${cuisine.slug}`;
  const cacheKey = `reservas:${city.slug}:${cuisine.slug}`;

  // 1. Cache, market stats and customer proof in parallel
  const [cacheResult, marketStats, customerCount] = await Promise.all([
    supabaseAdmin.from('seo_page_cache').select('html').eq('cache_key', cacheKey).single(),
    getMarketStats(city.name),
    getCustomerCount(city.name),
  ]);

  if (cacheResult.data && !cacheResult.error) {
    logger.info('Cache hit', { cacheKey });
    return res.send(cacheResult.data.html);
  }

  // 2. Copy via Claude Haiku — dono-to-dono PT-BR, real numbers only
  const statsContext = marketStats
    ? `Números reais que você PODE citar (não invente outros): mapeamos ${marketStats.total} restaurantes em ${city.name}; ${marketStats.pctNoSite}% deles não têm site cadastrado no Google; ${marketStats.pctHighRated}% têm nota 4,5 ou mais.`
    : 'Não temos estatísticas locais para esta cidade — NÃO invente números.';

  let generatedCopy = '';
  try {
    const anthropic = getAI();
    const response = await anthropic.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 640,
      system: `Você escreve para DONOS de restaurante no Brasil, em português brasileiro direto — papo de dono, sem jargão de marketing.
Produto: Seatable, sistema de reservas com IA (atende telefone com voz de IA, WhatsApp e chat do site, 24h; confirma, lembra e reduz no-show; painel para o salão).
Saída: exatamente 3 parágrafos HTML (<p>...</p>). Sem títulos, listas, markdown ou blocos de código.
Parágrafo 1: a dor concreta de ${cuisine.plural} em ${city.name} — ligação perdida no rush, WhatsApp sem resposta, mesa vazia por no-show.
Parágrafo 2: como a Seatable resolve isso no dia a dia (voz + WhatsApp + site, 24h, confirmação e lembrete automáticos).
Parágrafo 3: por que donos em ${city.name} estão adotando — configuração em minutos, sem comissão por reserva. ${statsContext}`,
      messages: [
        {
          role: 'user',
          content: `Escreva o texto da página para ${cuisine.plural} em ${city.name}.`,
        },
      ],
    });
    const rawText = response.content?.[0]?.text;
    if (!rawText) throw new Error('Empty response from Claude');
    generatedCopy = sanitizeCopy(rawText);
  } catch (err) {
    logger.error('Claude generation failed — using fallback copy', { err: err.message });
    generatedCopy = `<p>Quem toca ${escapeHtml(cuisine.label)} em ${escapeHtml(city.name)} conhece a rotina: o telefone toca no meio do rush e ninguém consegue atender, o WhatsApp acumula mensagem sem resposta e, no fim da noite, a mesa reservada ficou vazia porque o cliente não apareceu.</p>
<p>A Seatable coloca uma atendente de IA nesses três canais — telefone com voz natural, WhatsApp e o chat do seu site — respondendo 24 horas, confirmando cada reserva e enviando lembrete antes do horário para reduzir o no-show.</p>
<p>A configuração leva minutos, não semanas, e você não paga comissão por reserva: o plano é fixo e a casa fica com o lucro de cada mesa.</p>`;
  }

  // 3. Optional truthful blocks
  const marketBlock = marketStats
    ? `
    <h2>O mercado de ${escapeHtml(city.name)} em números</h2>
    <p>Mapeamos <strong>${marketStats.total.toLocaleString('pt-BR')} restaurantes</strong> em ${escapeHtml(city.name)}. Desse total, <strong>${marketStats.pctNoSite}%</strong> não têm sequer um site cadastrado no Google — reservas dependem de telefone e WhatsApp atendidos na mão. E com <strong>${marketStats.pctHighRated}%</strong> das casas avaliadas em 4,5 estrelas ou mais, a disputa pelo cliente não perdoa ligação perdida.</p>`
    : '';

  const proofBlock = customerCount >= 3
    ? `
    <p><strong>${customerCount} restaurantes em ${escapeHtml(city.name)}</strong> já recebem reservas pela Seatable.</p>`
    : '';

  const faqs = buildFaqs(city, cuisine);
  const faqBlock = faqs
    .map(
      (f) => `
    <h3>${escapeHtml(f.q)}</h3>
    <p>${escapeHtml(f.a)}</p>`,
    )
    .join('');

  const title = `Sistema de reservas com IA para ${cuisine.plural} em ${city.name} | Seatable`;
  const metaDesc = `Atendente de IA que recebe reservas por telefone, WhatsApp e site, 24h, para ${cuisine.plural} em ${city.name}. Confirmação automática, menos no-show, sem comissão por reserva.`;

  const body = `
    <h1>Sistema de reservas com IA para ${escapeHtml(cuisine.plural)} em ${escapeHtml(city.name)}</h1>
    <p class="lead">A Seatable atende o telefone com voz de IA, responde o WhatsApp e recebe reservas pelo seu site — 24 horas por dia, com confirmação e lembrete automáticos para reduzir o no-show.</p>
    ${generatedCopy}
    ${marketBlock}
    <h2>Como funciona no dia a dia</h2>
    <ul class="restaurant-list">
      <li><a href="/live-demo">Voz com IA — atende o telefone do restaurante em português natural</a></li>
      <li><a href="/live-demo">WhatsApp — responde, reserva e confirma no número que você já usa</a></li>
      <li><a href="/live-demo">Site — botão de reserva embutido na sua página</a></li>
      <li><a href="/live-demo">Painel do salão — mesas, fila de espera e reservas em tempo real</a></li>
    </ul>
    ${proofBlock}
    <h2>Perguntas frequentes</h2>
    ${faqBlock}
    <div class="cta-block">
      <h2>Veja o seu restaurante dentro da Seatable</h2>
      <p>Criamos uma demo com os dados reais do seu restaurante em 30 segundos. Sem cartão, sem compromisso.</p>
      <a href="/demo/setup" class="cta-btn" style="display:inline-block;margin-top:1rem;">Ver demo grátis</a>
    </div>
  `;

  const html = renderPage({
    title,
    meta: metaDesc,
    body,
    canonical: canonicalPath,
    lang: 'pt-BR',
    jsonLd: [
      softwareApplicationSchema({ description: metaDesc, url: canonicalPath }),
      faqPageSchema(faqs),
      breadcrumbSchema([
        { name: 'Início', url: '/' },
        { name: `Sistema de reservas em ${city.name}` },
        { name: cuisine.label },
      ]),
    ],
  });

  // 4. Upsert into cache
  const { error: upsertError } = await supabaseAdmin
    .from('seo_page_cache')
    .upsert({ cache_key: cacheKey, html }, { onConflict: 'cache_key' });
  if (upsertError) {
    logger.warn('Cache upsert failed (non-critical)', { cacheKey, error: upsertError.message });
  }

  logger.info('Page generated and cached', { cacheKey, hasStats: !!marketStats, customerCount });
  return res.send(html);
};
