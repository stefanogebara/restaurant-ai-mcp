/**
 * Runs the LLM call that turns a batch of Instagram captions + the
 * account bio into a structured tone-of-voice profile. The profile is
 * what the caption generator (C3) reads from to mimic the restaurant's
 * voice.
 *
 * v2 (Phase C.1):
 *   - Bio is now the PRIMARY voice signal (most concentrated tone
 *     statement on the whole account; survives even when posts are
 *     hashtag-only or off-topic).
 *   - Detects language and writes voice_summary in matching language so
 *     a Portuguese account doesn't get an English profile (the v1 bug
 *     that surfaced in the E2E audit).
 *   - Parses hashtags into a structured top_hashtags array so the
 *     drafter can re-use the account's signature tags instead of
 *     inventing generic ones.
 *
 * Cost: ~$0.001 per call against claude-3.5-haiku for ~30 captions + bio.
 * Latency: ~2-5s p50.
 */

const { getAI, AI_MODEL_FAST } = require('../../_lib/ai-client');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('instagram-tone-extract');

const MAX_CAPTIONS = 30;
const MAX_CAPTION_LEN = 600;
const MAX_BIO_LEN = 300;
const MAX_TOP_HASHTAGS = 10;

/**
 * Hashtag tokenizer. Unicode-aware so #GestãoDeRestaurante matches
 * alongside #RestaurantTech. Strips the leading '#' from the output.
 */
function extractHashtags(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  const re = /#([\p{L}\p{N}_]+)/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function topHashtagsFrom(captions) {
  const counts = new Map();
  for (const c of captions) {
    for (const tag of extractHashtags(c)) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  // Sort by frequency desc, alpha asc as tiebreak
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TOP_HASHTAGS)
    .map(([tag, count]) => ({ tag: '#' + tag, count }));
}

const SYSTEM_PROMPT_BUILDER = ({ bio, captionBlock, language }) => `You analyse a restaurant's Instagram bio + recent captions to extract its tone of voice. The output is used to draft new captions in the same voice.

${bio ? `BIO (highest-signal voice statement):
"""${bio}"""

` : ''}CAPTIONS (numbered, recent posts):
${captionBlock}

LANGUAGE: The bio + captions appear to be in: ${language}
You MUST write voice_summary IN THAT LANGUAGE. signature_phrases should also be verbatim from the source (so they will match the source language).

Output ONLY valid JSON, no prose. Schema:
{
  "language": "${language}",
  "formality": number 1-10,
  "emoji_density": "none" | "low" | "medium" | "high",
  "hashtag_style": "none" | "sparse" | "descriptive" | "trending",
  "recurring_themes": [string, ...],      // 3-7 short themes in source language
  "signature_phrases": [string, ...],     // 0-5 verbatim phrases the account uses
  "voice_summary": string                 // 1-2 sentences in source language addressed to the restaurant
}

Rules:
- formality: 1 = "yo what's good fam", 10 = formal hospitality language
- recurring_themes: nouns or short phrases, lowercase, IN THE SOURCE LANGUAGE
- signature_phrases: include if you see them recur in bio OR captions ≥2 times, otherwise []
- voice_summary: under 30 words. Write IN THE SOURCE LANGUAGE. If language is Portuguese, write in Portuguese; if Spanish, in Spanish; if English, in English. Do NOT translate.
- emoji_density: consider BOTH bio + captions. Bio emojis count.

JSON:`;

/**
 * Quick-and-dirty language detection sufficient for picking the output
 * language. Looks at the longest source text we have. Falls back to 'en'
 * when unsure. We deliberately avoid an extra LLM call — Haiku takes the
 * language hint and runs with it; if our hint is wrong the user can fix
 * via the Refresh button.
 */
