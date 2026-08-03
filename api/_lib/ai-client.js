/**
 * Centralized AI Client — routes through OpenRouter for cost savings.
 *
 * Exposes an Anthropic-SDK-compatible interface (.messages.create / .messages.stream)
 * but routes calls through OpenRouter's Chat Completions API.
 *
 * Falls back to direct Anthropic SDK if only ANTHROPIC_API_KEY is available.
 */

const { createSecureLogger } = require('./secure-logger');
const { withRetry } = require('./supabase');
const logger = createSecureLogger('ai-client');

let _client = null;

/**
 * Quem pediu esta chamada — o arquivo, não o modelo.
 *
 * Modelo sozinho não responde "onde está o ralo": saber que foi opus não diz se
 * foi o agente atendendo lead, um cron ou uma bateria de eval. A pilha diz.
 *
 * Derivado, e não parâmetro, de propósito: exigir que cada chamador se
 * identifique garante que o próximo a esquecer vire 'desconhecido' — e o ponto
 * era justamente enxergar o que ninguém lembrou de instrumentar.
 */
function origemDaChamada() {
  try {
    const linhas = String(new Error().stack || '').split('\n').slice(2);
    for (const l of linhas) {
      const m = l.match(/[\\/]([\w.-]+\.js):\d+:\d+/);
      if (!m) continue;
      const arquivo = m[1];
      if (arquivo === 'ai-client.js' || arquivo.startsWith('node:')) continue;
      return arquivo;
    }
  } catch { /* telemetria nunca atrapalha */ }
  return 'desconhecido';
}

/**
 * Registra o custo REAL da chamada (cost_details do OpenRouter, não estimativa).
 * Fire-and-forget: contabilidade jamais pode derrubar a resposta do agente.
 */
function registrarGasto({ origem, model, usage }) {
  try {
    if (!usage) return;
    const { supabaseAdmin } = require('./supabase');
    if (!supabaseAdmin) return;
    const custo = Number(usage.cost ?? usage.cost_details?.upstream_inference_cost ?? 0);
    supabaseAdmin.from('ai_spend').insert({
      origem,
      model: String(model || '?'),
      prompt_tokens: Number(usage.prompt_tokens || 0),
      completion_tokens: Number(usage.completion_tokens || 0),
      custo_usd: Number.isFinite(custo) ? custo : 0,
    }).then(({ error }) => {
      if (error) logger.warn('não registrei o gasto (não afeta a resposta)', { error: error.message });
    }).catch(() => {});
  } catch { /* idem */ }
}

/**
 * Anota que o cérebro trocou de bolso. NUNCA lança e NUNCA é aguardado:
 * este registro serve ao painel, e o caminho que o chama existe justamente
 * para o agente continuar respondendo quando o crédito acaba.
 */
function registrarFallback({ de, para, motivo, model }) {
  try {
    const { supabaseAdmin } = require('./supabase');
    if (!supabaseAdmin) return;
    supabaseAdmin
      .from('ai_provider_fallbacks')
      .insert({ de, para, motivo, model: model || null })
      .then(({ error }) => {
        if (error) logger.warn('não consegui registrar o fallback (não afeta a resposta)', { error: error.message });
      })
      .catch(() => {});
  } catch { /* telemetria nunca derruba o caminho de resposta */ }
}

/** Default model */
const AI_MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-4';

/** Cheap model for extraction/classification */
const AI_MODEL_FAST = process.env.AI_MODEL_FAST || 'anthropic/claude-haiku-4.5';

/**
 * OpenRouter model slugs → Anthropic API model IDs, for the 402 failover path.
 * The direct Anthropic API rejects OpenRouter's "anthropic/..." slugs.
 */
const ANTHROPIC_MODEL_MAP = {
  'anthropic/claude-sonnet-4': 'claude-sonnet-4-20250514',
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5-20251001',
};

