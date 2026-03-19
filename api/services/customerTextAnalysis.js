/**
 * Customer Text Analysis Service
 *
 * Uses Claude AI to extract behavioral signals from unstructured text:
 * - Reservation special_requests and notes
 * - Call transcripts from agent_conversations
 * - Conversation summaries
 *
 * Implements hash-based caching to avoid redundant AI calls.
 */

const { getAI, AI_MODEL } = require('../_lib/ai-client');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const crypto = require('crypto');

const logger = createSecureLogger('CustomerTextAnalysis');

/**
 * Extract behavioral signals from all text associated with a customer.
 * Uses hash-based caching to skip AI call if text hasn't changed.
 *
 * @param {string} customerId - Customer phone number
 * @returns {Promise<Object>} Extracted signals
 */
async function extractCustomerSignals(customerId) {
  try {
    // Step 1: Gather all text for this customer
    const textSources = await gatherCustomerText(customerId);

    if (textSources.totalTexts === 0) {
      return {
        customer_id: customerId,
        skipped: true,
        reason: 'No text data available'
      };
    }

    // Step 2: Compute hash of concatenated text
    const textHash = computeTextHash(textSources.allText);

    // Step 3: Check cache
    const { data: cached } = await supabaseAdmin
      .from('customer_text_signals')
      .select('*')
      .eq('customer_id', customerId)
      .single();

    if (cached && cached.text_content_hash === textHash) {
      logger.info(`[TextAnalysis] Cache hit for ${customerId}, skipping AI call`);
      return {
        customer_id: customerId,
        cached: true,
        signals: cached
      };
    }

    // Step 4: Call Claude to extract signals
    const signals = await analyzeWithClaude(textSources);

    // Step 5: Save to database
    const savedSignals = await saveTextSignals(customerId, textHash, signals, textSources.totalTexts);

    return {
      customer_id: customerId,
      cached: false,
      signals: savedSignals
    };

  } catch (error) {
    logger.error(`[TextAnalysis] Error for ${customerId}:`, error);
    throw error;
  }
}

/**
 * Gather all text from reservations and conversations for a customer.
 */
async function gatherCustomerText(customerId) {
  const texts = [];

  // 1. Reservation special_requests and notes
  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('date, special_requests, notes')
    .eq('customer_phone', customerId)
    .order('date', { ascending: false });

  if (reservations) {
    for (const res of reservations) {
      if (res.special_requests && res.special_requests.trim()) {
        texts.push({
          source: 'reservation_request',
          date: res.date,
          text: res.special_requests.trim()
        });
      }
      if (res.notes && res.notes.trim()) {
        texts.push({
          source: 'reservation_note',
          date: res.date,
          text: res.notes.trim()
        });
      }
    }
  }

  // 2. Agent conversations - transcripts and summaries
  // Build phone variants for matching
  const phoneVariants = buildPhoneVariants(customerId);

  const { data: conversations } = await supabaseAdmin
    .from('agent_conversations')
    .select('started_at, transcript, summary, customer_sentiment')
    .in('caller_phone', phoneVariants)
    .order('started_at', { ascending: false });

  if (conversations) {
    for (const conv of conversations) {
      // Extract caller messages from transcript JSONB
      if (conv.transcript && Array.isArray(conv.transcript)) {
        const callerMessages = conv.transcript
          .filter(msg => msg.role === 'user' || msg.role === 'customer' || msg.role === 'caller')
          .map(msg => typeof msg.content === 'string' ? msg.content : (msg.text || ''))
          .filter(text => text.trim().length > 0);

        if (callerMessages.length > 0) {
          texts.push({
            source: 'call_transcript',
            date: conv.started_at ? conv.started_at.split('T')[0] : null,
            text: callerMessages.join(' ')
          });
        }
      }

      // Conversation summary
      if (conv.summary && conv.summary.trim()) {
        texts.push({
          source: 'call_summary',
          date: conv.started_at ? conv.started_at.split('T')[0] : null,
          text: conv.summary.trim()
        });
      }
    }
  }

  // Build concatenated text for hashing
  const allText = texts.map(t => `[${t.source}|${t.date}] ${t.text}`).join('\n');

  return {
    texts,
    allText,
    totalTexts: texts.length
  };
}

/**
 * Build phone number variants for fuzzy matching.
 */
