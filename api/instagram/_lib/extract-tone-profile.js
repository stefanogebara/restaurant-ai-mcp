/**
 * Runs the LLM call that turns a batch of Instagram captions into a
 * structured tone-of-voice profile. The profile is what the caption
 * generator (C3) reads from to mimic the restaurant's voice.
 *
 * Cost: ~$0.001 per call against claude-3.5-haiku for ~30 captions.
 * Latency: ~2-5s p50. Acceptable for an on-demand "refresh tone" button
 * and a weekly background cron.
 *
 * Schema is strict and validated client-side after parsing because Haiku
 * occasionally adds extra fields or wraps in prose. Bad shape returns
 * null and the caller surfaces "could not compute profile" rather than
 * writing garbage to restaurant_config.instagram_tone_profile.
 */

const { getAI, AI_MODEL_FAST } = require('../../_lib/ai-client');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('instagram-tone-extract');

const MAX_CAPTIONS = 30;
const MAX_CAPTION_LEN = 600;

const SYSTEM_PROMPT = `You analyse a restaurant's Instagram captions to extract its tone of voice. The output is used to draft new captions in the same voice.

Output ONLY valid JSON, no prose. Schema:
{
  "formality": number 1-10,
  "emoji_density": "none" | "low" | "medium" | "high",
  "hashtag_style": "none" | "sparse" | "descriptive" | "trending",
  "recurring_themes": [string, ...],      // 3-7 short themes
  "signature_phrases": [string, ...],     // 0-5 verbatim phrases the account uses
  "voice_summary": string                 // 1-2 sentences, second person ("Your voice is...")
}

Rules:
- formality: 1 = "yo what's good fam", 10 = "We are delighted to welcome you"
- recurring_themes: nouns or short verb phrases, lowercase ("sourdough", "natural wine", "neighborhood spot")
- signature_phrases: only if you see them recur verbatim ≥2 times, otherwise []
- voice_summary: under 30 words, addressed to the restaurant ("Your voice is...")
- Captions:`;

async function extractToneProfile(captions) {
  if (!Array.isArray(captions)) throw new TypeError('captions must be an array');
  const cleaned = captions
    .filter((c) => typeof c === 'string' && c.trim().length > 0)
    .slice(0, MAX_CAPTIONS)
    .map((c) => c.length > MAX_CAPTION_LEN ? c.slice(0, MAX_CAPTION_LEN) + '…' : c);

  if (cleaned.length < 3) {
    // Not enough signal to extract a meaningful profile — caller should
    // mark the connection healthy but skip the profile write.
    return null;
  }

  const numbered = cleaned.map((c, i) => `${i + 1}. ${c}`).join('\n\n');
  const prompt = `${SYSTEM_PROMPT}\n${numbered}\n\nJSON:`;

  const ai = getAI();
  const completion = await ai.messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 700,
    temperature: 0.2,
    system: prompt,
    messages: [{ role: 'user', content: 'Extract the tone profile.' }],
  });

  const text = extractText(completion);
  const parsed = safeJSONParse(text);
  if (!parsed) {
    logger.warn('tone profile: LLM returned non-JSON', { textPreview: text.slice(0, 200) });
    return null;
  }
  const validated = postprocess(parsed);
  if (!validated) {
    logger.warn('tone profile: LLM JSON failed schema validation');
    return null;
  }
  return {
    ...validated,
    computed_at: new Date().toISOString(),
    source_post_count: cleaned.length,
  };
}

function extractText(completion) {
  if (!completion || !Array.isArray(completion.content)) return '';
  return completion.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function safeJSONParse(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : text;
  try { return JSON.parse(body); } catch { return null; }
}

function postprocess(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const {
    formality, emoji_density, hashtag_style,
    recurring_themes, signature_phrases, voice_summary,
  } = parsed;

  if (typeof formality !== 'number' || formality < 1 || formality > 10) return null;
  if (!['none', 'low', 'medium', 'high'].includes(emoji_density)) return null;
  if (!['none', 'sparse', 'descriptive', 'trending'].includes(hashtag_style)) return null;
  if (!Array.isArray(recurring_themes)) return null;
  if (!Array.isArray(signature_phrases)) return null;
  if (typeof voice_summary !== 'string' || voice_summary.length < 5) return null;

  return {
    formality: Math.round(formality),
    emoji_density,
    hashtag_style,
    recurring_themes: recurring_themes
      .filter((t) => typeof t === 'string')
      .slice(0, 8)
      .map((t) => t.trim().toLowerCase()),
    signature_phrases: signature_phrases
      .filter((p) => typeof p === 'string')
      .slice(0, 5)
      .map((p) => p.trim()),
    voice_summary: voice_summary.trim().slice(0, 300),
  };
}

module.exports = {
  extractToneProfile,
  // Exposed for unit tests — pure function, no LLM call.
  __test__: { postprocess, safeJSONParse },
};