function toAnthropicModel(slug) {
  return ANTHROPIC_MODEL_MAP[slug] || String(slug).replace(/^anthropic\//, '');
}

let _anthropicFallback = null;
function getAnthropicFallback() {
  if (_anthropicFallback) return _anthropicFallback;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
  _anthropicFallback = new Anthropic({ apiKey: key });
  return _anthropicFallback;
}

/**
 * OpenRouter client that mimics the Anthropic SDK interface.
 * Uses OpenRouter's /chat/completions endpoint (OpenAI-compatible).
 */
class OpenRouterClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://openrouter.ai/api/v1/chat/completions';
    this.messages = {
      create: this._create.bind(this),
      stream: this._stream.bind(this),
    };
  }

  /** Convert Anthropic messages.create() params to OpenRouter chat/completions */
  async _create(params) {
    const { model, max_tokens, system, messages, tools, temperature } = params;

    // Build OpenAI-format messages
    const oaiMessages = [];
    if (system) oaiMessages.push({ role: 'system', content: system });

    for (const msg of messages) {
      if (msg.role === 'user') {
        // Handle tool_result content blocks
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'tool_result') {
              oaiMessages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: block.content });
            } else {
              oaiMessages.push({ role: 'user', content: typeof block === 'string' ? block : block.text || JSON.stringify(block) });
            }
          }
        } else {
          oaiMessages.push({ role: 'user', content: msg.content });
        }
      } else if (msg.role === 'assistant') {
        if (Array.isArray(msg.content)) {
          // Reconstruct assistant message with tool_calls
          const textParts = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
          const toolUses = msg.content.filter(b => b.type === 'tool_use');
          const oaiMsg = { role: 'assistant', content: textParts || null };
          if (toolUses.length > 0) {
            oaiMsg.tool_calls = toolUses.map(tu => ({
              id: tu.id,
              type: 'function',
              function: { name: tu.name, arguments: JSON.stringify(tu.input) },
            }));
          }
          oaiMessages.push(oaiMsg);
        } else {
          oaiMessages.push({ role: 'assistant', content: msg.content });
        }
      }
    }

    // Convert Anthropic tools to OpenAI format
    const oaiTools = (tools || []).map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    const body = {
      model,
      max_tokens,
      messages: oaiMessages,
      // Faz o OpenRouter devolver `cost_details` com o custo REAL da chamada —
      // o que eles cobraram, não estimativa por tabela de preço. É o que
      // alimenta public.ai_spend e responde "para onde foi o dinheiro".
      usage: { include: true },
    };
    // Quem pediu. Capturado ANTES do await porque a pilha se perde depois.
    const origem = origemDaChamada();
    if (typeof temperature === 'number') body.temperature = temperature;
    if (oaiTools.length > 0) body.tools = oaiTools;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);
    let response;
    try {
      response = await withRetry(
        () => fetch(this.baseURL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://seatable.one',
            'X-Title': 'Seatable AI',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }).catch(err => {
          if (err?.name === 'AbortError') throw new Error('OpenRouter timeout after 45s');
          throw err;
        }),
        { maxAttempts: 2 }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      // 402 = OpenRouter credits exhausted. Service continuity beats routing
      // preference: retry once via direct Anthropic when the key is configured.
      if (response.status === 402) {
        const fallback = getAnthropicFallback();
        if (fallback) {
          logger.warn('OpenRouter out of credits (402) — failing over to direct Anthropic', { model });
          // O warn sozinho não bastava: o gasto MUDA DE CONTA aqui — sai do
          // painel do OpenRouter e passa a correr na Anthropic — e ninguém lê
          // log. Registrar em tabela é o que permite a faixa do cockpit dizer
          // "o plano B disparou N vezes". Fire-and-forget de propósito: este
          // caminho existe para o agente NÃO emudecer, então falha de
          // telemetria jamais pode derrubar a resposta.
          registrarFallback({ de: 'openrouter', para: 'anthropic', motivo: 'http_402_sem_credito', model });
          return fallback.messages.create({ ...params, model: toAnthropicModel(model) });
        }
      }
      throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    registrarGasto({ origem, model, usage: data.usage });
    const choice = data.choices?.[0];

    // Convert OpenAI response back to Anthropic format
    const content = [];
    if (choice?.message?.content) {
      content.push({ type: 'text', text: choice.message.content });
    }
    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content,
      stop_reason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : (choice?.finish_reason || 'end_turn'),
      model: data.model,
      usage: data.usage,
    };
  }

  /** Streaming variant — returns an object with .on('text', cb) and .finalMessage() */
  _stream(params) {
    const self = this;
    let finalMsg = null;

    return {
      on(event, callback) {
        // We'll call this after _create resolves
        this._callbacks = this._callbacks || {};
        this._callbacks[event] = callback;
        return this;
      },
      async finalMessage() {
        // Non-streaming fallback — call _create and simulate events
        finalMsg = await self._create(params);
        const textContent = finalMsg.content.filter(b => b.type === 'text').map(b => b.text).join('');
        if (this._callbacks?.text && textContent) {
          this._callbacks.text(textContent);
        }
        return finalMsg;
      },
    };
  }
}

/**
 * Get the shared AI client.
 * Prefers OpenRouter, falls back to direct Anthropic.
 */
function getAI() {
  if (_client) return _client;

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openRouterKey) {
    _client = new OpenRouterClient(openRouterKey);
    logger.info('AI client initialized via OpenRouter');
  } else if (anthropicKey) {
    const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');
    _client = new Anthropic({ apiKey: anthropicKey });
    logger.info('AI client initialized via direct Anthropic');
  } else {
    throw new Error('No AI API key configured (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)');
  }

  return _client;
}

module.exports = { getAI, AI_MODEL, AI_MODEL_FAST };