function buildPhoneVariants(phone) {
  if (!phone) return [];
  const cleaned = phone.replace(/\D/g, '');
  const variants = new Set([phone, cleaned]);

  if (cleaned.length >= 11) {
    variants.add(cleaned.slice(1)); // Remove country code
  }
  if (cleaned.length === 10) {
    variants.add('1' + cleaned); // Add US country code
  }
  if (cleaned.length > 10) {
    variants.add(cleaned.slice(-10)); // Last 10 digits
  }

  return [...variants];
}

/**
 * Compute SHA-256 hash of text for change detection.
 */
function computeTextHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Call Claude to extract structured signals from customer text.
 */
async function analyzeWithClaude(textSources) {
  const anthropic = getAI();

  // Build the prompt with all text grouped by source
  const textBlock = textSources.texts.map(t => {
    const dateStr = t.date ? ` (${t.date})` : '';
    return `[${t.source}${dateStr}]: ${t.text}`;
  }).join('\n');

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    system: `You are a restaurant customer analyst. Extract structured behavioral signals from customer interaction text. Return ONLY valid JSON with no markdown formatting, no code blocks, no explanation.`,
    messages: [
      {
        role: 'user',
        content: `Analyze the following customer interaction texts from a restaurant and extract behavioral signals. There are ${textSources.totalTexts} text sources.

${textBlock}

Return a JSON object with these fields:
{
  "dietary_restrictions": string[] (e.g. ["vegetarian", "nut allergy", "gluten-free"]),
  "cuisine_preferences": string[] (e.g. ["seafood", "italian", "wine"]),
  "occasion_types": string[] (e.g. ["birthday", "business_dinner", "anniversary", "date_night"]),
  "dining_style_evidence": string (one of: "solo", "couple", "family", "business", "group", or null if unclear),
  "dining_style_reasoning": string (brief explanation of why),
  "has_children": boolean or null,
  "seating_preferences": string[] (e.g. ["window", "quiet", "outdoor", "booth"]),
  "noise_sensitivity": string (one of: "low", "moderate", "high", or null),
  "special_needs": string[] (e.g. ["wheelchair", "high_chair"]),
  "sentiment_summary": string (one of: "very_positive", "positive", "neutral", "negative", "very_negative"),
  "key_phrases": string[] (notable phrases that reveal personality or preferences, max 5),
  "vip_signals": boolean (true if text suggests high-value or VIP treatment expected),
  "confidence": number (0-100, how confident you are in the overall extraction)
}

Only include signals that are clearly supported by the text. Use null for uncertain fields.`
      }
    ]
  });

  // Parse the JSON response
  const responseText = response.content[0].text.trim();

  // Handle potential markdown code block wrapping
  let jsonStr = responseText;
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    return JSON.parse(jsonStr);
  } catch (parseError) {
    logger.error('[TextAnalysis] Failed to parse Claude response:', responseText);
    return {
      dietary_restrictions: [],
      cuisine_preferences: [],
      occasion_types: [],
      dining_style_evidence: null,
      dining_style_reasoning: null,
      has_children: null,
      seating_preferences: [],
      noise_sensitivity: null,
      special_needs: [],
      sentiment_summary: 'neutral',
      key_phrases: [],
      vip_signals: false,
      confidence: 0
    };
  }
}

/**
 * Save extracted signals to customer_text_signals table.
 */
async function saveTextSignals(customerId, textHash, signals, textSourcesCount) {
  const record = {
    customer_id: customerId,
    text_content_hash: textHash,
    extracted_signals: signals,
    dietary_restrictions: signals.dietary_restrictions || [],
    cuisine_preferences: signals.cuisine_preferences || [],
    occasion_types: signals.occasion_types || [],
    dining_style_evidence: signals.dining_style_evidence || null,
    has_children: signals.has_children != null ? signals.has_children : null,
    seating_preferences: signals.seating_preferences || [],
    noise_sensitivity: signals.noise_sensitivity || null,
    sentiment_summary: signals.sentiment_summary || 'neutral',
    key_phrases: signals.key_phrases || [],
    vip_signals: signals.vip_signals || false,
    ai_confidence: signals.confidence || 0,
    text_sources_count: textSourcesCount,
    last_analyzed_at: new Date().toISOString()
  };

  const { data, error } = await supabaseAdmin
    .from('customer_text_signals')
    .upsert(record, { onConflict: 'customer_id' })
    .select()
    .single();

  if (error) {
    logger.error('[TextAnalysis] Error saving signals:', error);
    throw error;
  }

  logger.info(`[TextAnalysis] Saved signals for ${customerId} (confidence: ${signals.confidence}%)`);
  return data;
}

module.exports = {
  extractCustomerSignals,
  gatherCustomerText,
  computeTextHash
};
