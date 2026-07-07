'use strict';

/**
 * Olímpia Gym (Phase 10) — scenario simulation + judged evaluation.
 *
 * Runs the REAL brain (generateReply: same prompt, tools, model, style pack)
 * against an LLM playing a restaurant person from a persona spec — in memory,
 * zero side effects: no WhatsApp, no lead rows, no state machine writes. Each
 * run stores the transcript + a rubric judgment so style-pack drafts can be
 * A/B-compared before promotion. Architecture:
 *
 *   scenario (persona spec) ──▶ sim-lead LLM ──┐
 *                                              ├─▶ transcript ─▶ judge ─▶ scores
 *   style pack (active|draft) ─▶ REAL brain ───┘
 *
 * The judge rubric targets exactly the founder's asks: humanity, naturalness,
 * zero exaggeration, multi-bubble usage, no repetition, goal advancement.
 */

const { getAI, AI_MODEL } = require('../ai-client');
const { exigirOrcamentoLlm } = require('./prospect-llm-budget');
const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');
const { generateReply, AGENT_NAME } = require('./prospect-agent');
const { detectarOptout } = require('./prospect-state');

const logger = createSecureLogger('ProspectSim');

// Mirror of the APPROVED intro template (olimpia_apresentacao) — keep in sync
// so gym conversations open exactly like production ones.
const INTRO_PREVIEW =
  'Oi, tudo bem? Aqui é a Olímpia, da Seatable 👋\n\n' +
  'Achei o {{nome}} pelo Google Maps e resolvi chamar.\n\n' +
  'A gente criou um CRM com IA feito pra restaurante: ele atende o WhatsApp da casa sozinho, ' +
  'responde na hora, anota a reserva e corre atrás de quem furou — pra mesa não ficar vazia.\n\n' +
  'Posso te contar em 2 minutos como ficaria aí? Se não for o momento, tranquilo — é só falar 🙂\n\n' +
  'Mais sobre a gente: seatable.one';

/** System prompt for the LLM playing the LEAD. */
function simLeadSystem(scenario) {
  const p = scenario.persona || {};
  return [
    `Você está SIMULANDO uma pessoa real de um restaurante brasileiro respondendo`,
    `mensagens frias no WhatsApp. Interprete o papel com fidelidade total — você`,
    `NÃO é um assistente; você É esta pessoa:`,
    ``,
    `RESTAURANTE: ${(scenario.lead && scenario.lead.name) || 'Restaurante'}`,
    `PERFIL: ${p.perfil || 'dono de restaurante'}`,
    `HUMOR: ${p.humor || 'neutro'}`,
    `ESTILO DE ESCRITA: ${p.estilo || 'informal, curto'}`,
    `OBJETIVO NA CONVERSA: ${p.objetivo || 'decidir se vale a pena'}`,
    ...(Array.isArray(p.curveballs) && p.curveballs.length
      ? [``, `EVENTOS QUE VOCÊ DEVE ENCAIXAR (um por vez, quando fizer sentido):`,
         ...p.curveballs.map((c, i) => `${i + 1}. ${c}`)]
      : []),
    ``,
    `REGRAS DA SIMULAÇÃO:`,
    `- Escreva SÓ a(s) mensagem(ns) da pessoa, sem narração nem aspas.`,
    `- Se o estilo pede bolhas, separe as mensagens com UMA linha em branco.`,
    `- Reaja ao que a outra parte disse de verdade (não siga script cegamente).`,
    `- Mantenha o registro do personagem até o fim (erros de digitação leves ok).`,
  ].join('\n');
}

