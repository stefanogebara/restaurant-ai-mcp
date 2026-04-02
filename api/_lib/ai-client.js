/**
 * Centralized AI Client — routes through OpenRouter for cost savings.
 *
 * Exposes an Anthropic-SDK-compatible interface (.messages.create / .messages.stream)
 * but routes calls through OpenRouter's Chat Completions API.
 *
 * Falls back to direct Anthropic SDK if only ANTHROPIC_API_KEY is available.
 */

const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('ai-client');

let _client = null;

/** Default model */
const AI_MODEL = process.env.AI_MODEL || 'anthropic/claude-sonnet-4-20250514';

/** Cheap model for extraction/classification */
const AI_MODEL_FAST = process.env.AI_MODEL_FAST || 'anthropic/claude-haiku-4-5-20251001';

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
    const { model, max_tokens, system, messages, tools } = params;

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
    };
    if (oaiTools.length > 0) body.tools = oaiTools;

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://seatable.one',
        'X-Title': 'Seatable AI',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
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
