/**
 * POST /api/instagram/draft-caption
 *
 * Generates 3 Instagram caption drafts in the restaurant's own voice. The
 * tone profile (from C2) is the source of voice; the user provides what
 * they want to post about and an optional length preference.
 *
 * Request:
 *   { topic: string, length?: 'short' | 'medium' | 'long' }
 *   topic ~= what you want to post about ("the new wood-fired pizza", "Sunday brunch with live jazz")
 *
 * Response:
 *   { ok: true, drafts: [string, string, string] }
 *
 * v1 limitations (intentional, to ship fast):
 *   - No photo analysis (caller passes a topic, not an image)
 *   - No auto-posting (user copies the chosen draft and posts via IG)
 *   - English only — the LLM picks up language from the existing voice_summary
 *     and recurring_themes, which themselves come from the restaurant's
 *     own posts, so a Portuguese restaurant gets Portuguese drafts naturally
 *
 * Cost: ~$0.002 per call against claude-3.5-haiku. 20 req/hour/user.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { getAI, AI_MODEL_FAST } = require('../_lib/ai-client');

const logger = createSecureLogger('instagram-draft-caption');

const MAX_TOPIC_LEN = 300;
const VALID_LENGTHS = ['short', 'medium', 'long'];

// Word-count targets so the LLM stays predictable across lengths.
const LENGTH_HINTS = {
  short:  '15-30 words, one sentence ideally, no more than two.',
  medium: '40-70 words, 2-3 sentences. Room for a hook + a detail + a CTA.',
  long:   '80-140 words, 3-5 sentences. Story-style with a moment, a detail, and a call to action.',
};

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-draft-caption:${user.id}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  const body = (typeof req.body === 'object' && req.body) || {};
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const length = VALID_LENGTHS.includes(body.length) ? body.length : 'medium';

  if (!topic || topic.length < 3) {
    return res.status(400).json({ ok: false, error: 'topic must be at least 3 characters' });
  }
  if (topic.length > MAX_TOPIC_LEN) {
    return res.status(400).json({ ok: false, error: `topic is too long (max ${MAX_TOPIC_LEN} chars)` });
  }

  // 1. Look up the tone profile + IG connection bio/website. The bio is
  // the most concentrated voice signal we have, so it's part of the
  // drafter's prompt for stronger voice grounding than the tone profile
  // summary alone.
  const { data: rest, error: restErr } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('instagram_tone_profile, restaurant_name')
    .eq('id', user.restaurant_id)
    .maybeSingle();

  if (restErr) {
    logger.error('restaurant lookup failed', { err: restErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
  if (!rest?.instagram_tone_profile) {
    return res.status(409).json({
      ok: false,
      error: "We don't have your tone profile yet. Connect Instagram and click Build now first.",
    });
  }

  // Pull bio + website from the IG connection row. Non-fatal if missing
  // (older connections won't have them until they're refreshed).
  const { data: conn } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .select('biography, website, display_name')
    .eq('restaurant_id', user.restaurant_id)
    .in('status', ['active', 'restricted'])
    .maybeSingle();

  const tone = rest.instagram_tone_profile;
  const language = tone.language || 'en';

  // top_hashtags is the structured list parsed deterministically in the
  // extractor (Phase C.1). Surface them so Haiku can re-use them verbatim
  // instead of inventing generic ones.
  const topHashtagsLine = Array.isArray(tone.top_hashtags) && tone.top_hashtags.length > 0
    ? tone.top_hashtags.map((h) => h.tag).join(' ')
    : '(none)';

  // 2. Build the prompt
  const bioBlock = conn?.biography
    ? `\nACCOUNT BIO (highest-signal voice statement — match this tone closely):\n"""${conn.biography}"""\n`
    : '';
  const websiteBlock = conn?.website
    ? `\nWEBSITE: ${conn.website} (use this URL if a CTA would naturally point at it)\n`
    : '';

  const systemPrompt = `You are drafting Instagram captions for a restaurant named "${conn?.display_name || rest.restaurant_name || 'this restaurant'}". Match the restaurant's existing voice precisely.
${bioBlock}${websiteBlock}
Voice profile (from their last 30 posts):
- Language: ${language} (you MUST write all 3 drafts IN THIS LANGUAGE, do NOT translate to English)
- Formality: ${tone.formality}/10 (1 = casual slang, 10 = formal hospitality)
- Emoji density: ${tone.emoji_density}
- Hashtag style: ${tone.hashtag_style}
- Recurring themes: ${(tone.recurring_themes || []).join(', ') || '(none)'}
- Signature phrases (use sparingly, only if they fit): ${(tone.signature_phrases || []).join(' | ') || '(none)'}
- Top hashtags from the account (re-use these instead of inventing new ones): ${topHashtagsLine}
- Voice summary: ${tone.voice_summary}

You will produce 3 distinct caption drafts for the user-supplied topic. Each draft should:
- Be WRITTEN IN ${language === 'pt' ? 'PORTUGUESE' : language === 'es' ? 'SPANISH' : language === 'fr' ? 'FRENCH' : language === 'it' ? 'ITALIAN' : 'ENGLISH'} (this is the account's posting language)
- Match the voice profile above (formality, emoji density, hashtag style)
- Be ${LENGTH_HINTS[length]}
- Be different from the other two (vary the hook or angle)
- Not start with "Hey" or "Hello" unless that matches the formality
- Include hashtags only if hashtag_style is 'sparse', 'descriptive', or 'trending' (skip if 'none').
  When including hashtags, PREFER the top hashtags from the account above.

Output ONLY valid JSON, no prose. Schema:
{ "drafts": [string, string, string] }

User topic: """${topic}"""

JSON:`;

  try {
    const ai = getAI();
    const completion = await ai.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 800,
      temperature: 0.7,  // higher than extract — we want variety across the 3 drafts
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Draft 3 captions.' }],
    });

    const text = extractText(completion);
    const parsed = safeJSONParse(text);
    if (!parsed || !Array.isArray(parsed.drafts) || parsed.drafts.length < 1) {
      logger.warn('LLM returned unparseable drafts', { textPreview: text.slice(0, 200) });
      return res.status(502).json({ ok: false, error: 'Could not generate captions — please try again.' });
    }

    // Validate + clamp to 3
    const drafts = parsed.drafts
      .filter((d) => typeof d === 'string' && d.trim().length > 0)
      .slice(0, 3)
      .map((d) => d.trim());

    if (drafts.length === 0) {
      return res.status(502).json({ ok: false, error: 'All drafts were empty — please try again.' });
    }

    logger.info('captions generated', { restaurantId: user.restaurant_id, count: drafts.length, length });
    return res.status(200).json({ ok: true, drafts });
  } catch (err) {
    logger.error('draft-caption failed', { err: err?.message });
    return res.status(500).json({ ok: false, error: 'Caption generation failed' });
  }
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '4kb' } },
};

// ─── helpers (kept inline — small enough not to warrant another file) ──

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