/** One sim-lead turn: given the transcript so far, produce the lead's message(s). */
async function simLeadReply(scenario, transcript) {
  const messages = transcript.map((t) => ({
    // From the sim-lead's point of view: Olímpia is the "user" talking TO them.
    role: t.who === 'olimpia' ? 'user' : 'assistant',
    content: t.texto,
  }));
  // Sim calls share the global budget — a gym session must stop, visibly,
  // when the hourly cap is gone (this throw surfaces in the suite runner).
  await exigirOrcamentoLlm();
  const resp = await getAI().messages.create({
    model: AI_MODEL,
    max_tokens: 300,
    temperature: 0.9, // people are noisier than assistants
    system: simLeadSystem(scenario),
    messages: messages.length ? messages : [{ role: 'user', content: INTRO_PREVIEW }],
  });
  const block = (resp.content || []).find((b) => b.type === 'text' && b.text && b.text.trim());
  return block ? block.text.trim() : null;
}

/**
 * Run one full simulated conversation against the real brain.
 * @param {object} scenario - prospect_sim_scenarios row
 * @param {{styleOverride?: string|null, turns?: number, nowMs?: number}} [opts]
 * @returns {Promise<{transcript: Array, terminal: string|null}>}
 */
async function runSimulation(scenario, { styleOverride = undefined, turns = null, nowMs = Date.now() } = {}) {
  const maxTurns = Math.min(Math.max(turns || scenario.turns || 6, 2), 10);
  const lead = {
    name: (scenario.lead && scenario.lead.name) || 'Restaurante Simulado',
    city: (scenario.lead && scenario.lead.city) || 'São Paulo',
    sector: (scenario.lead && scenario.lead.sector) || 'restaurante',
    owner_name: (scenario.lead && scenario.lead.owner_name) || null,
    nome_genero: null,
    conversa_fatos: null,
    conversa_resumo: null,
  };

  const intro = INTRO_PREVIEW.replace('{{nome}}', lead.name);
  const transcript = [{ who: 'olimpia', texto: intro, acao: 'template' }];
  let terminal = null;

  for (let turno = 0; turno < maxTurns; turno++) {
    // 1. Sim-lead speaks.
    const leadMsg = await simLeadReply(scenario, transcript);
    if (!leadMsg) break;
    transcript.push({ who: 'lead', texto: leadMsg });

    // 2. Deterministic opt-out guardrail — same as production order.
    if (detectarOptout(leadMsg)) {
      const { COMPANION_TEXT } = require('./prospect-agent');
      transcript.push({ who: 'olimpia', texto: COMPANION_TEXT.optout, acao: 'optout' });
      terminal = 'optout';
      break;
    }

    // 3. The REAL brain answers (same prompt/tools/model/style as production).
    const history = transcript
      .filter((t) => t.texto)
      .map((t) => ({ direcao: t.who === 'lead' ? 'in' : 'out', corpo: t.texto, tipo: 'text' }));
    const acao = await generateReply({ lead, history, nowMs, styleOverride });

    if (acao.tipo === 'responder' && acao.texto) {
      transcript.push({ who: 'olimpia', texto: acao.texto, acao: 'responder' });
    } else if (acao.tipo === 'criar_demo') {
      // Mirror production faithfully so the gym can score demo-CTA packs: the
      // responder creates the demo + appends the REAL link on the first call, and
      // a repeated criar_demo becomes a short nudge (idempotency), never a re-spam.
      // The sim has no DB, so inject a representative (hex) link the guard matches.
      const { previaLinkInHistory } = require('./prospect-demo');
      const intro = String(acao.texto || '').replace(/https?:\/\/\S+/gi, '').trim();
      const jaEnviada = previaLinkInHistory(transcript.map((t) => ({ corpo: t.texto })));
      if (jaEnviada) {
        transcript.push({ who: 'olimpia', texto: 'já te mandei ali em cima 👆 dá uma olhada quando puder 🙂', acao: 'criar_demo' });
      } else {
        const linkBubble = 'é essa aqui, abre no celular 👇\nhttps://seatable.one/previa/1a2b3c4d-5678';
        transcript.push({ who: 'olimpia', texto: intro ? `${intro}\n\n${linkBubble}` : linkBubble, acao: 'criar_demo' });
      }
    } else if (acao.texto) {
      transcript.push({ who: 'olimpia', texto: acao.texto, acao: acao.tipo });
    } else {
      // Surface WHY the brain stayed silent (LLM error, truncation, guard) —
      // a silent 'nada' hid a full provider outage on 2026-07-06.
      transcript.push({ who: 'olimpia', texto: null, acao: acao.tipo, motivo: acao.motivo || null });
    }
    if (['optout', 'handoff', 'agendar', 'registrar_responsavel'].includes(acao.tipo)) {
      terminal = acao.tipo;
      break;
    }
  }

  return { transcript, terminal };
}

