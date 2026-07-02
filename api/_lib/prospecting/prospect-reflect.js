'use strict';

/**
 * Reflective LLM passes over a prospect conversation (Phase 5). Two cheap Haiku
 * calls with PURE, tolerant parsers:
 *   extrairFatos(history)   — pull facts the LEAD declared → ConversaFatos (memory;
 *                             merged into conversa_fatos so the agent never asks twice).
 *   scoreOutcome(transcript)— rate a finished conversation 1–5 + theme tags
 *                             (dashboard INPUT only — never mutates the prompt/strategy).
 * Ported from Olivia's olivia_brain (montarRequestFatos/parseFatos, montar/parseScore),
 * adapted to Seatable's getAI() (Anthropic shape → parse the text block, no
 * response_format). ANTI-INVENTION: only what the lead actually said; garbage → {}.
 */

const { getAI, AI_MODEL_FAST } = require('../ai-client');
const { createSecureLogger } = require('../secure-logger');
const { coerceFatos } = require('./prospect-facts');

const logger = createSecureLogger('ProspectReflect');

const AGENT_NAME = process.env.PROSPECTING_AGENT_NAME || 'Olímpia';

const FATOS_SYSTEM = [
  `Você extrai FATOS de uma conversa de WhatsApp entre uma SDR (assistant) e um`,
  `lead (user). Devolva SOMENTE um objeto JSON com o que o LEAD DECLAROU sobre si`,
  `ou o negócio dele — NUNCA invente nem infira. Se algo não foi dito, omita o campo.`,
  ``,
  `Schema (todos os campos opcionais):`,
  `{`,
  `  "is_dono": boolean,            // true só se o lead confirmou ser dono/responsável`,
  `  "nome_responsavel": string,    // nome do dono/responsável, se dito`,
  `  "email": string,               // e-mail que o lead passou`,
  `  "disponibilidade": string,     // quando ele pode ("só de manhã", "depois do dia 20")`,
  `  "objecoes": string[],          // ressalvas ditas ("acha caro", "já usa concorrente")`,
  `  "interesses": string[],        // interesses ("quer saber da logística")`,
  `  "notas": string[]              // outros fatos concretos ditos pelo lead`,
  `}`,
  ``,
  `Responda APENAS com o JSON, sem texto ao redor, sem markdown. {} se nada relevante.`,
].join('\n');

const SCORE_SYSTEM = [
  `Você avalia a QUALIDADE de uma conversa de WhatsApp já encerrada entre a SDR`,
  `${AGENT_NAME} (assistant) e um lead (user), do ponto de vista de vendas/atendimento.`,
  `Devolva SOMENTE um JSON: {"quality_score": <1-5>, "theme_tags": [<string>...]}.`,
  `quality_score: 1 = ruim (robótica, repetitiva, perdeu o lead); 3 = ok;`,
  `5 = excelente (natural, avançou pra reunião, lidou bem com objeções).`,
  `theme_tags: 2 a 5 tags curtas em pt-BR do que marcou a conversa`,
  `(ex.: "preço", "agendou", "sem interesse", "pediu detalhes", "indicou outro").`,
  `Responda APENAS o JSON, sem markdown nem texto ao redor.`,
].join('\n');

/** Build a LEAD/agent transcript from stored history (in=LEAD, out=agent). */
function transcriptFromHistory(history) {
  return (history || [])
    .map((m) => `${m.direcao === 'in' ? 'LEAD' : AGENT_NAME.toUpperCase()}: ${m.corpo || `[${m.tipo || 'mídia'}]`}`)
    .join('\n');
}

// Tolerant JSON-from-text extraction (the model may wrap it in prose/fences).
function jsonFromText(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* fall through */ }
  const m = s.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** PURE: text → ConversaFatos (coerced/safe). Garbage → {}. */
function parseFatosText(text) {
  const obj = jsonFromText(text);
  return obj ? coerceFatos(obj) : {};
}

