'use strict';

/**
 * Harness de treino da Olímpia — eval de conversas reais com juiz forte.
 *
 * "Treinar" aqui não é fine-tuning: é o loop medir → mudar → medir. Este script
 * é o MEDIR: um juiz (Opus 5) audita cada thread real contra uma rubrica, e uma
 * síntese (Fable 5) propõe o menor conjunto de mudanças de persona/template com
 * maior impacto — cada uma com recibo (quais threads a sustentam).
 *
 * Roda OFFLINE (máquina do operador), nunca em produção. Provedor: OpenRouter
 * (mesma conta que paga o agente ao vivo) até a chave de créditos do fundador
 * ser identificada; os slugs anthropic/claude-opus-5 e claude-fable-5 existem
 * lá (verificado 31/07).
 *
 * Saídas:
 *   .claude/plans/2026-07-31-olimpia-foco-total/eval-NNN-relatorio.md
 *   .claude/plans/2026-07-31-olimpia-foco-total/eval-NNN-sintese.md
 *   <scratchpad ou --out>/eval-NNN.json (bruto, pro próximo ciclo comparar)
 *
 * Uso: node scripts/olimpia-eval.js [--max 25] [--no-sintese] [--seq NNN]
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const PLANOS = path.join(REPO, '.claude', 'plans', '2026-07-31-olimpia-foco-total');

// ---------------------------------------------------------------- env & args
function envVal(file, key) {
  try {
    const txt = fs.readFileSync(path.join(REPO, file), 'utf8');
    const line = txt.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
    const v = line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : null;
    return v && v !== '[SENSITIVE]' ? v : null;
  } catch { return null; }
}

const SURL = envVal('.env.production.local', 'SUPABASE_URL') || envVal('.env.local', 'SUPABASE_URL');
const SRK = envVal('.env.production.local', 'SUPABASE_SERVICE_ROLE_KEY');
const OR_KEY = envVal('.env.local', 'OPENROUTER_API_KEY') || envVal('.env.production.local', 'OPENROUTER_API_KEY');
if (!SURL || !SRK) { console.error('faltam SUPABASE_URL / SERVICE_ROLE_KEY'); process.exit(1); }
if (!OR_KEY) { console.error('falta OPENROUTER_API_KEY'); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n, dflt) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : dflt;
};
const MAX_THREADS = parseInt(flag('max', '25'), 10) || 25;
const FAZER_SINTESE = !args.includes('--no-sintese');
const SEQ = String(flag('seq', '001')).padStart(3, '0');
const OUT_JSON_DIR = flag('out', process.env.TEMP || REPO);

const JUIZ_MODEL = flag('juiz', 'anthropic/claude-opus-5');
const SINTESE_MODEL = flag('sintese', 'anthropic/claude-fable-5');

// Predicados reais do produto (puros). Se o require explodir por ambiente,
// seguimos sem as flags — o juiz avalia mesmo assim.
let preds = null;
try { preds = require('../api/_lib/prospecting/prospect-state'); } catch { preds = null; }

// ---------------------------------------------------------------- supabase
async function sb(pathQ) {
  const r = await fetch(`${SURL}/rest/v1/${pathQ}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  if (!r.ok) throw new Error(`supabase ${r.status} em ${pathQ.split('?')[0]}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ---------------------------------------------------------------- openrouter
// stream:true sempre: a síntese no Fable pode pensar por minutos antes do
// primeiro byte, e o undici do Node derruba conexão não-streaming em ~5min de
// espera por headers (UND_ERR_HEADERS_TIMEOUT).
async function llm({ model, system, user, maxTokens }) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: true, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const data = t.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const d = JSON.parse(data)?.choices?.[0]?.delta?.content;
        if (d) out += d;
      } catch { /* keepalive/comentário SSE — ignorar é correto */ }
    }
  }
  return out.trim();
}