// ---- Judge -------------------------------------------------------------------

const JUDGE_SYSTEM = [
  `Você avalia se uma vendedora (${AGENT_NAME}) soa HUMANA numa conversa de`,
  `WhatsApp com um lead. Analise SÓ as mensagens da ${AGENT_NAME.toUpperCase()}.`,
  `Devolva SOMENTE um JSON:`,
  `{`,
  `  "humanidade": 1-5,      // pareceria uma pessoa de verdade? (5 = indistinguível)`,
  `  "naturalidade": 1-5,    // ritmo, aberturas variadas, registro pt-BR falado`,
  `  "sobriedade": 1-5,      // 5 = zero entusiasmo vendedor/exagero; 1 = "Incrível!!"`,
  `  "bolhas": 1-5,          // usa 2-3 bolhas curtas quando natural (5) vs sempre bloco único (1)`,
  `  "repeticao": 1-5,       // 5 = nunca repete abertura/informação`,
  `  "avanco": 1-5,          // conduz ao objetivo (qualificar/agendar) sem forçar`,
  `  "adaptacao": 1-5,       // espelha o tamanho/energia do lead; lida com desvios`,
  `  "tags": ["..."],        // 2-5 marcas do que houve (ex: "repetiu abertura", "bolhas boas")`,
  `  "veredicto": "..."      // 1 frase: a maior força e a maior fraqueza`,
  `}`,
  `Seja EXIGENTE: 4-5 só para desempenho realmente humano. Responda APENAS o JSON.`,
].join('\n');

const RUBRICA = ['humanidade', 'naturalidade', 'sobriedade', 'bolhas', 'repeticao', 'avanco', 'adaptacao'];

/** PURE: judge text → clamped scores. Garbage → null. */
function parseJudgeText(text) {
  const s = String(text || '').trim();
  const m = s.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  const scores = {};
  for (const k of RUBRICA) {
    const v = Number(obj[k]);
    scores[k] = Number.isFinite(v) ? Math.min(5, Math.max(1, Math.round(v))) : null;
  }
  scores.tags = Array.isArray(obj.tags)
    ? obj.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()).slice(0, 6)
    : [];
  scores.veredicto = typeof obj.veredicto === 'string' ? obj.veredicto.trim().slice(0, 300) : null;
  const vals = RUBRICA.map((k) => scores[k]).filter((v) => v != null);
  scores.media = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
  return scores;
}

/** Judge a finished transcript with the rubric. */
async function judgeTranscript(transcript) {
  const texto = transcript
    .filter((t) => t.texto)
    .map((t) => `${t.who === 'lead' ? 'LEAD' : AGENT_NAME.toUpperCase()}: ${t.texto}`)
    .join('\n');
  try {
    await exigirOrcamentoLlm(); // exhausted budget reads as a judge failure (null)
    const resp = await getAI().messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      temperature: 0,
      system: JUDGE_SYSTEM,
      messages: [{ role: 'user', content: texto }],
    });
    const block = (resp.content || []).find((b) => b.type === 'text' && b.text);
    return parseJudgeText(block ? block.text : '');
  } catch (err) {
    logger.warn('judge failed (non-fatal):', err.message);
    return null;
  }
}

// ---- Paired judging (cycle-4 upgrade) --------------------------------------------
// Absolute 1-5 scoring proved noisy across rounds (the sim-lead runs at temp 0.9,
// so the same pack can swing ±1.4 on a scenario). Head-to-head comparison of two
// transcripts of the SAME scenario is far more stable: the judge sees both and
// picks a winner. Callers MUST randomize which version is labeled A vs B
// (position bias) and un-map afterwards.

