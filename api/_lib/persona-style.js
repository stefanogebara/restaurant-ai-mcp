'use strict';

// The owner-chosen speaking style (restaurant_config.ai_personality, set by
// the onboarding "A voz dela" choice or the personality panel) as prompt text.
//
// Shared by the WhatsApp assistant (api/_services/whatsapp/conversation.js)
// and, since 2026-11-16, the phone agent (persona-prompt-builder, channel
// 'voice'): before, only WhatsApp followed the owner's choice. The WhatsApp
// text is kept word for word; the phone wording says "talking", not "texting".

const HUMOR = {
  light: 'Use light, gentle humor when appropriate',
  witty: 'Be witty and clever with occasional wordplay',
  warm: 'Use warm, feel-good humor that makes people smile',
  playful: 'Be playful and fun, use casual jokes and lighthearted banter',
};

const STYLE = {
  formal: 'Use formal, polished language. Address customers with respect and courtesy',
  casual: 'Be casual and relaxed, like texting a friend',
  friendly_professional: 'Be warm and approachable while maintaining professionalism',
};

const TONE = {
  enthusiastic: 'Be enthusiastic and energetic in your responses',
  calm: 'Keep a calm, composed, and reassuring tone',
  neutral: 'Maintain a balanced, neutral tone',
  warm: 'Be warm, caring, and inviting in every message',
};

const VOICE_WORDING = {
  'Be casual and relaxed, like texting a friend': 'Be casual and relaxed, like talking with a friend',
  'Be warm, caring, and inviting in every message': 'Be warm, caring, and inviting in every answer',
};

function parse(aiPersonality) {
  if (typeof aiPersonality === 'string') {
    try { return JSON.parse(aiPersonality); } catch { return null; }
  }
  return aiPersonality && typeof aiPersonality === 'object' ? aiPersonality : null;
}

/** Lines of the style, or [] when nothing was chosen. */
function personalityLines(aiPersonality, { channel = 'whatsapp' } = {}) {
  const p = parse(aiPersonality);
  if (!p) return [];
  const say = text => (channel === 'voice' ? VOICE_WORDING[text] || text : text);
  const lines = [];
  if (p.humor_type && p.humor_type !== 'none') lines.push(`- Humor: ${say(HUMOR[p.humor_type] || p.humor_type)}`);
  if (Array.isArray(p.personality_traits) && p.personality_traits.length > 0) lines.push(`- Personality traits: ${p.personality_traits.join(', ')}`);
  if (p.communication_style) lines.push(`- Style: ${say(STYLE[p.communication_style] || p.communication_style)}`);
  if (p.language_tone) lines.push(`- Tone: ${say(TONE[p.language_tone] || p.language_tone)}`);
  if (p.verbal_quirks) lines.push(`- Verbal quirks: ${p.verbal_quirks}`);
  return lines;
}

module.exports = { personalityLines };
