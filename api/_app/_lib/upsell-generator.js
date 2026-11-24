/**
 * AI-Powered Upsell Message Generator
 *
 * Uses Claude Haiku to generate personalized pre-reservation WhatsApp messages
 * with dish recommendations based on customer history and restaurant menu.
 * Falls back to template-based messages on failure.
 */

// Usa o MESMO cliente do resto do sistema (OpenRouter, com Anthropic direto de
// reserva) em vez de instanciar o SDK da Anthropic sozinho. Era o único caminho
// de IA fora do cliente compartilhado, e isso custou caro: quando a
// ANTHROPIC_API_KEY foi revogada, o agente seguiu funcionando pelo OpenRouter e
// só o upsell quebrou — em silêncio, porque o catch cai no template. Ninguém viu
// até uma sonda de integração perguntar (30/jul).
const { getAI, AI_MODEL_FAST } = require('./ai-client');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('UpsellGenerator');

const MAX_MESSAGE_LENGTH = 500;
const AI_TIMEOUT_MS = 10000;

/**
 * Build the system prompt for AI-generated upsell messages.
 */
function buildSystemPrompt(lang) {
  const langInstructions = {
    en: 'Write in English.',
    es: 'Write in Spanish.',
    'pt-BR': 'Write in Brazilian Portuguese.',
    pt: 'Write in Brazilian Portuguese.',
  };

  return (
    `You are a restaurant's WhatsApp assistant. Write a short, warm, personalized message ` +
    `recommending 2-3 dishes for tomorrow's visit. ` +
    `${langInstructions[lang] || langInstructions.en} ` +
    `Rules:\n` +
    `- Max 400 characters\n` +
    `- Use WhatsApp bold (*text*) for dish names only\n` +
    `- Start with a greeting using the customer's first name\n` +
    `- If the customer has dining history, reference it subtly (e.g. "since you enjoyed our seafood last time")\n` +
    `- End with a friendly sign-off\n` +
    `- Do NOT use markdown headers, links, or bullet points with dashes\n` +
    `- Use emojis sparingly (max 2)\n` +
    `- Do NOT mention prices\n` +
    `- Keep personalization subtle — never mention visit counts or spend amounts`
  );
}

/**
 * Build the user prompt with all context for the AI.
 */
function buildUserPrompt({
  customerName,
  partySize,
  time,
  visitCount,
  preferences,
  favoriteDishes,
  customerTier,
  signatureDishes,
  menuMemories,
  restaurantName,
}) {
  const parts = [`Restaurant: ${restaurantName}`, `Guest: ${customerName}`, `Party size: ${partySize}`, `Reservation time: ${time}`];

  if (visitCount > 0) {
    parts.push(`Returning guest (${visitCount} previous visits)`);
  } else {
    parts.push('First-time guest');
  }

  if (preferences) {
    parts.push(`Known preferences: ${typeof preferences === 'string' ? preferences : JSON.stringify(preferences)}`);
  }

  if (favoriteDishes?.length) {
    parts.push(`Favorite dishes: ${favoriteDishes.join(', ')}`);
  }

  if (customerTier) {
    parts.push(`Customer tier: ${customerTier}`);
  }

  if (signatureDishes?.length) {
    const dishList = signatureDishes
      .map((d) => `${d.name}${d.description ? ` — ${d.description}` : ''}${d.why_special ? ` (${d.why_special})` : ''}`)
      .join('; ');
    parts.push(`Signature dishes: ${dishList}`);
  }

  if (menuMemories?.length) {
    parts.push(`Menu notes: ${menuMemories.map((m) => m.content).join('; ')}`);
  }

  parts.push(
    `\nWrite a personalized WhatsApp message recommending 2-3 dishes for tomorrow's visit.`
  );

  return parts.join('\n');
}

/**
 * Generate a personalized upsell message using Claude Haiku.
 *
 * @param {object} context - Customer + restaurant context
 * @returns {Promise<string>} The generated message
 * @throws {Error} If AI generation fails (caller should use fallback)
 */
async function generateUpsellMessage(context) {
  const { lang = 'en' } = context;

  // getAI() já faz o cache do cliente e escolhe o provedor disponível.
  const client = getAI();

  const systemPrompt = buildSystemPrompt(lang);
  const userPrompt = buildUserPrompt(context);

  const response = await Promise.race([
    client.messages.create({
      // Constante compartilhada em vez de ID datado hardcoded: o slug antigo
      // ('claude-haiku-4-5-20251001') só existia na API direta da Anthropic e
      // teria que ser trocado à mão a cada troca de modelo.
      model: AI_MODEL_FAST,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), AI_TIMEOUT_MS)),
  ]);

  const text = response.content?.[0]?.text;
  if (!text) {
    throw new Error('Empty AI response');
  }

  // Enforce max length
  if (text.length > MAX_MESSAGE_LENGTH) {
    return text.slice(0, MAX_MESSAGE_LENGTH);
  }

  return text;
}

/**
 * Build a template-based fallback message (no AI call).
 * Used when AI generation fails or is disabled.
 */
function buildFallbackMessage({ customerName, restaurantName, signatureDishes, partySize, lang }) {
  const firstName = customerName?.split(' ')[0] || '';
  const isLargeParty = partySize >= 4;

  // Pick 2-3 dishes (randomized)
  const shuffled = [...(signatureDishes || [])].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, Math.min(3, shuffled.length));

  if (!picks.length) {
    return null; // Can't send upsell without dishes
  }

  const dishList = picks.map((d) => `• *${d.name}* — ${d.description || d.why_special || ''}`).join('\n');

  if (lang === 'pt-BR' || lang === 'pt') {
    const greeting = firstName ? `Oi ${firstName}!` : 'Oi!';
    const partyNote = isLargeParty ? '\n\nPara grupos maiores, nosso chef recomenda pedir para compartilhar!' : '';
    return `${greeting} 👋\n\nAmanha voce tem reserva no *${restaurantName}* e nosso chef separou algumas sugestoes especiais:\n\n${dishList}${partyNote}\n\nTe esperamos! 🍽️`;
  }

  if (lang === 'es') {
    const greeting = firstName ? `Hola ${firstName}!` : 'Hola!';
    const partyNote = isLargeParty ? '\n\nPara grupos grandes, nuestro chef recomienda pedir para compartir!' : '';
    return `${greeting} 👋\n\nManana tienes reserva en *${restaurantName}* y nuestro chef preparo sugerencias especiales:\n\n${dishList}${partyNote}\n\nTe esperamos! 🍽️`;
  }

  // English (default)
  const greeting = firstName ? `Hi ${firstName}!` : 'Hi!';
  const partyNote = isLargeParty ? '\n\nFor larger parties, our chef recommends sharing plates!' : '';
  return `${greeting} 👋\n\nYou have a reservation tomorrow at *${restaurantName}* and our chef has some special recommendations:\n\n${dishList}${partyNote}\n\nWe look forward to seeing you! 🍽️`;
}

module.exports = {
  generateUpsellMessage,
  buildFallbackMessage,
  buildSystemPrompt,
  buildUserPrompt,
  MAX_MESSAGE_LENGTH,
};