const PAIRED_JUDGE_SYSTEM = [
  `Você compara DUAS versões da mesma vendedora (${AGENT_NAME}) conversando no`,
  `WhatsApp com o MESMO tipo de lead (cenário idêntico, conversas independentes).`,
  `Julgue SÓ as mensagens da ${AGENT_NAME.toUpperCase()} em cada transcript:`,
  `quem soa mais HUMANA (natural, sóbria, sem repetição, bolhas quando natural)`,
  `e conduz melhor a conversa (responde o que o lead disse, avança sem forçar,`,
  `trata objeção em vez de re-pitch)?`,
  ``,
  `Devolva SOMENTE um JSON:`,
  `{`,
  `  "vencedor": "A" | "B" | "empate",`,
  `  "margem": 1-3,        // 1 = por pouco, 3 = diferença gritante (0 se empate)`,
  `  "motivo": "..."       // 1-2 frases: o que decidiu`,
  `}`,
  `Empate SÓ quando genuinamente indistinguíveis. Responda APENAS o JSON.`,
].join('\n');

// Judge lenses (cycle-8 infra): near-tie packs saturate a single holistic
// judgment, so the evaluator votes 3× per pair — one vote per lens — and the
// majority decides. Diversity of criteria discriminates where redundancy can't.
const PAIRED_LENSES = {
  naturalidade: 'LENTE OBRIGATÓRIA — julgue SÓ por esta lente: quem soa mais HUMANA? Registro natural de WhatsApp, sem repetição nem tell de robô, bolhas quando natural, reação genuína ao que o lead acabou de dizer.',
  conducao: 'LENTE OBRIGATÓRIA — julgue SÓ por esta lente: quem CONDUZ melhor? Responde o que o lead perguntou, trata a objeção em vez de re-pitch, avança sem forçar, e fecha (agenda/próximo passo) quando o lead dá abertura.',
  correcao: 'LENTE OBRIGATÓRIA — julgue SÓ por esta lente: DISCIPLINA. Toda ação de ferramenta vem acompanhada de mensagem no mesmo turno (despedida, confirmação); nenhum número que o lead não deu é inventado ou estimado; pedido de parar é respeitado na hora; resposta técnica nunca é chutada.',
};

/** PURE: paired-judge text → {vencedor, margem, motivo} or null. */
function parsePairedText(text) {
  const s = String(text || '').trim();
  const m = s.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj;
  try { obj = JSON.parse(m[0]); } catch { return null; }
  const vencedor = ['A', 'B', 'empate'].includes(obj.vencedor) ? obj.vencedor : null;
  if (!vencedor) return null;
  const margem = Number.isFinite(Number(obj.margem))
    ? Math.min(3, Math.max(0, Math.round(Number(obj.margem))))
    : (vencedor === 'empate' ? 0 : 1);
  return {
    vencedor,
    margem: vencedor === 'empate' ? 0 : Math.max(1, margem),
    motivo: typeof obj.motivo === 'string' ? obj.motivo.trim().slice(0, 300) : null,
  };
}

function transcriptText(transcript) {
  return (transcript || [])
    .filter((t) => t.texto)
    .map((t) => `${t.who === 'lead' ? 'LEAD' : AGENT_NAME.toUpperCase()}: ${t.texto}`)
    .join('\n');
}

/**
 * Head-to-head judgment of two transcripts of the same scenario.
 * @param {string} scenarioDesc - short scenario description for context
 * @param {Array} transcriptA
 * @param {Array} transcriptB
 * @param {string|null} [lens] - optional PAIRED_LENSES key; narrows the judgment
 *   to one axis so a 3-lens majority vote can discriminate near-tie packs.
 * @returns {Promise<{vencedor:'A'|'B'|'empate', margem:number, motivo:string|null}|null>}
 */
