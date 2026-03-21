/**
 * Demo Conversation API — SSE Streaming
 *
 * POST /api/demo-conversation
 * Accept: text/event-stream
 *
 * Conversational AI demo that knows the restaurant from scraped data.
 * No auth required. Rate-limited.
 *
 * Body: {
 *   message: string,               // User message (or "__init__" for auto-greeting)
 *   session_id?: string,           // For conversation continuity
 *   restaurant_context?: object,   // Scraped data (sent on first message)
 *   demo_token?: string,           // Look up restaurant from demo DB
 *   lang?: string                  // default: 'pt-BR'
 * }
 *
 * SSE events:
 *   data: {"type":"start","session_id":"uuid"}
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done"}
 *   data: {"type":"error","error":"..."}
 */

const crypto = require('crypto');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { supabaseAdmin } = require('./_lib/supabase');

const logger = createSecureLogger('demo-conversation');

const AI_MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-4-20250514';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// ─── In-memory session store (30min TTL) ────────────────────────────────────

const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;

function cleanSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.created_at > SESSION_TTL) sessions.delete(id);
  }
}

// Clean every 5 min
setInterval(cleanSessions, 5 * 60 * 1000);

// ─── System prompt builder ──────────────────────────────────────────────────

function buildSystemPrompt(ctx, lang) {
  const isPT = lang === 'pt-BR';

  const reviewsBlock = (ctx.top_reviews || [])
    .map((r, i) => `  ${i + 1}. "${r.text}" — ${r.author} (${r.rating}⭐)`)
    .join('\n');

  const painBlock = (ctx.pain_points || [])
    .map(p => `  - ${p.label}: ${p.match_count || ''} menções`)
    .join('\n');

  const hoursBlock = (ctx.hours_text || []).join('\n  ');

  if (isPT) {
    return `Você é um consultor amigável e inteligente do Seatable, a plataforma de gestão de reservas com IA para restaurantes. Você está conversando com o dono ou gerente do restaurante abaixo.

## Restaurante que Você Já Conhece
Nome: ${ctx.name || 'Restaurante'}
Cidade: ${ctx.city || 'São Paulo'}
Culinária: ${ctx.cuisine_type || 'Brasileira'}
Google: ${ctx.rating || '?'} estrelas (${ctx.review_count || '?'} avaliações)
Endereço: ${ctx.address || 'N/A'}
Telefone: ${ctx.phone || 'N/A'}
Site: ${ctx.website || 'N/A'}
Resumo: ${ctx.editorial_summary || ''}
Horários:
  ${hoursBlock || 'Não disponível'}

## Avaliações de Clientes
${reviewsBlock || '  Nenhuma avaliação disponível'}

## Pontos de Dor Detectados nas Avaliações
${painBlock || '  Nenhum ponto crítico detectado'}

## Seu Papel
- Na primeira mensagem, cumprimente o dono mostrando que você JÁ CONHECE o restaurante dele. Cite dados específicos (nota, avaliações positivas, horários).
- Seja genuinamente impressionado com o restaurante. Destaque pontos fortes.
- Mencione sutilmente como o Seatable poderia ajudar com os pontos de dor detectados, sem criticar.
- Demonstre funcionalidades naturalmente: "Imagina um cliente mandando WhatsApp às 23h e recebendo resposta instantânea com os horários do ${ctx.name}..."
- Quando perguntarem sobre preço: Piloto gratuito para os primeiros restaurantes. Depois: Growth R$499/mês, Starter R$149/mês.
- Quando o dono mostrar interesse: ofereça "Posso configurar tudo pro ${ctx.name} agora — leva 30 segundos. Quer ver?"
- Se o usuário disser sim/quero/vamos/configura: responda com entusiasmo e inclua exatamente esta frase no final: "[CRIAR_DEMO]"
- NUNCA minta sobre funcionalidades.
- Respostas CURTAS: 2-4 frases no máximo. Conversacional, não formal.
- Responda sempre em português brasileiro.

## Funcionalidades Reais do Seatable
- Agente de WhatsApp 24h que faz reservas automaticamente
- Agente de voz que atende ligações no número do restaurante
- Dashboard em tempo real com ocupação, mesas e faturamento previsto
- IA do gerente que analisa dados e sugere ações operacionais
- Redução de no-show com lembretes automáticos por WhatsApp
- Página de reservas personalizada (booking page) com link compartilhável
- Previsão de receita por reserva
- Lista de espera digital`;
  }

  // English fallback
  return `You are a friendly, knowledgeable sales consultant for Seatable, an AI-powered restaurant reservation management platform. You're chatting with the owner/manager of the restaurant below.

## Restaurant You Already Know
Name: ${ctx.name || 'Restaurant'}
City: ${ctx.city || 'Unknown'}
Cuisine: ${ctx.cuisine_type || 'Restaurant'}
Google: ${ctx.rating || '?'} stars (${ctx.review_count || '?'} reviews)
Address: ${ctx.address || 'N/A'}
Phone: ${ctx.phone || 'N/A'}
Website: ${ctx.website || 'N/A'}
Summary: ${ctx.editorial_summary || ''}
Hours:
  ${hoursBlock || 'Not available'}

## Customer Reviews
${reviewsBlock || '  No reviews available'}

## Pain Points from Reviews
${painBlock || '  No critical issues detected'}

## Your Role
- On the first message, greet the owner showing you ALREADY KNOW their restaurant. Cite specific data.
- Be genuinely impressed. Highlight strengths.
- Subtly mention how Seatable could help with detected pain points.
- When asked about price: Free pilot for first restaurants. Then: Growth €99/mo, Starter €29/mo.
- When owner shows interest: offer "I can set up everything for ${ctx.name} right now — takes 30 seconds."
- If user says yes/let's do it/set it up: respond enthusiastically and include exactly "[CRIAR_DEMO]" at the end.
- NEVER lie about features.
- Keep responses SHORT: 2-4 sentences max. Conversational, not formal.

## Real Seatable Features
- 24/7 WhatsApp agent for automatic reservations
- Voice AI agent answering restaurant phone
- Real-time dashboard with occupancy and revenue forecasting
- Manager AI with operational insights
- No-show reduction via WhatsApp reminders
- Customizable booking page with shareable link`;
}