/** PURE: text → { quality_score (int 1-5 or null), theme_tags }. Garbage → empty. */
function parseScoreText(text) {
  const obj = jsonFromText(text);
  if (!obj) return { quality_score: null, theme_tags: [] };
  const q = Number(obj.quality_score);
  const quality_score = Number.isInteger(q) && q >= 1 && q <= 5 ? q : null;
  const theme_tags = Array.isArray(obj.theme_tags)
    ? obj.theme_tags.filter((t) => typeof t === 'string' && t.trim()).map((s) => s.trim()).slice(0, 8)
    : [];
  return { quality_score, theme_tags };
}

async function callFast(system, userContent, maxTokens) {
  const resp = await getAI().messages.create({
    model: AI_MODEL_FAST,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  const blocks = Array.isArray(resp && resp.content) ? resp.content : [];
  const t = blocks.find((b) => b.type === 'text' && b.text);
  return t ? t.text : '';
}

/**
 * Extract declared facts from a conversation (best-effort; never throws).
 * @param {Array<{direcao:string, corpo:string|null, tipo:string|null}>} history
 * @returns {Promise<object>} ConversaFatos ({} on any failure)
 */
async function extrairFatos(history) {
  if (!Array.isArray(history) || history.length === 0) return {};
  try {
    const text = await callFast(FATOS_SYSTEM, transcriptFromHistory(history), 300);
    return parseFatosText(text);
  } catch (e) {
    logger.warn('extrairFatos failed (non-fatal):', e.message);
    return {};
  }
}

// History is hard-capped at 40 messages in the prompt — beyond ~30, older turns
// start falling out of context. The rolling summary compensates: 1-2 sentences
// of "where the conversation stopped and what's missing to book", stored in
// conversa_resumo and injected via formatarMemoria next turn.
const RESUMO_MIN = parseInt(process.env.PROSPECTING_RESUMO_MIN, 10) || 30;

const RESUMO_SYSTEM =
  `Resuma em 1-2 frases curtas (pt-BR) o estado desta conversa de WhatsApp ` +
  `entre a SDR ${AGENT_NAME} e um lead: onde a conversa parou e o que falta ` +
  `pra agendar. NÃO invente. Responda só o resumo.`;

/**
 * Rolling summary for long conversations (>= RESUMO_MIN messages; cheaper
 * turns skip it — the whole history is already in the prompt). Best-effort.
 * @param {Array<{direcao:string, corpo:string|null, tipo:string|null}>} history
 * @returns {Promise<string|null>} the summary, or null (too short / failure)
 */
async function gerarResumo(history) {
  if (!Array.isArray(history) || history.length < RESUMO_MIN) return null;
  try {
    const resp = await getAI().messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 180,
      temperature: 0.2,
      system: RESUMO_SYSTEM,
      messages: [{ role: 'user', content: transcriptFromHistory(history) }],
    });
    const blocks = Array.isArray(resp && resp.content) ? resp.content : [];
    const t = blocks.find((b) => b.type === 'text' && b.text && b.text.trim());
    return t ? t.text.trim() : null;
  } catch (e) {
    logger.warn('gerarResumo failed (non-fatal):', e.message);
    return null;
  }
}

/**
 * Score a finished conversation 1–5 + theme tags (best-effort).
 * @param {string} transcript
 * @returns {Promise<{quality_score: number|null, theme_tags: string[]}>}
 */
async function scoreOutcome(transcript) {
  if (!transcript || !transcript.trim()) return { quality_score: null, theme_tags: [] };
  try {
    const text = await callFast(SCORE_SYSTEM, transcript, 200);
    return parseScoreText(text);
  } catch (e) {
    logger.warn('scoreOutcome failed (non-fatal):', e.message);
    return { quality_score: null, theme_tags: [] };
  }
}

module.exports = {
  FATOS_SYSTEM,
  SCORE_SYSTEM,
  RESUMO_MIN,
  transcriptFromHistory,
  parseFatosText,
  parseScoreText,
  extrairFatos,
  gerarResumo,
  scoreOutcome,
};