/** Extrai o primeiro objeto JSON de um texto (tolerante a cercas ```json). */
function extrairJson(texto) {
  const sem = texto.replace(/```json/gi, '```').replace(/```/g, '');
  const ini = sem.indexOf('{');
  if (ini < 0) throw new Error('sem JSON na resposta');
  let prof = 0;
  for (let i = ini; i < sem.length; i++) {
    if (sem[i] === '{') prof++;
    else if (sem[i] === '}') { prof--; if (prof === 0) return JSON.parse(sem.slice(ini, i + 1)); }
  }
  throw new Error('JSON não fecha');
}

// ---------------------------------------------------------------- corpus
async function montarCorpus() {
  const [msgs, templates] = await Promise.all([
    sb('prospect_messages?select=lead_id,direcao,tipo,corpo,created_at&order=created_at&limit=4000'),
    sb('prospect_templates?select=meta_template_name,variant_label,touch_number,body_preview'),
  ]);
  const bodyPorNome = {};
  for (const t of templates) if (t.body_preview) bodyPorNome[t.meta_template_name] = t.body_preview;

  const porLead = {};
  for (const m of msgs) (porLead[m.lead_id] ||= []).push(m);

  const idsComInbound = Object.keys(porLead)
    .filter((id) => porLead[id].some((m) => m.direcao === 'in'));
  if (!idsComInbound.length) return { threads: [], bodyPorNome };

  const leads = [];
  for (let i = 0; i < idsComInbound.length; i += 40) {
    const fatia = idsComInbound.slice(i, i + 40).join(',');
    leads.push(...await sb(
      `prospect_leads?select=id,name,city,sector,rating,reviews_count,prospect_state,intro_variant,touch_count,owner_name&id=in.(${fatia})`,
    ));
  }
  const leadPorId = Object.fromEntries(leads.map((l) => [l.id, l]));

  const threads = idsComInbound
    .map((id) => {
      const lead = leadPorId[id];
      if (!lead) return null;
      const conversa = porLead[id];
      const ultima = conversa[conversa.length - 1].created_at;
      return { lead, conversa, ultima };
    })
    .filter(Boolean)
    .sort((a, b) => (a.ultima < b.ultima ? 1 : -1))
    .slice(0, MAX_THREADS);

  for (const t of threads) {
    t.flags = {
      ecoDeMaquina: preds ? preds.ecoDeMaquina(t.conversa) : null,
      semHumanoNaThread: preds ? preds.semHumanoNaThread(t.conversa) : null,
    };
    t.transcricao = t.conversa.map((m) => {
      const hora = new Date(m.created_at).toISOString().slice(5, 16).replace('T', ' ');
      let corpo = (m.corpo || `[${m.tipo || 'mídia'} sem texto]`).trim();
      const tpl = corpo.match(/^\[template:([\w-]+)\]$/);
      if (tpl) corpo = bodyPorNome[tpl[1]]
        ? `(template ${tpl[1]}) ${bodyPorNome[tpl[1]]}`
        : `(template ${tpl[1]} — corpo não registrado)`;
      const quem = m.direcao === 'in' ? 'LEAD' : 'OLÍMPIA';
      return `[${hora}] ${quem}: ${corpo}`;
    }).join('\n');
  }
  return { threads, bodyPorNome };
}

// ---------------------------------------------------------------- juiz
const RUBRICA = `Você é auditor sênior de qualidade de uma SDR por WhatsApp chamada Olímpia.

CONTEXTO ESTRUTURAL (verdade do sistema, use ao julgar):
- LINHA DO TEMPO DE PRODUTO (importante — os timestamps estão na transcrição):
  até 22/07 a Olímpia vendia SEATABLE (reservas por IA); de 22/07 em diante
  vende RACHA (pagar a conta na mesa pelo QR, cada um a sua parte; prévia
  self-service em ~10s; fundador solo — NUNCA propor call/reunião).
- COERÊNCIA se julga DENTRO da thread e da sua época: a história que ELA contou
  se sustenta? Transições de assunto têm ponte? Uma thread inteira de reservas
  em julho-início é coerente; virar de reservas pra "dividir a conta" SEM ponte
  (threads pós-22/07, cujas intros ainda são template Seatable) é o defeito
  estrutural conhecido — registre como ela LIDOU com ele (ponte? ignorou?).
- Threads podem ser 100% robô do outro lado (autoatendimento). Nesses casos o
  certo é parar de vender e pedir o decisor — nunca fazer pitch pra máquina.

Avalie a conversa e responda APENAS com JSON válido neste formato:
{
  "interlocutor": "humano" | "bot" | "misto" | "sem_resposta_avaliavel",
  "notas": {
    "coerencia_produto": {"nota": 1-5 ou null, "evidencia": "citação curta"},
    "atende_o_lead":     {"nota": 1-5 ou null, "evidencia": "..."},
    "naturalidade":      {"nota": 1-5 ou null, "evidencia": "..."},
    "objetivo_do_turno": {"nota": 1-5 ou null, "evidencia": "..."},
    "deteccao_maquina":  {"nota": 1-5 ou null, "evidencia": "..."},
    "respeito_recusa":   {"nota": 1-5 ou null, "evidencia": "..."}
  },
  "pior_turno": {"texto": "turno da OLÍMPIA citado literal", "problema": "...", "reescrita": "como deveria ser"} ou null,
  "mudancas_de_prompt": ["mudança GENERALIZÁVEL de persona/template que evitaria os problemas", ...],
  "resumo": "uma frase"
}
Notas: 5=exemplar, 3=aceitável, 1=dano à marca. null = dimensão não se aplica
nesta thread. Seja duro: nota alta precisa ser merecida. pior_turno só de
mensagens da OLÍMPIA (nunca template — template não é decisão dela).`;

async function julgar(t) {
  const user = [
    `LEAD: ${t.lead.name}${t.lead.city ? ` (${t.lead.city})` : ''} — estado atual: ${t.lead.prospect_state}, variante de intro: ${t.lead.intro_variant || '?'}, toques: ${t.lead.touch_count}`,
    t.flags.ecoDeMaquina !== null
      ? `FLAGS DETERMINÍSTICAS DO SISTEMA: ecoDeMaquina=${t.flags.ecoDeMaquina}, semHumanoNaThread=${t.flags.semHumanoNaThread} (compare com seu veredito de interlocutor)`
      : null,
    '',
    'TRANSCRIÇÃO (out=OLÍMPIA, in=LEAD):',
    t.transcricao,
  ].filter((x) => x !== null).join('\n');

  const bruto = await llm({ model: JUIZ_MODEL, system: RUBRICA, user, maxTokens: 6000 });
  try { return extrairJson(bruto); } catch (e) {
    // Uma repescagem: pede só o JSON de novo.
    const retry = await llm({
      model: JUIZ_MODEL, system: RUBRICA,
      user: `${user}\n\nSua resposta anterior não era JSON válido (${e.message}). Responda APENAS o JSON.`,
      maxTokens: 6000,
    });
    return extrairJson(retry);
  }
}

// ---------------------------------------------------------------- síntese
async function sintetizar(julgados, bodyPorNome) {
  const fontes = ['api/_lib/prospecting/prospect-agent.js', 'api/_lib/prospecting/prospect-product.js']
    .map((f) => `===== ${f} =====\n${fs.readFileSync(path.join(REPO, f), 'utf8')}`)
    .join('\n\n');
  const escada = Object.entries(bodyPorNome).map(([n, b]) => `--- ${n}\n${b}`).join('\n\n');

  const system = `Você é head de vendas + engenharia de prompt do time da Olímpia (SDR WhatsApp).
Recebe: (1) auditorias JSON de conversas reais feitas por um juiz, (2) o código-fonte
REAL da persona (prompt do sistema e perfis de produto), (3) os templates aprovados.
Proponha o MENOR conjunto de mudanças de MAIOR impacto — máximo 5 — em markdown:

## Mudança N — <título>
- **Problema** (com contagem: em quantas das auditorias aparece)
- **Onde**: persona (prospect-agent.js) | perfil (prospect-product.js) | style pack (DB) | template (Meta) | modelo/infra
- **Trecho atual**: citação EXATA do fonte/template (ou "ausente")
- **Proposta**: o texto novo (diff antes→depois)
- **Risco/efeito colateral**: uma linha

Regras: mudanças generalizáveis (nunca específicas de um lead); respeite as
invariantes anti-invenção existentes; a persona Racha NÃO marca call. Feche com
uma seção "## O que NÃO mudar" (o que os dados mostram que já funciona).`;

  const user = [
    `AUDITORIAS (${julgados.length} threads):`,
    JSON.stringify(julgados, null, 1),
    '',
    'TEMPLATES APROVADOS:',
    escada,
    '',
    'FONTES:',
    fontes,
  ].join('\n');

  return llm({ model: SINTESE_MODEL, system, user, maxTokens: 14000 });
}

// ---------------------------------------------------------------- relatório
function media(julgados, dim) {
  const ns = julgados.map((j) => j.julgamento?.notas?.[dim]?.nota).filter((n) => Number.isFinite(n));
  return ns.length ? (ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(2) : '—';
}

async function main() {
  console.log(`corpus: montando (máx ${MAX_THREADS} threads)…`);
  const { threads, bodyPorNome } = await montarCorpus();
  console.log(`corpus: ${threads.length} threads com inbound\n`);

  const hig = threads.find((t) => /Higien/i.test(t.lead.name));
  if (hig) {
    console.log(`>>> Higienópolis (parqueada por engano de filtro): semHumanoNaThread=${hig.flags.semHumanoNaThread} — ${hig.flags.semHumanoNaThread === false ? 'TEM humano: REVERTER pra conversando' : 'só robô: porteiro correto'}\n`);
  }

  const julgados = [];
  const LOTE = 3;
  for (let i = 0; i < threads.length; i += LOTE) {
    const fatia = threads.slice(i, i + LOTE);
    const rs = await Promise.all(fatia.map(async (t) => {
      try {
        const julgamento = await julgar(t);
        console.log(`  ✓ ${t.lead.name.slice(0, 40).padEnd(42)} interloc=${julgamento.interlocutor.padEnd(10)} ${julgamento.resumo?.slice(0, 70) || ''}`);
        return { lead: t.lead.name, estado: t.lead.prospect_state, variante: t.lead.intro_variant, flags: t.flags, julgamento };
      } catch (e) {
        console.log(`  ✗ ${t.lead.name.slice(0, 40)} — ${e.message.slice(0, 80)}`);
        return { lead: t.lead.name, erro: e.message };
      }
    }));
    julgados.push(...rs);
  }

  const ok = julgados.filter((j) => j.julgamento);
  const dims = ['coerencia_produto', 'atende_o_lead', 'naturalidade', 'objetivo_do_turno', 'deteccao_maquina', 'respeito_recusa'];

  const relatorio = [
    `# Eval ${SEQ} — Olímpia (${new Date().toISOString().slice(0, 10)})`,
    '',
    `Juiz: ${JUIZ_MODEL} · ${ok.length}/${julgados.length} threads auditadas`,
    '',
    '## Médias por dimensão (1-5)',
    '',
    '| dimensão | média |',
    '|---|---|',
    ...dims.map((d) => `| ${d} | ${media(ok, d)} |`),
    '',
    '## Por thread',
    '',
    ...ok.map((j) => [
      `### ${j.lead} — ${j.julgamento.interlocutor} (estado ${j.estado}, variante ${j.variante || '?'})`,
      `${j.julgamento.resumo || ''}`,
      j.julgamento.pior_turno
        ? `- **Pior turno**: "${j.julgamento.pior_turno.texto}"\n- **Problema**: ${j.julgamento.pior_turno.problema}\n- **Reescrita**: "${j.julgamento.pior_turno.reescrita}"`
        : '- Sem turno ruim apontado.',
      j.julgamento.mudancas_de_prompt?.length
        ? `- Mudanças sugeridas: ${j.julgamento.mudancas_de_prompt.join(' · ')}`
        : '',
      '',
    ].join('\n')),
  ].join('\n');

  fs.mkdirSync(PLANOS, { recursive: true });
  const relPath = path.join(PLANOS, `eval-${SEQ}-relatorio.md`);
  fs.writeFileSync(relPath, relatorio, 'utf8');
  const jsonPath = path.join(OUT_JSON_DIR, `eval-${SEQ}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(julgados, null, 2), 'utf8');
  console.log(`\nrelatório: ${relPath}`);
  console.log(`bruto:     ${jsonPath}`);

  if (FAZER_SINTESE && ok.length) {
    console.log(`\nsíntese (${SINTESE_MODEL})…`);
    const sintese = await sintetizar(ok, bodyPorNome);
    const sinPath = path.join(PLANOS, `eval-${SEQ}-sintese.md`);
    fs.writeFileSync(sinPath, `# Síntese eval ${SEQ} — mudanças propostas\n\nModelo: ${SINTESE_MODEL}\n\n${sintese}\n`, 'utf8');
    console.log(`síntese:   ${sinPath}`);
  }

  console.log('\n== médias ==');
  for (const d of dims) console.log(`  ${d.padEnd(20)} ${media(ok, d)}`);
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