// ─── Real OpenRouter SSE streaming ──────────────────────────────────────────

async function streamCompletion(systemPrompt, messages, onToken) {
  const oaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://seatable.one',
      'X-Title': 'Seatable Demo Conversation',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 400,
      stream: true,
      messages: oaiMessages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter streaming error ${response.status}: ${errText}`);
  }

  // Node.js-compatible streaming: use async iterator on response.body
  let buffer = '';
  let fullText = '';

  for await (const chunk of response.body) {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    buffer += text;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onToken(delta);
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}

// ─── Handler ────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'chat');
  if (rateLimited) return;

  if (!OPENROUTER_KEY) {
    return res.status(503).json({ error: 'AI service unavailable' });
  }

  const { message, session_id, restaurant_context, demo_token, lang = 'pt-BR' } = req.body || {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  try {
    // Resolve or create session
    let session = session_id ? sessions.get(session_id) : null;
    const sid = session ? session_id : crypto.randomUUID();

    if (!session) {
      // Build context from restaurant_context or demo_token
      let ctx = restaurant_context || {};

      if (demo_token && !restaurant_context) {
        const { data: demoConfig } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .select('restaurant_name, restaurant_type, city, country, phone, website, business_hours')
          .eq('demo_token', demo_token)
          .eq('is_demo', true)
          .maybeSingle();

        if (demoConfig) {
          ctx = {
            name: demoConfig.restaurant_name,
            cuisine_type: demoConfig.restaurant_type,
            city: demoConfig.city,
            phone: demoConfig.phone,
            website: demoConfig.website,
            business_hours: demoConfig.business_hours,
          };
        }
      }

      session = { messages: [], context: ctx, created_at: Date.now() };
      sessions.set(sid, session);
    }

    res.write(`data: ${JSON.stringify({ type: 'start', session_id: sid })}\n\n`);

    // Build conversation for AI
    const isInit = message === '__init__';
    const userContent = isInit
      ? (lang === 'pt-BR'
        ? 'Olá! Me apresente o que você sabe sobre o meu restaurante e como o Seatable pode ajudar.'
        : 'Hi! Tell me what you know about my restaurant and how Seatable can help.')
      : message.trim();

    session.messages.push({ role: 'user', content: userContent });

    // Keep last 20 messages to avoid context overflow
    const recentMessages = session.messages.slice(-20);
    const systemPrompt = buildSystemPrompt(session.context, lang);

    // Stream response
    const fullText = await streamCompletion(systemPrompt, recentMessages, (token) => {
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
    });

    session.messages.push({ role: 'assistant', content: fullText });

    // Check for conversion intent
    if (fullText.includes('[CRIAR_DEMO]')) {
      res.write(`data: ${JSON.stringify({ type: 'action', action: 'create_demo', context: session.context })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (err) {
    logger.error('demo-conversation error', { error: err.message });
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Erro interno. Tente novamente.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Internal error' });
    }
  }
};