async function judgePaired(scenarioDesc, transcriptA, transcriptB, lens = null) {
  const content = [
    `CENÁRIO: ${scenarioDesc}`,
    ``,
    `=== TRANSCRIPT A ===`,
    transcriptText(transcriptA),
    ``,
    `=== TRANSCRIPT B ===`,
    transcriptText(transcriptB),
  ].join('\n');
  const system = lens && PAIRED_LENSES[lens]
    ? `${PAIRED_JUDGE_SYSTEM}\n\n${PAIRED_LENSES[lens]}`
    : PAIRED_JUDGE_SYSTEM;
  try {
    await exigirOrcamentoLlm(); // exhausted budget reads as a judge failure (null)
    const resp = await getAI().messages.create({
      model: AI_MODEL,
      max_tokens: 250,
      temperature: 0,
      system,
      messages: [{ role: 'user', content }],
    });
    const block = (resp.content || []).find((b) => b.type === 'text' && b.text);
    return parsePairedText(block ? block.text : '');
  } catch (err) {
    logger.warn('paired judge failed (non-fatal):', err.message);
    return null;
  }
}

// ---- Orchestration + persistence -----------------------------------------------

async function listScenarios() {
  const { data, error } = await supabaseAdmin
    .from('prospect_sim_scenarios').select('*').eq('active', true).order('nome');
  if (error) { logger.error('listScenarios failed:', error.message); return []; }
  return data || [];
}

async function listRuns(scenarioId = null, limit = 30) {
  let q = supabaseAdmin.from('prospect_sim_runs')
    .select('id, scenario_id, style_version, scores, media, created_at')
    .order('created_at', { ascending: false }).limit(limit);
  if (scenarioId) q = q.eq('scenario_id', scenarioId);
  const { data, error } = await q;
  if (error) { logger.error('listRuns failed:', error.message); return []; }
  return data || [];
}

async function getRun(runId) {
  const { data, error } = await supabaseAdmin
    .from('prospect_sim_runs').select('*').eq('id', runId).single();
  return error ? null : data;
}

/**
 * Run + judge + persist one gym exercise.
 * @param {string} scenarioId
 * @param {{styleVersion?: number|null}} [opts] - a specific pack version to test
 *   (loads its body as override); default = whatever is active in production.
 */
async function runGymExercise(scenarioId, { styleVersion = null } = {}) {
  const { data: scenario, error } = await supabaseAdmin
    .from('prospect_sim_scenarios').select('*').eq('id', scenarioId).single();
  if (error || !scenario) return { ok: false, error: 'scenario_not_found' };

  let styleOverride;
  let usedVersion = null;
  if (styleVersion != null) {
    const { data: pack } = await supabaseAdmin
      .from('prospect_style_pack').select('version, body').eq('version', styleVersion).maybeSingle();
    if (!pack) return { ok: false, error: 'style_version_not_found' };
    styleOverride = pack.body;
    usedVersion = pack.version;
  } else {
    const { data: active } = await supabaseAdmin
      .from('prospect_style_pack').select('version').eq('active', true).maybeSingle();
    usedVersion = active ? active.version : null;
  }

  const { transcript, terminal } = await runSimulation(scenario, { styleOverride });
  const scores = await judgeTranscript(transcript);

  const { data: saved, error: insErr } = await supabaseAdmin.from('prospect_sim_runs').insert({
    scenario_id: scenario.id,
    style_version: usedVersion,
    transcript,
    scores,
    media: scores ? scores.media : null,
  }).select('id').single();
  if (insErr) logger.error('sim run insert failed:', insErr.message);

  logger.info(`gym run scenario=${scenario.nome} style=v${usedVersion ?? '-'} media=${scores ? scores.media : '—'} terminal=${terminal || '—'}`);
  return { ok: true, runId: saved ? saved.id : null, transcript, scores, terminal, styleVersion: usedVersion };
}

module.exports = {
  INTRO_PREVIEW,
  simLeadSystem,
  runSimulation,
  parseJudgeText,
  judgeTranscript,
  parsePairedText,
  judgePaired,
  PAIRED_LENSES,
  runGymExercise,
  listScenarios,
  listRuns,
  getRun,
  RUBRICA,
};