function detectLanguage(text) {
  if (typeof text !== 'string' || text.length < 10) return 'en';
  const t = text.toLowerCase();

  // Order matters: check the most-specific marker languages first so
  // their unique tokens win before the broader Portuguese check fires.
  //
  // Spanish-only: ñ (no other Romance lang here uses it) + inverted ?/!
  if (/[ñ¿¡]/.test(t) || /\b(mañana|señor|señora|niño|niña|reserváis|nuestro)\b/.test(t)) {
    return 'es';
  }

  // French-specific tokens (réservation has a circumflex pattern only
  // found in FR; Portuguese spells it "reserva", Italian "prenotazione").
  if (/\b(réservation|réserver|votre|notre|nôtre|gratuit)\b/.test(t)) {
    return 'fr';
  }

  // Italian-specific tokens.
  if (/\b(vostro|prenotazione|ristorante|gratuito|nostro)\b/.test(t)) {
    return 'it';
  }

  // Portuguese: prefer ã/õ over the broader é set so we don't claim French.
  // ã and õ are essentially unique to Portuguese in this Romance group; cedilha
  // alone (ç) appears in French + Catalan too, so we require it AND a PT word.
  if (
    /[ãõ]/.test(t) ||
    /\b(você|reserva|restaurante|atendimento|inteligente|gestão|grátis|olá|obrigado|obrigada)\b/.test(t) ||
    (/\bç\w/.test(t) && /\b(para|que|mais|com|para|nosso)\b/.test(t))
  ) {
    return 'pt';
  }

  return 'en';
}

async function extractToneProfile(captions, bio = null) {
  if (!Array.isArray(captions)) throw new TypeError('captions must be an array');
  const cleanedCaptions = captions
    .filter((c) => typeof c === 'string' && c.trim().length > 0)
    .slice(0, MAX_CAPTIONS)
    .map((c) => c.length > MAX_CAPTION_LEN ? c.slice(0, MAX_CAPTION_LEN) + '…' : c);

  const cleanedBio = typeof bio === 'string' && bio.trim().length > 0
    ? bio.trim().slice(0, MAX_BIO_LEN)
    : null;

  // Need either captions OR a bio. Bio alone is sometimes enough for a
  // brand-new account that hasn't posted yet but has a strong tagline.
  if (cleanedCaptions.length < 3 && !cleanedBio) {
    return null;
  }

  // Detect language using the longest source text (bio if substantial,
  // otherwise the longest caption).
  const langSrc = (cleanedBio && cleanedBio.length > 30)
    ? cleanedBio
    : cleanedCaptions.sort((a, b) => b.length - a.length)[0] || cleanedBio || '';
  const language = detectLanguage(langSrc);

  const captionBlock = cleanedCaptions.map((c, i) => `${i + 1}. ${c}`).join('\n\n')
    || '(no captioned posts yet — extract tone from bio only)';

  const systemPrompt = SYSTEM_PROMPT_BUILDER({ bio: cleanedBio, captionBlock, language });

  const ai = getAI();
  const completion = await ai.messages.create({
    model: AI_MODEL_FAST,
    max_tokens: 800,
    temperature: 0.2,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Extract the tone profile.' }],
  });

  const text = extractText(completion);
  const parsed = safeJSONParse(text);
  if (!parsed) {
    logger.warn('tone profile: LLM returned non-JSON', { textPreview: text.slice(0, 200) });
    return null;
  }
  const validated = postprocess(parsed, language);
  if (!validated) {
    logger.warn('tone profile: LLM JSON failed schema validation');
    return null;
  }

  // Compute structured top_hashtags from BOTH bio and captions so the
  // drafter has them as a ready-to-use signature set. This is deterministic
  // (no LLM), cheap, and survives a hallucinating Haiku.
  const allText = [cleanedBio, ...cleanedCaptions].filter(Boolean).join('\n');
  const top_hashtags = topHashtagsFrom([allText]);

  return {
    ...validated,
    language,
    top_hashtags,
    bio_used: !!cleanedBio,
    computed_at: new Date().toISOString(),
    source_post_count: cleanedCaptions.length,
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

function postprocess(parsed, fallbackLanguage) {
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

  // language is added in extractToneProfile (we trust our detector over the LLM's
  // self-reporting), so we don't validate it from parsed here. fallbackLanguage is
  // kept as the parameter for future use if we ever DO want to override.
  void fallbackLanguage;

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
  __test__: { postprocess, safeJSONParse, extractHashtags, topHashtagsFrom, detectLanguage },
};
